-- 0053: hybrid escrow
--
-- Existing NIM and historic USDT deals remain managed_custody. New USDT deals
-- use the immutable Polygon contract. A smart-contract deal reaches a terminal
-- database state only after the SettlementExecuted receipt is verified.

alter table public.deals
  add column if not exists escrow_model text not null default 'managed_custody',
  add column if not exists escrow_contract_address text,
  add column if not exists contract_settlement_tx_hash text;

alter table public.deals
  alter column escrow_model set default 'managed_custody',
  alter column escrow_model set not null;

alter table public.deals
  drop constraint if exists deals_escrow_model_check;
alter table public.deals
  add constraint deals_escrow_model_check
  check (escrow_model in ('managed_custody', 'smart_contract'));

create or replace function public.assign_deal_escrow_model()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_contract text := lower(
    regexp_replace(
      coalesce(public.platform_config_get('usdt_escrow_contract_addr'), ''),
      '\s', '', 'g'
    )
  );
begin
  -- The server decides the rail. Until a deployed contract is explicitly
  -- activated in platform_config, USDT remains on the legacy managed rail.
  new.escrow_model := case
    when new.price_currency = 'USDT'
      and v_contract ~ '^0x[0-9a-f]{40}$'
      and v_contract <> '0x0000000000000000000000000000000000000000'
      then 'smart_contract'
    else 'managed_custody'
  end;
  new.escrow_contract_address := case
    when new.escrow_model = 'smart_contract' then v_contract
    else null
  end;
  new.fee_bps := case when new.listing_id is not null then 100 else 0 end;
  return new;
end;
$$;

drop trigger if exists assign_deal_escrow_model on public.deals;
create trigger assign_deal_escrow_model
before insert on public.deals
for each row execute function public.assign_deal_escrow_model();

revoke all on function public.assign_deal_escrow_model()
from public, anon, authenticated;

create table if not exists public.settlement_proposals (
  deal_id               text primary key references public.deals(id) on delete cascade,
  decision              admin_decision_type not null,
  buyer_amount          numeric(38, 18) not null check (buyer_amount >= 0),
  seller_amount         numeric(38, 18) not null check (seller_amount >= 0),
  nonce                 bigint not null default 0 check (nonce >= 0),
  deadline              timestamptz not null,
  arbitrator_signature  text,
  status                text not null default 'awaiting_signature'
                        check (status in ('awaiting_signature', 'ready', 'submitted', 'confirmed')),
  settlement_tx_hash    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists settlement_proposals_updated_at on public.settlement_proposals;
create trigger settlement_proposals_updated_at
before update on public.settlement_proposals
for each row execute function public.bump_updated_at();

alter table public.settlement_proposals enable row level security;
revoke all on table public.settlement_proposals from public, anon, authenticated;
grant select on table public.settlement_proposals to authenticated;

drop policy if exists settlement_proposals_participants_read
  on public.settlement_proposals;
create policy settlement_proposals_participants_read
on public.settlement_proposals
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.deals d
    where d.id = settlement_proposals.deal_id
      and (
        public.addr_eq(d.buyer_wallet_address, public.caller_addr())
        or public.addr_eq(d.seller_wallet_address, public.caller_addr())
      )
  )
);

create or replace function public.confirm_receipt(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null or not addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Only the buyer can confirm receipt';
  end if;
  if v_deal.escrow_model = 'smart_contract' then
    raise exception 'Smart-contract deals must be released on-chain';
  end if;
  if not can_transition(v_deal.status, 'received_by_buyer') then
    raise exception 'Illegal transition: % -> received_by_buyer', v_deal.status;
  end if;

  update deals
  set status = 'received_by_buyer', received_at = v_now, updated_at = v_now
  where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer confirmed receipt', 'received');

  update deals
  set status = 'released', released_at = v_now, updated_at = v_now
  where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text, p_deal_id, v_now, 'Funds released to seller',
    v_deal.price_amount::text || ' ' || v_deal.price_currency::text, 'released'
  );

  if v_deal.listing_id is not null then
    update listings
    set orders_count = orders_count + 1, updated_at = v_now
    where id = v_deal.listing_id;
  end if;
end;
$$;

create or replace function public.apply_admin_decision(
  p_deal_id text,
  p_decision admin_decision_type,
  p_reason text,
  p_buyer_amount numeric default null,
  p_seller_amount numeric default null,
  p_decided_by text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_target deal_status;
  v_caller text := caller_addr();
  v_buyer numeric;
  v_seller numeric;
begin
  if not is_admin() then raise exception 'Admin privileges required'; end if;

  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status not in ('under_admin_review', 'proof_window') then
    raise exception 'Decision only allowed from under_admin_review or proof_window';
  end if;

  v_target := case p_decision
    when 'release_to_seller' then 'released'
    when 'refund_to_buyer' then 'refunded'
    else 'partially_refunded'
  end;
  v_buyer := case p_decision
    when 'release_to_seller' then 0
    when 'refund_to_buyer' then v_deal.price_amount
    else p_buyer_amount
  end;
  v_seller := case p_decision
    when 'release_to_seller' then v_deal.price_amount
    when 'refund_to_buyer' then 0
    else p_seller_amount
  end;

  if v_buyer is null or v_seller is null
     or v_buyer < 0 or v_seller < 0
     or v_buyer + v_seller <> v_deal.price_amount then
    raise exception 'Settlement amounts must be non-negative and add up to the deal total';
  end if;

  insert into decisions (
    id, deal_id, decision, buyer_amount, seller_amount,
    reason, decided_by, created_at
  ) values (
    gen_random_uuid()::text, p_deal_id, p_decision, v_buyer, v_seller,
    p_reason, coalesce(v_caller, p_decided_by), v_now
  );

  if v_deal.escrow_model = 'smart_contract' then
    update deals
    set status = 'under_admin_review', updated_at = v_now
    where id = p_deal_id;

    insert into settlement_proposals (
      deal_id, decision, buyer_amount, seller_amount, nonce, deadline,
      arbitrator_signature, status, settlement_tx_hash
    ) values (
      p_deal_id, p_decision, v_buyer, v_seller, 0,
      v_now + interval '7 days', null, 'awaiting_signature', null
    )
    on conflict (deal_id) do update set
      decision = excluded.decision,
      buyer_amount = excluded.buyer_amount,
      seller_amount = excluded.seller_amount,
      deadline = excluded.deadline,
      arbitrator_signature = null,
      status = 'awaiting_signature',
      settlement_tx_hash = null,
      updated_at = v_now;

    insert into timeline (id, deal_id, at, label, detail, kind)
    values (
      gen_random_uuid()::text, p_deal_id, v_now,
      'On-chain settlement proposed',
      p_reason || ' A buyer or seller signature is required before the contract can execute it.',
      'admin'
    );
    return;
  end if;

  update deals
  set status = v_target,
      released_at = case when v_target in ('released','partially_refunded') then v_now else released_at end,
      refunded_at = case when v_target in ('refunded','partially_refunded') then v_now else refunded_at end,
      updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text, p_deal_id, v_now,
    case p_decision
      when 'release_to_seller' then 'Admin released funds to seller'
      when 'refund_to_buyer' then 'Admin refunded buyer'
      else 'Admin applied partial refund'
    end,
    p_reason, 'admin'
  );

  if v_target = 'released' and v_deal.listing_id is not null then
    update listings
    set orders_count = orders_count + 1, updated_at = v_now
    where id = v_deal.listing_id;
  end if;
end;
$$;

create or replace function public.auto_release_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'delivered_by_seller' then return; end if;
  if v_deal.confirmation_deadline_at is null
     or v_deal.confirmation_deadline_at > v_now then return; end if;

  if v_deal.escrow_model = 'smart_contract' then
    update deals
    set status = 'under_admin_review', updated_at = v_now
    where id = p_deal_id;

    insert into settlement_proposals (
      deal_id, decision, buyer_amount, seller_amount, nonce, deadline,
      status
    ) values (
      p_deal_id, 'release_to_seller', 0, v_deal.price_amount, 0,
      v_now + interval '7 days', 'awaiting_signature'
    )
    on conflict (deal_id) do nothing;

    insert into timeline (id, deal_id, at, label, detail, kind)
    values (
      gen_random_uuid()::text, p_deal_id, v_now,
      'Seller settlement is ready for approval',
      'The confirmation window elapsed. A seller signature plus the XcrowHub arbitrator signature can execute the contract release.',
      'admin'
    );
    return;
  end if;

  update deals
  set status = 'released', released_at = v_now, updated_at = v_now
  where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text, p_deal_id, v_now,
    'Funds auto-released to seller',
    'Buyer did not confirm within the confirmation window.',
    'released'
  );

  if v_deal.listing_id is not null then
    update listings
    set orders_count = orders_count + 1, updated_at = v_now
    where id = v_deal.listing_id;
  end if;
end;
$$;

create or replace function public.submit_contract_settlement_tx(
  p_deal_id text,
  p_tx_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_caller text := caller_addr();
  v_hash text := lower(btrim(p_tx_hash));
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_hash is null or v_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'A valid Polygon transaction hash is required';
  end if;

  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.escrow_model <> 'smart_contract' or v_deal.price_currency <> 'USDT' then
    raise exception 'Deal does not use smart-contract escrow';
  end if;
  if not (
    addr_eq(v_deal.buyer_wallet_address, v_caller)
    or addr_eq(v_deal.seller_wallet_address, v_caller)
  ) then
    raise exception 'Only a deal participant can submit settlement';
  end if;
  if v_deal.contract_settlement_tx_hash is not null
     and lower(v_deal.contract_settlement_tx_hash) <> v_hash then
    raise exception 'A different settlement transaction is already submitted';
  end if;

  update deals
  set contract_settlement_tx_hash = v_hash, updated_at = now()
  where id = p_deal_id;
  update settlement_proposals
  set settlement_tx_hash = v_hash, status = 'submitted', updated_at = now()
  where deal_id = p_deal_id;
end;
$$;

revoke all on function public.submit_contract_settlement_tx(text, text)
from public, anon;
grant execute on function public.submit_contract_settlement_tx(text, text)
to authenticated;

create or replace function public.confirm_contract_settlement(
  p_deal_id text,
  p_tx_hash text,
  p_buyer_amount numeric,
  p_seller_amount numeric,
  p_fee_amount numeric,
  p_contract_address text,
  p_block_height bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_proposal settlement_proposals%rowtype;
  v_hash text := lower(btrim(p_tx_hash));
  v_now timestamptz := now();
  v_target deal_status;
  v_to text;
begin
  if v_hash is null or v_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'A valid Polygon transaction hash is required';
  end if;
  if p_buyer_amount is null or p_seller_amount is null or p_fee_amount is null
     or p_buyer_amount < 0 or p_seller_amount < 0 or p_fee_amount < 0 then
    raise exception 'Invalid settlement amounts';
  end if;

  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.escrow_model <> 'smart_contract'
     or v_deal.price_currency <> 'USDT' then
    raise exception 'Deal does not use smart-contract escrow';
  end if;
  if v_deal.status in ('released', 'refunded', 'partially_refunded') then
    if lower(coalesce(v_deal.contract_settlement_tx_hash, '')) = v_hash then
      return true;
    end if;
    raise exception 'Deal is already settled by another transaction';
  end if;
  if p_buyer_amount + p_seller_amount <> v_deal.price_amount then
    raise exception 'Settlement amounts do not match deal total';
  end if;
  if v_deal.contract_settlement_tx_hash is not null
     and lower(v_deal.contract_settlement_tx_hash) <> v_hash then
    raise exception 'Settlement hash does not match submitted transaction';
  end if;

  select * into v_proposal
  from settlement_proposals
  where deal_id = p_deal_id
  for update;
  if found and (
    v_proposal.buyer_amount <> p_buyer_amount
    or v_proposal.seller_amount <> p_seller_amount
  ) then
    raise exception 'On-chain settlement does not match the approved proposal';
  end if;

  v_target := case
    when p_buyer_amount = 0 and p_seller_amount = v_deal.price_amount
      then 'released'::deal_status
    when p_seller_amount = 0 and p_buyer_amount = v_deal.price_amount
      then 'refunded'::deal_status
    else 'partially_refunded'::deal_status
  end;
  v_to := case v_target
    when 'released' then v_deal.seller_wallet_address
    when 'refunded' then v_deal.buyer_wallet_address
    else 'split:' || coalesce(v_deal.buyer_wallet_address, '') || ':' || v_deal.seller_wallet_address
  end;

  insert into transactions (
    id, deal_id, direction, network, amount, currency,
    from_addr, to_addr, tx_hash, block_height, status
  ) values (
    gen_random_uuid()::text, p_deal_id, 'out', 'evm',
    v_deal.price_amount, 'USDT', p_contract_address, v_to,
    v_hash, p_block_height, 'confirmed'
  );

  update deals
  set status = v_target,
      contract_settlement_tx_hash = v_hash,
      escrow_contract_address = p_contract_address,
      release_tx_hash = case when v_target in ('released','partially_refunded') then v_hash else release_tx_hash end,
      refund_tx_hash = case when v_target in ('refunded','partially_refunded') then v_hash else refund_tx_hash end,
      fee_amount = p_fee_amount,
      released_at = case when v_target in ('released','partially_refunded') then v_now else released_at end,
      refunded_at = case when v_target in ('refunded','partially_refunded') then v_now else refunded_at end,
      updated_at = v_now
  where id = p_deal_id;

  update settlement_proposals
  set settlement_tx_hash = v_hash, status = 'confirmed', updated_at = v_now
  where deal_id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text, p_deal_id, v_now,
    case v_target
      when 'released' then 'Smart contract released USDT to seller'
      when 'refunded' then 'Smart contract refunded the buyer'
      else 'Smart contract executed the split settlement'
    end,
    'Verified Polygon transaction ' || v_hash,
    case when v_target = 'released' then 'released'::timeline_kind else 'refund'::timeline_kind end
  );

  if v_target = 'released' and v_deal.listing_id is not null then
    update listings
    set orders_count = orders_count + 1, updated_at = v_now
    where id = v_deal.listing_id;
  end if;

  return true;
end;
$$;

revoke all on function public.confirm_contract_settlement(
  text, text, numeric, numeric, numeric, text, bigint
) from public, anon, authenticated;
grant execute on function public.confirm_contract_settlement(
  text, text, numeric, numeric, numeric, text, bigint
) to service_role;

create or replace function public.settle_pending_payouts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_url text := 'http://kong:8000/functions/v1/payout';
  v_verify_url text := 'http://kong:8000/functions/v1/verify-settlement';
  v_auth text := 'Bearer ' || app_service_key();
  v_hdr jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', v_auth
  );
begin
  for r in
    select id from deals
    where status = 'released'
      and release_tx_hash is null
      and escrow_model = 'managed_custody'
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'release_to_seller'),
      timeout_milliseconds := 30000
    );
  end loop;

  for r in
    select id from deals
    where status = 'refunded'
      and refund_tx_hash is null
      and escrow_model = 'managed_custody'
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'refund_to_buyer'),
      timeout_milliseconds := 30000
    );
  end loop;

  for r in
    select id from deals
    where status = 'partially_refunded'
      and release_tx_hash is null
      and escrow_model = 'managed_custody'
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'seller'),
      timeout_milliseconds := 30000
    );
  end loop;

  for r in
    select id from deals
    where status = 'partially_refunded'
      and refund_tx_hash is null
      and escrow_model = 'managed_custody'
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'buyer'),
      timeout_milliseconds := 30000
    );
  end loop;

  for r in
    select deal_id, decision
    from settlement_proposals
    where status = 'awaiting_signature'
      and deadline > now()
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.deal_id, 'decision', r.decision),
      timeout_milliseconds := 30000
    );
  end loop;

  for r in
    select deal_id
    from settlement_proposals
    where status = 'submitted'
  loop
    perform net.http_post(
      url := v_verify_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.deal_id),
      timeout_milliseconds := 30000
    );
  end loop;

  for r in select id from referral_claims where status = 'pending' loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('kind', 'referral_claim', 'claim_id', r.id),
      timeout_milliseconds := 30000
    );
  end loop;
end;
$$;
