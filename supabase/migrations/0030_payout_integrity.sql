-- 0030: exactly-once payout coordination
--
-- A terminal deal state is not itself an authorization to broadcast repeatedly.
-- Every economic payout gets one immutable key and a short DB lease.  The Edge
-- Function must claim the lease before calling the signer, and finalization of
-- the custody ledger + deal/claim hash happens in one database transaction.
--
-- The signer provides the other half of the guarantee: it durably stores the
-- signed raw transaction under payout_key before broadcasting it.  Therefore a
-- retry after "broadcast succeeded, HTTP/DB update failed" rebroadcasts the same
-- transaction/hash instead of spending again.

create table if not exists payout_intents (
  payout_key        text primary key,
  subject_kind      text not null check (subject_kind in ('deal', 'referral_claim')),
  payout_kind       text not null check (payout_kind in ('release', 'refund', 'partial_seller', 'partial_buyer', 'referral')),
  deal_id           text references deals(id) on delete restrict,
  referral_claim_id text references referral_claims(id) on delete restrict,
  network           tx_network not null,
  currency          currency not null,
  recipient         text not null,
  amount            numeric(38, 18) not null check (amount > 0),
  fee_amount        numeric(38, 18) not null default 0 check (fee_amount >= 0),
  fee_bps           integer not null default 0 check (fee_bps >= 0 and fee_bps < 10000),
  status            text not null default 'claimed' check (status in ('claimed', 'broadcast')),
  tx_hash           text,
  lease_token       text,
  lease_expires_at  timestamptz,
  attempt_count     integer not null default 1,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  broadcast_at      timestamptz,
  constraint payout_intents_subject_check check (
    (subject_kind = 'deal' and deal_id is not null and referral_claim_id is null and payout_kind <> 'referral')
    or
    (subject_kind = 'referral_claim' and deal_id is null and referral_claim_id is not null and payout_kind = 'referral')
  ),
  constraint payout_intents_status_hash_check check (
    (status = 'claimed' and tx_hash is null)
    or
    (status = 'broadcast' and tx_hash is not null)
  )
);

create unique index if not exists idx_payout_intents_referral_claim
  on payout_intents(referral_claim_id)
  where referral_claim_id is not null;
create index if not exists idx_payout_intents_retry
  on payout_intents(status, lease_expires_at);
-- Covers every new money flow, including referral claims (which cannot use the
-- deal-bound transactions table).  One chain tx may finalize only one intent.
create unique index if not exists idx_payout_intents_network_hash
  on payout_intents(network, lower(btrim(tx_hash)))
  where tx_hash is not null and nullif(btrim(tx_hash), '') is not null;

alter table payout_intents enable row level security;
revoke all on table payout_intents from public, anon, authenticated;

-- Tie each outbound custody-ledger row to its economic payout, independently of
-- recipient address.  Address-based idempotency is ambiguous for split payouts.
alter table transactions add column if not exists payout_key text;
create unique index if not exists idx_transactions_payout_key
  on transactions(payout_key)
  where payout_key is not null;

-- Preserve evidence of historic collisions rather than rewriting a custody
-- ledger.  They are excluded from the index below, while the guard trigger
-- still prevents that hash from ever being reused for a future payout.
alter table transactions
  add column if not exists legacy_tx_hash_collision boolean not null default false;

create table if not exists payout_tx_hash_collisions (
  network tx_network not null,
  tx_hash text not null,
  ledger_row_count integer not null,
  deal_count integer not null,
  deal_ids jsonb not null,
  detected_at timestamptz not null default now(),
  primary key (network, tx_hash)
);
alter table payout_tx_hash_collisions enable row level security;
revoke all on table payout_tx_hash_collisions from public, anon, authenticated;

with collisions as (
  select
    network,
    lower(btrim(tx_hash)) as tx_hash,
    count(*)::integer as ledger_row_count,
    count(distinct deal_id)::integer as deal_count,
    jsonb_agg(deal_id order by created_at, id) as deal_ids
  from transactions
  where direction = 'out'
    and nullif(btrim(tx_hash), '') is not null
  group by network, lower(btrim(tx_hash))
  having count(*) > 1
)
insert into payout_tx_hash_collisions (
  network, tx_hash, ledger_row_count, deal_count, deal_ids
)
select network, tx_hash, ledger_row_count, deal_count, deal_ids
from collisions
on conflict (network, tx_hash) do update
  set ledger_row_count = excluded.ledger_row_count,
      deal_count = excluded.deal_count,
      deal_ids = excluded.deal_ids;

update transactions t
   set legacy_tx_hash_collision = true
 where t.direction = 'out'
   and nullif(btrim(t.tx_hash), '') is not null
   and exists (
     select 1
     from payout_tx_hash_collisions c
     where c.network = t.network
       and c.tx_hash = lower(btrim(t.tx_hash))
   );

create unique index if not exists transactions_outgoing_network_hash_unique
  on transactions(network, lower(btrim(tx_hash)))
  where direction = 'out'
    and not legacy_tx_hash_collision
    and nullif(btrim(tx_hash), '') is not null;

create or replace function guard_outgoing_payment_transaction()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.direction <> 'out' or nullif(btrim(new.tx_hash), '') is null then
    return new;
  end if;

  new.tx_hash := lower(btrim(new.tx_hash));
  if new.legacy_tx_hash_collision then
    raise exception 'Legacy payout collision marker cannot be set on new ledger rows';
  end if;

  -- The advisory lock closes the gap for historical collision hashes, which
  -- are intentionally excluded from the unique index to preserve evidence.
  perform pg_advisory_xact_lock(hashtextextended(new.network::text || ':' || new.tx_hash, 0));
  if exists (
    select 1
    from transactions t
    where t.direction = 'out'
      and t.network = new.network
      and lower(btrim(t.tx_hash)) = new.tx_hash
      and t.id is distinct from new.id
  ) then
    raise exception 'Outbound transaction hash is already recorded';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_outgoing_payment_transaction on transactions;
create trigger guard_outgoing_payment_transaction
before insert or update of direction, network, tx_hash, legacy_tx_hash_collision on transactions
for each row execute function guard_outgoing_payment_transaction();

-- Atomically create/read an immutable payout intent and acquire its lease.
-- Returns acquired=false while another request owns a live lease, or the prior
-- tx hash once finalization has already completed.
create or replace function claim_payout_intent(
  p_payout_key text,
  p_subject_kind text,
  p_payout_kind text,
  p_deal_id text,
  p_referral_claim_id text,
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
  if p_fee_amount is null or p_fee_amount < 0 or p_fee_bps is null or p_fee_bps < 0 or p_fee_bps >= 10000 then
    raise exception 'Invalid payout fee';
  end if;

  insert into payout_intents (
    payout_key, subject_kind, payout_kind, deal_id, referral_claim_id,
    network, currency, recipient, amount, fee_amount, fee_bps,
    lease_token, lease_expires_at
  ) values (
    p_payout_key, p_subject_kind, p_payout_kind, p_deal_id, p_referral_claim_id,
    p_network, p_currency, p_recipient, p_amount, p_fee_amount, p_fee_bps,
    p_lease_token, now() + interval '3 minutes'
  ) on conflict (payout_key) do nothing;

  select * into v from payout_intents where payout_key = p_payout_key for update;
  if not found then raise exception 'Could not create payout intent'; end if;

  -- A key can never be reused with altered money-moving parameters.
  if v.subject_kind is distinct from p_subject_kind
     or v.payout_kind is distinct from p_payout_kind
     or v.deal_id is distinct from p_deal_id
     or v.referral_claim_id is distinct from p_referral_claim_id
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
    v_acquired := true; -- this invocation inserted the row
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
    'payout_key', v.payout_key,
    'lease_expires_at', v.lease_expires_at
  );
end;
$$;

-- Finalize all database effects atomically after the signer returns.  If this
-- transaction fails, the intent remains retryable and the signer returns the
-- same previously signed transaction on the next attempt.
create or replace function complete_payout_intent(
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

  if v.lease_token is distinct from p_lease_token then
    raise exception 'Payout lease lost';
  end if;

  if v.subject_kind = 'deal' then
    if v.payout_kind in ('release', 'partial_seller') then
      select release_tx_hash into v_existing_hash from deals where id = v.deal_id for update;
      if not found then raise exception 'Deal not found during payout completion'; end if;
      if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
        raise exception 'Deal release already has a different tx hash';
      end if;
      update deals
         set release_tx_hash = p_tx_hash,
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

    select tx_hash into v_existing_hash from transactions where payout_key = v.payout_key;
    if v_existing_hash is distinct from p_tx_hash then
      raise exception 'Custody ledger payout key has a different tx hash';
    end if;
  else
    select tx_hash into v_existing_hash
      from referral_claims where id = v.referral_claim_id for update;
    if not found then raise exception 'Referral claim not found during payout completion'; end if;
    if v_existing_hash is not null and v_existing_hash <> p_tx_hash then
      raise exception 'Referral claim already has a different tx hash';
    end if;
    update referral_claims
       set status = 'paid', tx_hash = p_tx_hash, paid_at = coalesce(paid_at, now())
     where id = v.referral_claim_id;
  end if;

  update payout_intents
     set status = 'broadcast', tx_hash = p_tx_hash, broadcast_at = now(),
         lease_token = null, lease_expires_at = null, last_error = null,
         updated_at = now()
   where payout_key = p_payout_key;

  return jsonb_build_object('tx_hash', p_tx_hash, 'idempotent', false);
end;
$$;

-- Release a lease promptly after a signer/network error.  This never clears a
-- signed transaction at the signer; a retry still uses the identical raw tx.
create or replace function release_payout_intent(
  p_payout_key text,
  p_lease_token text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update payout_intents
     set lease_token = null,
         lease_expires_at = null,
         last_error = left(coalesce(p_error, 'Signer request failed'), 2000),
         updated_at = now()
   where payout_key = p_payout_key
     and status = 'claimed'
     and lease_token = p_lease_token;
end;
$$;

revoke all on function claim_payout_intent(text,text,text,text,text,tx_network,currency,text,numeric,numeric,integer,text)
  from public, anon, authenticated;
revoke all on function complete_payout_intent(text,text,text)
  from public, anon, authenticated;
revoke all on function release_payout_intent(text,text,text)
  from public, anon, authenticated;

grant execute on function claim_payout_intent(text,text,text,text,text,tx_network,currency,text,numeric,numeric,integer,text)
  to service_role;
grant execute on function complete_payout_intent(text,text,text)
  to service_role;
grant execute on function release_payout_intent(text,text,text)
  to service_role;
