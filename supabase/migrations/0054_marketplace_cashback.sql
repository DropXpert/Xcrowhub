-- 0054: abuse-resistant marketplace cashback scratch cards.
--
-- A reward is created only when the authenticated buyer reveals the card for
-- a released NIM marketplace deal. The result is stored before any payout is
-- attempted, so refreshes and concurrent requests cannot reroll or double-pay.

create table if not exists public.cashback_campaigns (
  id                    text primary key,
  active                boolean not null default true,
  budget_nim            numeric(20, 5) not null check (budget_nim >= 0),
  awarded_nim           numeric(20, 5) not null default 0 check (awarded_nim >= 0),
  daily_wallet_cap_nim  numeric(20, 5) not null default 25 check (daily_wallet_cap_nim > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint cashback_campaign_budget_check check (awarded_nim <= budget_nim)
);

insert into public.cashback_campaigns (
  id, active, budget_nim, awarded_nim, daily_wallet_cap_nim
) values (
  'marketplace-v1', true, 10000, 0, 25
) on conflict (id) do update
  set budget_nim = 10000,
      updated_at = now();

create table if not exists public.deal_cashback_rewards (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      text not null references public.cashback_campaigns(id) on delete restrict,
  deal_id           text not null unique references public.deals(id) on delete restrict,
  wallet_address    text not null,
  wallet_norm       text not null,
  amount_nim        numeric(20, 5) not null check (amount_nim >= 0),
  revealed_at       timestamptz not null default now(),
  payout_status     text not null default 'pending'
    check (payout_status in ('not_applicable', 'pending', 'paid')),
  payout_tx_hash    text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint deal_cashback_reward_payout_check check (
    (amount_nim = 0 and payout_status = 'not_applicable' and payout_tx_hash is null and paid_at is null)
    or
    (amount_nim > 0 and payout_status = 'pending' and payout_tx_hash is null and paid_at is null)
    or
    (amount_nim > 0 and payout_status = 'paid' and payout_tx_hash is not null and paid_at is not null)
  )
);

create index if not exists idx_deal_cashback_rewards_wallet
  on public.deal_cashback_rewards(wallet_norm, revealed_at desc);
create index if not exists idx_deal_cashback_rewards_pending
  on public.deal_cashback_rewards(payout_status, created_at)
  where payout_status = 'pending';

alter table public.cashback_campaigns enable row level security;
alter table public.deal_cashback_rewards enable row level security;
revoke all on table public.cashback_campaigns from public, anon, authenticated;
revoke all on table public.deal_cashback_rewards from public, anon, authenticated;

-- Return the card state without creating a reward. The amount stays unknown
-- until reveal_deal_marketplace_cashback stores it.
create or replace function public.get_deal_marketplace_cashback(p_deal_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text := public.caller_addr();
  v_deal public.deals%rowtype;
  v_reward public.deal_cashback_rewards%rowtype;
  v_campaign public.cashback_campaigns%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if not found then raise exception 'Deal not found'; end if;

  if v_deal.buyer_wallet_address is null
     or not public.addr_eq(v_deal.buyer_wallet_address, v_caller) then
    return jsonb_build_object('eligible', false, 'reason', 'buyer_only');
  end if;
  if v_deal.status <> 'released' then
    return jsonb_build_object('eligible', false, 'reason', 'not_completed');
  end if;
  if v_deal.listing_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'marketplace_only');
  end if;
  if v_deal.price_currency <> 'NIM' then
    return jsonb_build_object('eligible', false, 'reason', 'nimiq_wallet_required');
  end if;
  if v_deal.release_tx_hash is null then
    return jsonb_build_object('eligible', false, 'reason', 'payout_pending');
  end if;
  if public.addr_eq(v_deal.buyer_wallet_address, v_deal.seller_wallet_address) then
    return jsonb_build_object('eligible', false, 'reason', 'self_deal');
  end if;

  select * into v_reward
  from public.deal_cashback_rewards
  where deal_id = v_deal.id;

  if found then
    return jsonb_build_object(
      'eligible', true,
      'revealed', true,
      'reward', jsonb_build_object(
        'id', v_reward.id,
        'deal_id', v_reward.deal_id,
        'amount_nim', v_reward.amount_nim,
        'revealed_at', v_reward.revealed_at,
        'payout_status', v_reward.payout_status,
        'payout_tx_hash', v_reward.payout_tx_hash,
        'paid_at', v_reward.paid_at
      )
    );
  end if;

  select * into v_campaign
  from public.cashback_campaigns
  where id = 'marketplace-v1';

  if not found or not v_campaign.active or v_campaign.awarded_nim >= v_campaign.budget_nim then
    return jsonb_build_object('eligible', false, 'reason', 'campaign_paused');
  end if;

  return jsonb_build_object('eligible', true, 'revealed', false, 'reward', null);
end;
$$;

-- Reveal exactly once. The first positive reward for a wallet is guaranteed
-- at 1 NIM; later cards use a weighted server-side result. A 25 NIM UTC-day
-- wallet cap and a locked campaign budget limit total exposure.
create or replace function public.reveal_deal_marketplace_cashback(p_deal_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text := public.caller_addr();
  v_wallet_norm text;
  v_deal public.deals%rowtype;
  v_campaign public.cashback_campaigns%rowtype;
  v_existing public.deal_cashback_rewards%rowtype;
  v_reward public.deal_cashback_rewards%rowtype;
  v_prior_positive integer := 0;
  v_daily_total numeric(20, 5) := 0;
  v_fee_pool_remaining numeric(20, 5) := 0;
  v_remaining numeric(20, 5) := 0;
  v_roll integer := 0;
  v_amount numeric(20, 5) := 0;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.buyer_wallet_address is null
     or not public.addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Only the buyer can reveal this reward';
  end if;
  if v_deal.status <> 'released' then raise exception 'Deal is not completed'; end if;
  if v_deal.listing_id is null then raise exception 'Only marketplace purchases are eligible'; end if;
  if v_deal.price_currency <> 'NIM' then raise exception 'Cashback currently requires a Nimiq wallet'; end if;
  if v_deal.release_tx_hash is null then raise exception 'Seller payout is not confirmed yet'; end if;
  if public.addr_eq(v_deal.buyer_wallet_address, v_deal.seller_wallet_address) then
    raise exception 'Self deals are not eligible';
  end if;

  v_wallet_norm := public.norm_addr(v_deal.buyer_wallet_address);
  select * into v_existing
  from public.deal_cashback_rewards
  where deal_id = v_deal.id;
  if found then
    return jsonb_build_object(
      'eligible', true,
      'already_revealed', true,
      'reward', jsonb_build_object(
        'id', v_existing.id,
        'deal_id', v_existing.deal_id,
        'amount_nim', v_existing.amount_nim,
        'revealed_at', v_existing.revealed_at,
        'payout_status', v_existing.payout_status,
        'payout_tx_hash', v_existing.payout_tx_hash,
        'paid_at', v_existing.paid_at
      )
    );
  end if;

  select * into v_campaign
  from public.cashback_campaigns
  where id = 'marketplace-v1'
  for update;
  if not found or not v_campaign.active or v_campaign.awarded_nim >= v_campaign.budget_nim then
    return jsonb_build_object('eligible', false, 'reason', 'campaign_paused');
  end if;

  select count(*)::integer into v_prior_positive
  from public.deal_cashback_rewards
  where wallet_norm = v_wallet_norm and amount_nim > 0;

  select coalesce(sum(amount_nim), 0) into v_daily_total
  from public.deal_cashback_rewards
  where wallet_norm = v_wallet_norm
    and revealed_at >= date_trunc('day', now());

  -- Cashback is funded only from already-realized NIM marketplace fees. This
  -- prevents the reward program from consuming principal held for open deals.
  select greatest(coalesce(sum(d.fee_amount), 0) - v_campaign.awarded_nim, 0)
  into v_fee_pool_remaining
  from public.deals d
  where d.status = 'released'
    and d.listing_id is not null
    and d.price_currency = 'NIM'
    and d.release_tx_hash is not null;

  v_remaining := least(
    v_campaign.budget_nim - v_campaign.awarded_nim,
    greatest(v_campaign.daily_wallet_cap_nim - v_daily_total, 0),
    v_fee_pool_remaining
  );

  if v_remaining > 0 then
    if v_prior_positive = 0 then
      v_amount := 1;
    else
      v_roll := floor(random() * 10000)::integer;
      v_amount := case
        when v_roll < 1500 then 0
        when v_roll < 8000 then 1
        when v_roll < 9500 then 2
        when v_roll < 9900 then 5
        else 25
      end;
    end if;
    v_amount := least(v_amount, v_remaining);
  end if;

  insert into public.deal_cashback_rewards (
    campaign_id, deal_id, wallet_address, wallet_norm, amount_nim, payout_status
  ) values (
    v_campaign.id,
    v_deal.id,
    trim(v_deal.buyer_wallet_address),
    v_wallet_norm,
    v_amount,
    case when v_amount > 0 then 'pending' else 'not_applicable' end
  ) returning * into v_reward;

  if v_amount > 0 then
    update public.cashback_campaigns
    set awarded_nim = awarded_nim + v_amount,
        updated_at = now()
    where id = v_campaign.id;
  end if;

  return jsonb_build_object(
    'eligible', true,
    'already_revealed', false,
    'reward', jsonb_build_object(
      'id', v_reward.id,
      'deal_id', v_reward.deal_id,
      'amount_nim', v_reward.amount_nim,
      'revealed_at', v_reward.revealed_at,
      'payout_status', v_reward.payout_status,
      'payout_tx_hash', v_reward.payout_tx_hash,
      'paid_at', v_reward.paid_at
    )
  );
end;
$$;

create or replace function public.get_my_marketplace_cashback()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text := public.caller_addr();
  v_wallet_norm text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  v_wallet_norm := public.norm_addr(v_caller);

  return jsonb_build_object(
    'total_earned_nim', coalesce((
      select sum(r.amount_nim) from public.deal_cashback_rewards r
      where r.wallet_norm = v_wallet_norm
    ), 0),
    'total_paid_nim', coalesce((
      select sum(r.amount_nim) from public.deal_cashback_rewards r
      where r.wallet_norm = v_wallet_norm and r.payout_status = 'paid'
    ), 0),
    'total_pending_nim', coalesce((
      select sum(r.amount_nim) from public.deal_cashback_rewards r
      where r.wallet_norm = v_wallet_norm and r.payout_status = 'pending'
    ), 0),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'deal_id', r.deal_id,
        'deal_title', d.title,
        'amount_nim', r.amount_nim,
        'revealed_at', r.revealed_at,
        'payout_status', r.payout_status,
        'payout_tx_hash', r.payout_tx_hash,
        'paid_at', r.paid_at
      ) order by r.revealed_at desc)
      from public.deal_cashback_rewards r
      join public.deals d on d.id = r.deal_id
      where r.wallet_norm = v_wallet_norm
    ), '[]'::jsonb),
    'unclaimed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deal_id', d.id,
        'deal_title', d.title,
        'released_at', d.released_at
      ) order by d.released_at desc)
      from public.deals d
      where d.status = 'released'
        and d.listing_id is not null
        and d.price_currency = 'NIM'
        and d.release_tx_hash is not null
        and public.norm_addr(d.buyer_wallet_address) = v_wallet_norm
        and not public.addr_eq(d.buyer_wallet_address, d.seller_wallet_address)
        and not exists (
          select 1 from public.deal_cashback_rewards r where r.deal_id = d.id
        )
        and exists (
          select 1 from public.cashback_campaigns c
          where c.id = 'marketplace-v1' and c.active and c.awarded_nim < c.budget_nim
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_deal_marketplace_cashback(text) from public, anon;
revoke all on function public.reveal_deal_marketplace_cashback(text) from public, anon;
revoke all on function public.get_my_marketplace_cashback() from public, anon;
grant execute on function public.get_deal_marketplace_cashback(text) to authenticated;
grant execute on function public.reveal_deal_marketplace_cashback(text) to authenticated;
grant execute on function public.get_my_marketplace_cashback() to authenticated;

-- Extend the existing exactly-once payout ledger with cashback as a first-class
-- economic subject. Existing payout function signatures remain available for
-- older workers; the new worker uses the overload below.
alter table public.payout_intents
  add column if not exists deal_cashback_reward_id uuid
    references public.deal_cashback_rewards(id) on delete restrict;

alter table public.payout_intents drop constraint if exists payout_intents_subject_check;
alter table public.payout_intents drop constraint if exists payout_intents_subject_kind_check;
alter table public.payout_intents drop constraint if exists payout_intents_payout_kind_check;

alter table public.payout_intents
  add constraint payout_intents_subject_kind_check
    check (subject_kind in ('deal', 'referral_claim', 'campaign_coupon', 'deal_cashback')),
  add constraint payout_intents_payout_kind_check
    check (payout_kind in (
      'release', 'refund', 'partial_seller', 'partial_buyer',
      'referral', 'campaign_coupon', 'cashback'
    )),
  add constraint payout_intents_subject_check check (
    (subject_kind = 'deal'
      and deal_id is not null
      and referral_claim_id is null
      and campaign_coupon_claim_id is null
      and deal_cashback_reward_id is null
      and payout_kind not in ('referral', 'campaign_coupon', 'cashback'))
    or
    (subject_kind = 'referral_claim'
      and deal_id is null
      and referral_claim_id is not null
      and campaign_coupon_claim_id is null
      and deal_cashback_reward_id is null
      and payout_kind = 'referral')
    or
    (subject_kind = 'campaign_coupon'
      and deal_id is null
      and referral_claim_id is null
      and campaign_coupon_claim_id is not null
      and deal_cashback_reward_id is null
      and payout_kind = 'campaign_coupon')
    or
    (subject_kind = 'deal_cashback'
      and deal_id is null
      and referral_claim_id is null
      and campaign_coupon_claim_id is null
      and deal_cashback_reward_id is not null
      and payout_kind = 'cashback')
  );

create unique index if not exists idx_payout_intents_deal_cashback
  on public.payout_intents(deal_cashback_reward_id)
  where deal_cashback_reward_id is not null;

create or replace function public.claim_payout_intent(
  p_payout_key text,
  p_subject_kind text,
  p_payout_kind text,
  p_deal_id text,
  p_referral_claim_id text,
  p_campaign_coupon_claim_id uuid,
  p_deal_cashback_reward_id uuid,
  p_network tx_network,
  p_currency currency,
  p_recipient text,
  p_amount numeric,
  p_fee_amount numeric,
  p_fee_bps integer,
  p_lease_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v payout_intents%rowtype;
  v_acquired boolean := false;
begin
  if nullif(trim(p_payout_key), '') is null or length(p_payout_key) > 240 then
    raise exception 'Invalid payout key';
  end if;
  if nullif(trim(p_lease_token), '') is null then raise exception 'Invalid payout lease token'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payout amount must be positive'; end if;
  if p_fee_amount is null or p_fee_amount < 0
     or p_fee_bps is null or p_fee_bps < 0 or p_fee_bps >= 10000 then
    raise exception 'Invalid payout fee';
  end if;

  insert into payout_intents (
    payout_key, subject_kind, payout_kind, deal_id, referral_claim_id,
    campaign_coupon_claim_id, deal_cashback_reward_id, network, currency,
    recipient, amount, fee_amount, fee_bps, lease_token, lease_expires_at
  ) values (
    p_payout_key, p_subject_kind, p_payout_kind, p_deal_id, p_referral_claim_id,
    p_campaign_coupon_claim_id, p_deal_cashback_reward_id, p_network, p_currency,
    p_recipient, p_amount, p_fee_amount, p_fee_bps, p_lease_token,
    now() + interval '3 minutes'
  ) on conflict (payout_key) do nothing;

  select * into v from payout_intents where payout_key = p_payout_key for update;
  if not found then raise exception 'Could not create payout intent'; end if;

  if v.subject_kind is distinct from p_subject_kind
     or v.payout_kind is distinct from p_payout_kind
     or v.deal_id is distinct from p_deal_id
     or v.referral_claim_id is distinct from p_referral_claim_id
     or v.campaign_coupon_claim_id is distinct from p_campaign_coupon_claim_id
     or v.deal_cashback_reward_id is distinct from p_deal_cashback_reward_id
     or v.network is distinct from p_network
     or v.currency is distinct from p_currency
     or public.norm_addr(v.recipient) is distinct from public.norm_addr(p_recipient)
     or v.amount is distinct from p_amount
     or v.fee_amount is distinct from p_fee_amount
     or v.fee_bps is distinct from p_fee_bps then
    raise exception 'Payout key collision with different parameters';
  end if;

  if v.status = 'broadcast' then
    return jsonb_build_object(
      'acquired', false, 'status', v.status, 'tx_hash', v.tx_hash,
      'payout_key', v.payout_key
    );
  end if;

  if v.lease_token = p_lease_token then
    v_acquired := true;
  elsif v.lease_expires_at is null or v.lease_expires_at <= now() then
    update payout_intents
    set lease_token = p_lease_token,
        lease_expires_at = now() + interval '3 minutes',
        attempt_count = attempt_count + 1,
        last_error = null,
        updated_at = now()
    where payout_key = p_payout_key
    returning * into v;
    v_acquired := true;
  end if;

  return jsonb_build_object(
    'acquired', v_acquired, 'status', v.status, 'tx_hash', v.tx_hash,
    'payout_key', v.payout_key, 'lease_expires_at', v.lease_expires_at
  );
end;
$$;

create or replace function public.complete_payout_intent(
  p_payout_key text,
  p_lease_token text,
  p_tx_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.payout_intents%rowtype;
  v_existing_hash text;
  v_reward_deal_id text;
begin
  if nullif(trim(p_tx_hash), '') is null then raise exception 'Missing payout tx hash'; end if;

  select * into v from public.payout_intents where payout_key = p_payout_key for update;
  if not found then raise exception 'Payout intent not found'; end if;
  if v.status = 'broadcast' then
    if v.tx_hash is distinct from p_tx_hash then
      raise exception 'Payout already completed with a different tx hash';
    end if;
    return jsonb_build_object('tx_hash', v.tx_hash, 'idempotent', true);
  end if;
  if v.lease_token is distinct from p_lease_token then raise exception 'Payout lease lost'; end if;

  if v.subject_kind = 'deal' then
    if v.payout_kind in ('release', 'partial_seller') then
      select release_tx_hash into v_existing_hash from public.deals where id = v.deal_id for update;
      if not found then raise exception 'Deal not found during payout completion'; end if;
      if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
        raise exception 'Deal release already has a different tx hash';
      end if;
      update public.deals set release_tx_hash = p_tx_hash,
        fee_amount = case when v.payout_kind = 'release' then v.fee_amount else fee_amount end,
        fee_bps = case when v.payout_kind = 'release' then v.fee_bps else fee_bps end
      where id = v.deal_id;
    else
      select refund_tx_hash into v_existing_hash from public.deals where id = v.deal_id for update;
      if not found then raise exception 'Deal not found during payout completion'; end if;
      if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
        raise exception 'Deal refund already has a different tx hash';
      end if;
      update public.deals set refund_tx_hash = p_tx_hash where id = v.deal_id;
    end if;

    insert into public.transactions (
      id, deal_id, direction, network, amount, currency,
      from_addr, to_addr, tx_hash, status, payout_key
    ) values (
      gen_random_uuid()::text, v.deal_id, 'out', v.network, v.amount, v.currency,
      'CUSTODY', v.recipient, p_tx_hash, 'broadcast', v.payout_key
    ) on conflict do nothing;
  elsif v.subject_kind = 'referral_claim' then
    select tx_hash into v_existing_hash
    from public.referral_claims where id = v.referral_claim_id for update;
    if not found then raise exception 'Referral claim not found during payout completion'; end if;
    if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
      raise exception 'Referral claim already has a different tx hash';
    end if;
    update public.referral_claims
    set status = 'paid', tx_hash = p_tx_hash, paid_at = coalesce(paid_at, now())
    where id = v.referral_claim_id;
  elsif v.subject_kind = 'campaign_coupon' then
    select payout_tx_hash into v_existing_hash
    from public.campaign_coupon_claims where id = v.campaign_coupon_claim_id for update;
    if not found then raise exception 'Campaign coupon claim not found during payout completion'; end if;
    if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
      raise exception 'Campaign coupon payout already has a different tx hash';
    end if;
    update public.campaign_coupon_claims
    set payout_status = 'paid', payout_tx_hash = p_tx_hash, paid_at = coalesce(paid_at, now())
    where id = v.campaign_coupon_claim_id;
    insert into public.transactions (
      id, deal_id, direction, network, amount, currency,
      from_addr, to_addr, tx_hash, status, payout_key
    ) values (
      gen_random_uuid()::text, null, 'out', v.network, v.amount, v.currency,
      'CUSTODY', v.recipient, p_tx_hash, 'broadcast', v.payout_key
    ) on conflict do nothing;
  elsif v.subject_kind = 'deal_cashback' then
    select payout_tx_hash, deal_id into v_existing_hash, v_reward_deal_id
    from public.deal_cashback_rewards
    where id = v.deal_cashback_reward_id
    for update;
    if not found then raise exception 'Cashback reward not found during payout completion'; end if;
    if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
      raise exception 'Cashback reward already has a different tx hash';
    end if;
    update public.deal_cashback_rewards
    set payout_status = 'paid', payout_tx_hash = p_tx_hash,
        paid_at = coalesce(paid_at, now()), updated_at = now()
    where id = v.deal_cashback_reward_id;
    insert into public.transactions (
      id, deal_id, direction, network, amount, currency,
      from_addr, to_addr, tx_hash, status, payout_key
    ) values (
      gen_random_uuid()::text, v_reward_deal_id, 'out', v.network, v.amount, v.currency,
      'CUSTODY', v.recipient, p_tx_hash, 'broadcast', v.payout_key
    ) on conflict do nothing;
  else
    raise exception 'Unsupported payout subject';
  end if;

  update public.payout_intents
  set status = 'broadcast', tx_hash = p_tx_hash, broadcast_at = now(),
      lease_token = null, lease_expires_at = null, last_error = null, updated_at = now()
  where payout_key = p_payout_key;
  return jsonb_build_object('tx_hash', p_tx_hash, 'idempotent', false);
end;
$$;

revoke all on function public.claim_payout_intent(
  text, text, text, text, text, uuid, uuid, tx_network, currency,
  text, numeric, numeric, integer, text
) from public, anon, authenticated;
grant execute on function public.claim_payout_intent(
  text, text, text, text, text, uuid, uuid, tx_network, currency,
  text, numeric, numeric, integer, text
) to service_role;
revoke all on function public.complete_payout_intent(text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_payout_intent(text, text, text)
  to service_role;
