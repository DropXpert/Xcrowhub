-- 0045: pay a claimed campaign coupon through the custody signer

alter table public.campaign_coupon_claims
  add column if not exists payout_status text not null default 'pending'
    check (payout_status in ('pending', 'paid')),
  add column if not exists payout_tx_hash text,
  add column if not exists paid_at timestamptz;

alter table public.payout_intents
  add column if not exists campaign_coupon_claim_id uuid
    references public.campaign_coupon_claims(id) on delete restrict;

alter table public.payout_intents
  drop constraint if exists payout_intents_subject_check;

alter table public.payout_intents
  add constraint payout_intents_subject_check check (
    (subject_kind = 'deal'
      and deal_id is not null
      and referral_claim_id is null
      and campaign_coupon_claim_id is null
      and payout_kind <> 'referral')
    or
    (subject_kind = 'referral_claim'
      and deal_id is null
      and referral_claim_id is not null
      and campaign_coupon_claim_id is null
      and payout_kind = 'referral')
    or
    (subject_kind = 'campaign_coupon'
      and deal_id is null
      and referral_claim_id is null
      and campaign_coupon_claim_id is not null
      and payout_kind = 'campaign_coupon')
  );

alter table public.payout_intents
  drop constraint if exists payout_intents_subject_kind_check;
alter table public.payout_intents
  drop constraint if exists payout_intents_payout_kind_check;

alter table public.payout_intents
  add constraint payout_intents_subject_kind_check
    check (subject_kind in ('deal', 'referral_claim', 'campaign_coupon')),
  add constraint payout_intents_payout_kind_check
    check (payout_kind in (
      'release', 'refund', 'partial_seller', 'partial_buyer',
      'referral', 'campaign_coupon'
    ));

create unique index if not exists idx_payout_intents_campaign_coupon
  on public.payout_intents(campaign_coupon_claim_id)
  where campaign_coupon_claim_id is not null;

-- Non-deal payouts still need a custody ledger row, so deal_id is nullable for
-- this new economic flow. Existing deal rows remain unchanged.
alter table public.transactions alter column deal_id drop not null;

-- New overload includes the campaign coupon claim reference. The old function
-- signature remains for backwards compatibility with older deployed workers.
create or replace function public.claim_payout_intent(
  p_payout_key text,
  p_subject_kind text,
  p_payout_kind text,
  p_deal_id text,
  p_referral_claim_id text,
  p_campaign_coupon_claim_id uuid,
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
  if nullif(trim(p_lease_token), '') is null then
    raise exception 'Invalid payout lease token';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payout amount must be positive';
  end if;
  if p_fee_amount is null or p_fee_amount < 0
     or p_fee_bps is null or p_fee_bps < 0 or p_fee_bps >= 10000 then
    raise exception 'Invalid payout fee';
  end if;

  insert into payout_intents (
    payout_key, subject_kind, payout_kind, deal_id, referral_claim_id,
    campaign_coupon_claim_id, network, currency, recipient, amount,
    fee_amount, fee_bps, lease_token, lease_expires_at
  ) values (
    p_payout_key, p_subject_kind, p_payout_kind, p_deal_id, p_referral_claim_id,
    p_campaign_coupon_claim_id, p_network, p_currency, p_recipient, p_amount,
    p_fee_amount, p_fee_bps, p_lease_token, now() + interval '3 minutes'
  ) on conflict (payout_key) do nothing;

  select * into v from payout_intents where payout_key = p_payout_key for update;
  if not found then raise exception 'Could not create payout intent'; end if;

  if v.subject_kind is distinct from p_subject_kind
     or v.payout_kind is distinct from p_payout_kind
     or v.deal_id is distinct from p_deal_id
     or v.referral_claim_id is distinct from p_referral_claim_id
     or v.campaign_coupon_claim_id is distinct from p_campaign_coupon_claim_id
     or v.network is distinct from p_network
     or v.currency is distinct from p_currency
     or norm_addr(v.recipient) is distinct from norm_addr(p_recipient)
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

revoke all on function public.claim_payout_intent(
  text, text, text, text, text, uuid, tx_network, currency,
  text, numeric, numeric, integer, text
) from public, anon, authenticated;
grant execute on function public.claim_payout_intent(
  text, text, text, text, text, uuid, tx_network, currency,
  text, numeric, numeric, integer, text
) to service_role;

create or replace function public.claim_campaign_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text := caller_addr();
  v_wallet_norm text;
  v_coupon public.campaign_coupons;
  v_existing public.campaign_coupon_claims;
  v_claim_id uuid;
begin
  if v_caller is null or nullif(trim(v_caller), '') is null then
    raise exception 'Not authenticated';
  end if;

  v_wallet_norm := norm_addr(v_caller);
  select * into v_coupon
  from public.campaign_coupons
  where code = upper(trim(coalesce(p_code, '')))
  for update;

  if not found or not v_coupon.active then
    raise exception 'Invalid or inactive coupon code';
  end if;
  if v_coupon.assigned_external_id is null then
    raise exception 'This coupon has not been issued yet';
  end if;

  select * into v_existing
  from public.campaign_coupon_claims
  where campaign_id = v_coupon.campaign_id
    and wallet_norm = v_wallet_norm;
  if found then
    return jsonb_build_object(
      'claimed', true,
      'already_claimed', true,
      'claim_id', v_existing.id,
      'payout_status', v_existing.payout_status,
      'payout_tx_hash', v_existing.payout_tx_hash,
      'campaign_id', v_coupon.campaign_id,
      'code', v_coupon.code,
      'reward_nim', v_coupon.reward_nim
    );
  end if;

  if v_coupon.claim_count >= v_coupon.max_claims then
    raise exception 'This campaign coupon has already been claimed';
  end if;

  insert into public.campaign_coupon_claims (
    campaign_id, coupon_code, wallet_address, wallet_norm
  ) values (
    v_coupon.campaign_id, v_coupon.code, trim(v_caller), v_wallet_norm
  ) returning id into v_claim_id;

  update public.campaign_coupons
  set claim_count = claim_count + 1
  where code = v_coupon.code;

  return jsonb_build_object(
    'claimed', true,
    'already_claimed', false,
    'claim_id', v_claim_id,
    'payout_status', 'pending',
    'campaign_id', v_coupon.campaign_id,
    'code', v_coupon.code,
    'reward_nim', v_coupon.reward_nim
  );
end;
$$;

revoke all on function public.claim_campaign_coupon(text) from public, anon;
grant execute on function public.claim_campaign_coupon(text) to authenticated;

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
  v payout_intents%rowtype;
  v_existing_hash text;
begin
  if nullif(trim(p_tx_hash), '') is null then raise exception 'Missing payout tx hash'; end if;

  select * into v from payout_intents where payout_key = p_payout_key for update;
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
      select release_tx_hash into v_existing_hash from deals where id = v.deal_id for update;
      if not found then raise exception 'Deal not found during payout completion'; end if;
      if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
        raise exception 'Deal release already has a different tx hash';
      end if;
      update deals set release_tx_hash = p_tx_hash,
        fee_amount = case when v.payout_kind = 'release' then v.fee_amount else fee_amount end,
        fee_bps = case when v.payout_kind = 'release' then v.fee_bps else fee_bps end
      where id = v.deal_id;
    else
      select refund_tx_hash into v_existing_hash from deals where id = v.deal_id for update;
      if not found then raise exception 'Deal not found during payout completion'; end if;
      if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
        raise exception 'Deal refund already has a different tx hash';
      end if;
      update deals set refund_tx_hash = p_tx_hash where id = v.deal_id;
    end if;

    insert into transactions (
      id, deal_id, direction, network, amount, currency,
      from_addr, to_addr, tx_hash, status, payout_key
    ) values (
      gen_random_uuid()::text, v.deal_id, 'out', v.network, v.amount, v.currency,
      'CUSTODY', v.recipient, p_tx_hash, 'broadcast', v.payout_key
    ) on conflict do nothing;
  elsif v.subject_kind = 'referral_claim' then
    select tx_hash into v_existing_hash from referral_claims where id = v.referral_claim_id for update;
    if not found then raise exception 'Referral claim not found during payout completion'; end if;
    if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
      raise exception 'Referral claim already has a different tx hash';
    end if;
    update referral_claims set status = 'paid', tx_hash = p_tx_hash, paid_at = coalesce(paid_at, now())
    where id = v.referral_claim_id;
  else
    select payout_tx_hash into v_existing_hash
    from campaign_coupon_claims where id = v.campaign_coupon_claim_id for update;
    if not found then raise exception 'Campaign coupon claim not found during payout completion'; end if;
    if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
      raise exception 'Campaign coupon payout already has a different tx hash';
    end if;
    update campaign_coupon_claims
    set payout_status = 'paid', payout_tx_hash = p_tx_hash, paid_at = coalesce(paid_at, now())
    where id = v.campaign_coupon_claim_id;
    insert into transactions (
      id, deal_id, direction, network, amount, currency,
      from_addr, to_addr, tx_hash, status, payout_key
    ) values (
      gen_random_uuid()::text, null, 'out', v.network, v.amount, v.currency,
      'CUSTODY', v.recipient, p_tx_hash, 'broadcast', v.payout_key
    ) on conflict do nothing;
  end if;

  update payout_intents
  set status = 'broadcast', tx_hash = p_tx_hash, broadcast_at = now(),
      lease_token = null, lease_expires_at = null, last_error = null, updated_at = now()
  where payout_key = p_payout_key;
  return jsonb_build_object('tx_hash', p_tx_hash, 'idempotent', false);
end;
$$;

revoke all on function public.complete_payout_intent(text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_payout_intent(text, text, text)
  to service_role;
