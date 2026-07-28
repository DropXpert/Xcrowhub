-- 0029: atomic, single-use payment transaction claims
--
-- A chain transaction must fund at most one deal.  The claim table is the
-- concurrency boundary: its primary key makes two simultaneous confirmations
-- of the same network/hash serialize in PostgreSQL instead of racing in Edge
-- Functions.

alter table public.deals
  add column if not exists payment_started_at timestamptz;

-- A historic retry could insert an identical chain payment twice for the same
-- deal.  That ownership is unambiguous, so retain the oldest ledger entry
-- before adding the single-use index.  Never reconcile a hash shared by two
-- different deals automatically.
with hash_owners as (
  select
    t.network,
    lower(btrim(t.tx_hash)) as tx_hash,
    count(distinct t.deal_id) as deal_count
  from public.transactions t
  where t.direction = 'in'
    and nullif(btrim(t.tx_hash), '') is not null
  group by t.network, lower(btrim(t.tx_hash))
), ranked_duplicates as (
  select
    t.id,
    row_number() over (
      partition by t.network, lower(btrim(t.tx_hash)), t.deal_id
      order by t.created_at, t.id
    ) as duplicate_rank,
    h.deal_count
  from public.transactions t
  join hash_owners h
    on h.network = t.network
   and h.tx_hash = lower(btrim(t.tx_hash))
  where t.direction = 'in'
    and nullif(btrim(t.tx_hash), '') is not null
)
delete from public.transactions t
using ranked_duplicates d
where t.id = d.id
  and d.deal_count = 1
  and d.duplicate_rank > 1;

-- Do not guess which historical deal owns a duplicated payment. Stop the
-- migration with an actionable error whenever a hash remains on more than one
-- deal after the unambiguous retry cleanup above.
do $$
begin
  if exists (
    select 1
    from public.transactions t
    where t.direction = 'in'
      and nullif(btrim(t.tx_hash), '') is not null
    group by t.network, lower(btrim(t.tx_hash))
    having count(distinct t.deal_id) > 1
  ) then
    raise exception
      'Payment-integrity migration blocked: duplicate incoming transaction hashes exist; audit the custody ledger before retrying';
  end if;

  if exists (
    with legacy_claims as (
      select
        t.network,
        lower(btrim(t.tx_hash)) as tx_hash,
        t.deal_id
      from public.transactions t
      where t.direction = 'in'
        and nullif(btrim(t.tx_hash), '') is not null

      union all

      select
        case d.price_currency
          when 'NIM' then 'nimiq'::tx_network
          when 'USDT' then 'evm'::tx_network
        end,
        lower(btrim(d.payment_tx_hash)),
        d.id
      from public.deals d
      where d.paid_at is not null
        and nullif(btrim(d.payment_tx_hash), '') is not null
    )
    select 1
    from legacy_claims
    where network is not null
    group by network, tx_hash
    having count(distinct deal_id) > 1
  ) then
    raise exception
      'Payment-integrity migration blocked: a historical payment is attached to multiple deals; reconcile those deals before retrying';
  end if;
end;
$$;

-- Legacy blank ledger placeholders are not transaction identities and are
-- excluded; the write trigger below rejects every new blank incoming hash.
create unique index if not exists transactions_incoming_network_hash_unique
  on public.transactions (network, lower(btrim(tx_hash)))
  where direction = 'in' and nullif(btrim(tx_hash), '') is not null;

create table if not exists public.payment_tx_claims (
  network    tx_network not null,
  tx_hash    text not null,
  deal_id    text not null references public.deals(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  primary key (network, tx_hash),
  constraint payment_tx_claims_hash_canonical
    check (tx_hash <> '' and tx_hash = lower(btrim(tx_hash)))
);

alter table public.payment_tx_claims enable row level security;
revoke all on table public.payment_tx_claims from public, anon, authenticated;

-- Seed claims from the oldest incoming ledger record for each transaction.
-- ON CONFLICT also handles legacy rows where one deal has more than one incoming
-- record.  Existing ledger history is retained; all future writes are guarded.
with ranked as (
  select
    t.network,
    lower(btrim(t.tx_hash)) as tx_hash,
    t.deal_id,
    row_number() over (
      partition by t.network, lower(btrim(t.tx_hash))
      order by t.created_at, t.id
    ) as hash_rank
  from public.transactions t
  where t.direction = 'in'
    and nullif(btrim(t.tx_hash), '') is not null
)
insert into public.payment_tx_claims (network, tx_hash, deal_id)
select network, tx_hash, deal_id
from ranked
where hash_rank = 1
on conflict do nothing;

-- Some older confirmed deals may have no custody-ledger row.  Reserve their
-- hashes too so they cannot be replayed after this migration.
with ranked as (
  select
    case d.price_currency
      when 'NIM' then 'nimiq'::tx_network
      when 'USDT' then 'evm'::tx_network
    end as network,
    lower(btrim(d.payment_tx_hash)) as tx_hash,
    d.id as deal_id,
    row_number() over (
      partition by
        case d.price_currency
          when 'NIM' then 'nimiq'::tx_network
          when 'USDT' then 'evm'::tx_network
        end,
        lower(btrim(d.payment_tx_hash))
      order by d.paid_at nulls last, d.created_at, d.id
    ) as hash_rank
  from public.deals d
  where d.status <> 'awaiting_payment'
    and d.paid_at is not null
    and nullif(btrim(d.payment_tx_hash), '') is not null
)
insert into public.payment_tx_claims (network, tx_hash, deal_id)
select network, tx_hash, deal_id
from ranked
where network is not null and hash_rank = 1
on conflict do nothing;

-- Chain amounts must be positive and exactly representable in base units.
-- This trigger protects new deals without making unrelated status updates fail
-- for any legacy rows that need manual cleanup.
create or replace function public.guard_deal_payment_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price_amount is null or new.price_amount <= 0 then
    raise exception 'Deal price must be greater than zero';
  end if;

  if new.price_currency = 'NIM' and new.price_amount <> trunc(new.price_amount, 5) then
    raise exception 'NIM deal price cannot exceed 5 decimal places';
  end if;
  if new.price_currency = 'USDT' and new.price_amount <> trunc(new.price_amount, 6) then
    raise exception 'USDT deal price cannot exceed 6 decimal places';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_deal_payment_amount on public.deals;
create trigger guard_deal_payment_amount
before insert or update of price_amount, price_currency on public.deals
for each row execute function public.guard_deal_payment_amount();

revoke all on function public.guard_deal_payment_amount() from public, anon, authenticated;

-- Guard every future incoming-ledger insert, including service-role writes that
-- do not use the confirmation RPC.  Repeated inserts for the same deal/hash are
-- idempotently suppressed; reuse by another deal raises a unique violation.
create or replace function public.guard_incoming_payment_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_claimed_deal text;
  v_existing_deal text;
begin
  if tg_op = 'UPDATE' then
    if (
      new.direction is distinct from old.direction
      or new.network is distinct from old.network
      or new.tx_hash is distinct from old.tx_hash
      or new.deal_id is distinct from old.deal_id
    ) then
      raise exception 'Transaction identity is immutable';
    end if;
    return new;
  end if;

  if new.direction <> 'in' then
    return new;
  end if;

  v_hash := lower(btrim(new.tx_hash));
  if v_hash is null or v_hash = '' then
    raise exception 'Payment transaction hash is required';
  end if;
  new.tx_hash := v_hash;

  insert into public.payment_tx_claims (network, tx_hash, deal_id)
  values (new.network, v_hash, new.deal_id)
  on conflict (network, tx_hash) do nothing;

  -- Lock the claim row so even direct concurrent ledger inserts serialize.
  select c.deal_id into v_claimed_deal
  from public.payment_tx_claims c
  where c.network = new.network and c.tx_hash = v_hash
  for update;

  if v_claimed_deal is distinct from new.deal_id then
    raise exception using
      errcode = '23505',
      message = format(
        'Payment transaction %s on %s is already claimed by deal %s',
        v_hash, new.network, v_claimed_deal
      );
  end if;

  select t.deal_id into v_existing_deal
  from public.transactions t
  where t.direction = 'in'
    and t.network = new.network
    and lower(btrim(t.tx_hash)) = v_hash
  order by t.created_at, t.id
  limit 1;

  if found then
    if v_existing_deal is distinct from new.deal_id then
      raise exception using
        errcode = '23505',
        message = format('Payment transaction %s is already in the ledger', v_hash);
    end if;
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_incoming_payment_transaction on public.transactions;
create trigger guard_incoming_payment_transaction
before insert or update on public.transactions
for each row execute function public.guard_incoming_payment_transaction();

revoke all on function public.guard_incoming_payment_transaction() from public, anon, authenticated;

-- Reserve the deal before opening the wallet approval UI. This closes the gap
-- where a seller could cancel after the buyer broadcast but before the client
-- received and submitted the transaction hash. The first timestamp is
-- immutable so repeated calls cannot extend the reservation indefinitely.
create or replace function public.begin_payment(
  p_deal_id text,
  p_buyer text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_caller text := caller_addr();
  v_now timestamptz := now();
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_buyer is null or not addr_eq(p_buyer, v_caller) then
    raise exception 'Buyer must be the connected wallet';
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status <> 'awaiting_payment' then raise exception 'Deal is not awaiting payment'; end if;
  if v_deal.payment_deadline_at is not null
     and v_now > v_deal.payment_deadline_at then
    raise exception 'The payment window has closed';
  end if;
  if v_deal.buyer_wallet_address is not null
     and not addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Deal already belongs to another buyer';
  end if;

  update public.deals
  set buyer_wallet_address = coalesce(buyer_wallet_address, p_buyer),
      payment_started_at = case
        when payment_started_at is null
          or payment_started_at <= v_now - interval '15 minutes'
          then v_now
        else payment_started_at
      end,
      updated_at = v_now
  where id = p_deal_id;
end;
$$;

revoke all on function public.begin_payment(text, text) from public, anon;
grant execute on function public.begin_payment(text, text) to authenticated;

-- Client submission records intent only.  The authenticated wallet is the
-- buyer, and neither an existing buyer nor an existing hash may be replaced.
create or replace function public.submit_payment(
  p_deal_id text, p_tx_hash text, p_buyer text
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
  v_now timestamptz := now();
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if p_buyer is null or not addr_eq(p_buyer, v_caller) then
    raise exception 'Buyer must be the connected wallet';
  end if;
  if v_hash is null or v_hash = '' or length(v_hash) > 256 then
    raise exception 'A valid payment transaction hash is required';
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;

  if v_deal.buyer_wallet_address is not null
     and not addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Deal already belongs to another buyer';
  end if;
  if v_deal.payment_tx_hash is null
     and v_deal.payment_deadline_at is not null
     and v_now > v_deal.payment_deadline_at + interval '15 minutes'
     and (
       v_deal.payment_started_at is null
       or v_deal.payment_started_at <= v_now - interval '15 minutes'
     ) then
    raise exception 'The payment submission window has closed';
  end if;
  if v_deal.payment_tx_hash is not null
     and lower(btrim(v_deal.payment_tx_hash)) <> v_hash then
    raise exception 'A different payment transaction is already submitted';
  end if;

  -- Exact retries are safe even if verification already advanced the deal.
  if v_deal.status <> 'awaiting_payment' and v_deal.status <> 'expired' then
    if v_deal.payment_tx_hash is not null
       and lower(btrim(v_deal.payment_tx_hash)) = v_hash then
      return;
    end if;
    raise exception 'Deal is not awaiting payment';
  end if;

  update public.deals set
    payment_tx_hash      = v_hash,
    buyer_wallet_address = coalesce(buyer_wallet_address, p_buyer),
    -- Preserve the first submission time so exact retries cannot extend the
    -- server-side verification grace period indefinitely.
    payment_started_at   = coalesce(payment_started_at, v_now),
    payment_submitted_at = coalesce(payment_submitted_at, v_now),
    updated_at           = v_now
  where id = p_deal_id;
end;
$$;

revoke all on function public.submit_payment(text, text, text) from public;
grant execute on function public.submit_payment(text, text, text) to anon, authenticated;

-- Trusted server path: claim, ledger insert, and status transition all commit or
-- roll back together.  Amount/currency come from the locked deal, never callers.
create or replace function public.claim_and_confirm_deal_payment(
  p_deal_id text,
  p_buyer text,
  p_tx_hash text,
  p_network text,
  p_from_addr text,
  p_to_addr text,
  p_block_height bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_hash text := lower(btrim(p_tx_hash));
  v_network tx_network;
  v_expected_network tx_network;
  v_claimed_deal text;
  v_now timestamptz := now();
begin
  if v_hash is null or v_hash = '' or length(v_hash) > 256 then
    raise exception 'A valid payment transaction hash is required';
  end if;
  if nullif(regexp_replace(coalesce(p_buyer, ''), '\s', '', 'g'), '') is null then
    raise exception 'Verified payment sender is required';
  end if;
  if nullif(btrim(p_from_addr), '') is not null and not addr_eq(p_from_addr, p_buyer) then
    raise exception 'Ledger sender does not match verified buyer';
  end if;
  if nullif(btrim(p_to_addr), '') is null then
    raise exception 'Custody recipient is required';
  end if;
  begin
    v_network := lower(btrim(p_network))::tx_network;
  exception when invalid_text_representation then
    raise exception 'Unsupported payment network: %', p_network;
  end;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;

  v_expected_network := case v_deal.price_currency
    when 'NIM' then 'nimiq'::tx_network
    when 'USDT' then 'evm'::tx_network
  end;
  if v_network is distinct from v_expected_network then
    raise exception 'Payment network does not match deal currency';
  end if;
  if v_deal.payment_tx_hash is not null
     and lower(btrim(v_deal.payment_tx_hash)) <> v_hash then
    raise exception 'Verified transaction does not match submitted transaction';
  end if;
  if v_deal.buyer_wallet_address is not null
     and not addr_eq(v_deal.buyer_wallet_address, p_buyer) then
    raise exception 'Verified sender does not match deal buyer';
  end if;

  -- Idempotent server retry after a successful confirmation. An expired deal
  -- with a submitted hash is recoverable when delayed chain verification proves
  -- that funds really reached custody.
  if v_deal.status <> 'awaiting_payment' and v_deal.status <> 'expired' then
    if v_deal.paid_at is not null
       and v_deal.payment_tx_hash is not null
       and lower(btrim(v_deal.payment_tx_hash)) = v_hash then
      return true;
    end if;
    raise exception 'Deal is not awaiting payment';
  end if;
  if v_deal.status = 'awaiting_payment'
     and not can_transition(v_deal.status, 'funds_held') then
    raise exception 'Illegal transition: % -> funds_held', v_deal.status;
  end if;

  insert into public.payment_tx_claims (network, tx_hash, deal_id)
  values (v_network, v_hash, p_deal_id)
  on conflict (network, tx_hash) do nothing;

  select c.deal_id into v_claimed_deal
  from public.payment_tx_claims c
  where c.network = v_network and c.tx_hash = v_hash
  for update;

  if v_claimed_deal is distinct from p_deal_id then
    raise exception using
      errcode = '23505',
      message = format('Payment transaction %s is already claimed by another deal', v_hash);
  end if;

  insert into public.transactions (
    id, deal_id, direction, network, amount, currency,
    from_addr, to_addr, tx_hash, block_height, status
  ) values (
    gen_random_uuid()::text,
    p_deal_id,
    'in',
    v_network,
    v_deal.price_amount,
    v_deal.price_currency,
    coalesce(nullif(btrim(p_from_addr), ''), p_buyer, ''),
    coalesce(nullif(btrim(p_to_addr), ''), ''),
    v_hash,
    p_block_height,
    'confirmed'
  );

  update public.deals set
    status               = 'funds_held',
    buyer_wallet_address = coalesce(buyer_wallet_address, p_buyer),
    payment_tx_hash      = v_hash,
    paid_at              = v_now,
    updated_at           = v_now
  where id = p_deal_id;

  insert into public.timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text,
    p_deal_id,
    v_now,
    case when v_deal.status = 'expired'
      then 'Late payment verified and restored to protected hold'
      else 'Buyer paid into protected hold'
    end,
    v_deal.price_amount::text || ' ' || v_deal.price_currency::text,
    'paid'
  );

  return true;
end;
$$;

revoke all on function public.claim_and_confirm_deal_payment(text, text, text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_and_confirm_deal_payment(text, text, text, text, text, text, bigint)
  to service_role;

-- Keep the old service-only RPC safe for a rolling Edge Function deployment.
-- It now delegates to the same atomic claim path; new code uses the richer RPC.
create or replace function public.confirm_deal_payment(
  p_deal_id text, p_buyer text, p_tx_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_network text;
begin
  select case d.price_currency when 'NIM' then 'nimiq' else 'evm' end
  into v_network
  from public.deals d
  where d.id = p_deal_id;

  if not found then
    raise exception 'Deal not found';
  end if;

  perform public.claim_and_confirm_deal_payment(
    p_deal_id,
    p_buyer,
    p_tx_hash,
    v_network,
    p_buyer,
    'custody',
    null
  );
end;
$$;

revoke all on function public.confirm_deal_payment(text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_deal_payment(text, text, text) to service_role;
