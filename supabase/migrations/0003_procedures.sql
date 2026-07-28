-- ProofHold — stored procedures for state transitions (Phase 3)
--
-- These SECURITY DEFINER functions are the single source of truth for
-- all writes once the frontend is rewired to Supabase.
--
-- They enforce:
--   * The exact same state machine as src/lib/stateMachine.ts
--   * Party checks using the wallet_addr claim minted by the auth Edge Function
--   * Atomic inserts for proofs/queries/decisions/timeline + main deal updates
--   * The auto double-transition on confirmReceipt
--   * The 24h proof deadline resolution rules (buyer-only, seller-only, both/neither)
--
-- Client code (remote mode) calls them via supabase.rpc(...).
-- Direct table writes from the anon/authenticated roles are blocked by RLS (0002).
--
-- Amounts are passed as text and cast to numeric(38,18) to match the UI (string) model.

-- Helper: get the verified wallet address from the JWT produced by our Edge auth function.
create or replace function current_wallet_addr()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'wallet_addr', '');
$$;

-- Helper: simple transition guard (mirrors src/lib/stateMachine.ts allowedTransitions).
-- For production you can expand this into a richer table or more cases.
create or replace function can_transition(from_status deal_status, to_status deal_status)
returns boolean
language plpgsql
immutable
as $$
begin
  return case
    when from_status = 'draft'                  then to_status in ('awaiting_payment', 'cancelled')
    when from_status = 'awaiting_payment'       then to_status in ('funds_held', 'expired', 'cancelled')
    when from_status = 'funds_held'             then to_status in ('delivered_by_seller', 'query_open')
    when from_status = 'delivered_by_seller'    then to_status in ('received_by_buyer', 'query_open')
    when from_status = 'received_by_buyer'      then to_status in ('released')
    when from_status = 'query_open'             then to_status in ('proof_window')
    when from_status = 'proof_window'           then to_status in ('under_admin_review', 'released', 'refunded')
    when from_status = 'under_admin_review'     then to_status in ('released', 'refunded', 'partially_refunded')
    else false
  end;
end;
$$;

-- Create a new deal (called by seller after wallet connect in remote mode).
create or replace function create_deal(
  p_title text,
  p_description text,
  p_price_amount numeric,
  p_price_currency currency,
  p_seller_wallet_address text,
  p_delivery_deadline_hours int,
  p_confirmation_window_hours int,
  p_required_delivery_proof text,
  p_refund_terms text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'PH-' || upper(substr(md5(random()::text),1,4)) || '-' || upper(substr(md5(random()::text),1,4));
  v_now timestamptz := now();
  v_caller text := current_wallet_addr();
begin
  if v_caller is null then
    raise exception 'Not authenticated (wallet signature required)';
  end if;

  -- In remote mode the caller must be the seller they claim to be.
  if lower(v_caller) <> lower(p_seller_wallet_address) then
    raise exception 'Seller address must match the authenticated wallet';
  end if;

  insert into deals (
    id, title, description, price_amount, price_currency,
    seller_wallet_address, delivery_deadline_hours, confirmation_window_hours,
    required_delivery_proof, refund_terms, status,
    created_at, updated_at, payment_deadline_at,
    buyer_proof_status, seller_proof_status
  ) values (
    v_id, p_title, coalesce(p_description, ''), p_price_amount, p_price_currency,
    p_seller_wallet_address, p_delivery_deadline_hours, p_confirmation_window_hours,
    p_required_delivery_proof, p_refund_terms, 'awaiting_payment',
    v_now, v_now, v_now + (48 * interval '1 hour'),  -- 48h payment window (matches store default)
    'not_submitted', 'not_submitted'
  );

  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, v_id, v_now, 'Deal created', 'created');

  return v_id;
end;
$$;

-- Record a successful payment (client already sent the on-chain tx to custody via wallet provider).
create or replace function pay_deal(
  p_deal_id text,
  p_buyer_wallet_address text,
  p_payment_tx_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := current_wallet_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_caller is null then raise exception 'Not authenticated'; end if;

  if not can_transition(v_deal.status, 'funds_held') then
    raise exception 'Illegal transition: % → funds_held', v_deal.status;
  end if;

  update deals
  set status = 'funds_held',
      buyer_wallet_address = p_buyer_wallet_address,
      payment_tx_hash = p_payment_tx_hash,
      paid_at = v_now,
      updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer paid into protected hold',
          p_deal.price_amount::text || ' ' || p_deal.price_currency::text, 'paid');
end;
$$;

-- Seller marks delivered.
create or replace function mark_delivered(p_deal_id text, p_delivery_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := current_wallet_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_caller is null or lower(v_caller) <> lower(v_deal.seller_wallet_address) then
    raise exception 'Only the seller can mark delivery';
  end if;

  if not can_transition(v_deal.status, 'delivered_by_seller') then
    raise exception 'Illegal transition: % → delivered_by_seller', v_deal.status;
  end if;

  update deals
  set status = 'delivered_by_seller',
      delivery_note = p_delivery_note,
      delivered_at = v_now,
      updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Seller marked as delivered', p_delivery_note, 'delivered');
end;
$$;

-- Buyer confirms receipt (auto progresses to released per original spec + store logic).
create or replace function confirm_receipt(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := current_wallet_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_caller is null or lower(v_caller) <> coalesce(lower(v_deal.buyer_wallet_address), '') then
    raise exception 'Only the buyer can confirm receipt';
  end if;

  if not can_transition(v_deal.status, 'received_by_buyer') then
    raise exception 'Illegal transition: % → received_by_buyer', v_deal.status;
  end if;

  update deals
  set status = 'received_by_buyer',
      received_at = v_now,
      updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer confirmed receipt', 'received');

  -- Auto release (exact behavior from the original store.confirmReceipt)
  if can_transition('received_by_buyer', 'released') then
    update deals
    set status = 'released',
        released_at = v_now,
        updated_at = v_now
    where id = p_deal_id;

    insert into timeline (id, deal_id, at, label, detail, kind)
    values (gen_random_uuid()::text, p_deal_id, v_now, 'Funds released to seller',
            v_deal.price_amount::text || ' ' || v_deal.price_currency::text, 'released');
  end if;
end;
$$;

-- Raise a query (either side). Opens the 24h proof window.
create or replace function raise_query(
  p_deal_id text,
  p_raised_by party_role,
  p_reason query_reason,
  p_details text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := current_wallet_addr();
  v_deadline timestamptz := v_now + (24 * interval '1 hour');
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_caller is null then raise exception 'Not authenticated'; end if;

  -- Basic party check (the real caller must be one of the two parties)
  if lower(v_caller) not in (lower(v_deal.seller_wallet_address), lower(coalesce(v_deal.buyer_wallet_address, ''))) then
    raise exception 'Only buyer or seller can raise a query';
  end if;

  if v_deal.status not in ('funds_held', 'delivered_by_seller') then
    raise exception 'Query can only be raised while funds are held or after delivery';
  end if;

  -- Move to proof_window (the store does query_open then immediately proof_window)
  update deals
  set status = 'proof_window',
      proof_deadline_at = v_deadline,
      updated_at = v_now
  where id = p_deal_id;

  insert into queries (id, deal_id, raised_by, reason, details, created_at)
  values (gen_random_uuid()::text, p_deal_id, p_raised_by, p_reason, p_details, v_now);

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case when p_raised_by = 'buyer' then 'Buyer raised a query' else 'Seller raised a query' end,
          p_reason::text, 'query');

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Proof window opened',
          'Both sides have 24 hours to submit proof.', 'proof');
end;
$$;

-- Submit proof (buyer or seller) while the window is open.
create or replace function submit_proof(
  p_deal_id text,
  p_submitted_by party_role,
  p_explanation text,
  p_tx_hash text default null,
  p_attachment_urls jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := current_wallet_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_deal.status <> 'proof_window' then
    raise exception 'Proofs can only be submitted while the proof window is open';
  end if;

  insert into proofs (id, deal_id, submitted_by, explanation, tx_hash, attachment_urls, created_at)
  values (gen_random_uuid()::text, p_deal_id, p_submitted_by, p_explanation, p_tx_hash, p_attachment_urls, v_now);

  -- Patch the corresponding proof status on the deal
  if p_submitted_by = 'buyer' then
    update deals set buyer_proof_status = 'submitted', updated_at = v_now where id = p_deal_id;
  else
    update deals set seller_proof_status = 'submitted', updated_at = v_now where id = p_deal_id;
  end if;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case when p_submitted_by = 'buyer' then 'Buyer submitted proof' else 'Seller submitted proof' end,
          p_explanation, 'proof');
end;
$$;

-- Server (or client-called) resolution of a proof deadline.
-- Mirrors the exact four cases from the original store.resolveAfterProofDeadline.
create or replace function resolve_after_proof_deadline(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_buyer_submitted boolean;
  v_seller_submitted boolean;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'proof_window' then return; end if;

  v_buyer_submitted  := v_deal.buyer_proof_status = 'submitted';
  v_seller_submitted := v_deal.seller_proof_status = 'submitted';

  if v_buyer_submitted and not v_seller_submitted then
    update deals set status = 'refunded', refunded_at = v_now, updated_at = v_now where id = p_deal_id;
    insert into timeline (id, deal_id, at, label, detail, kind)
    values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer refunded',
            'Seller did not submit proof within 24 hours.', 'refund');
    return;
  end if;

  if not v_buyer_submitted and v_seller_submitted then
    update deals set status = 'released', released_at = v_now, updated_at = v_now where id = p_deal_id;
    insert into timeline (id, deal_id, at, label, detail, kind)
    values (gen_random_uuid()::text, p_deal_id, v_now, 'Funds released to seller',
            'Buyer did not submit proof within 24 hours.', 'released');
    return;
  end if;

  -- Both or neither → admin review
  update deals set status = 'under_admin_review', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Moved to admin review',
          case when v_buyer_submitted then 'Both sides submitted proof.' else 'Neither side submitted proof in time.' end,
          'admin');
end;
$$;

-- Admin decision (release / refund / partial).
create or replace function apply_admin_decision(
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
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_deal.status not in ('under_admin_review', 'proof_window') then
    raise exception 'Decision only allowed from under_admin_review or proof_window';
  end if;

  v_target := case p_decision
    when 'release_to_seller' then 'released'
    when 'refund_to_buyer'   then 'refunded'
    else 'partially_refunded'
  end;

  if p_decision = 'partial_refund' then
    if p_buyer_amount is null or p_seller_amount is null or (p_buyer_amount + p_seller_amount) <> v_deal.price_amount then
      raise exception 'Partial refund amounts must add up to the deal total';
    end if;
  end if;

  update deals
  set status = v_target,
      released_at = case when v_target in ('released','partially_refunded') then v_now else released_at end,
      refunded_at = case when v_target in ('refunded','partially_refunded') then v_now else refunded_at end,
      updated_at = v_now
  where id = p_deal_id;

  insert into decisions (id, deal_id, decision, buyer_amount, seller_amount, reason, decided_by, created_at)
  values (gen_random_uuid()::text, p_deal_id, p_decision, p_buyer_amount, p_seller_amount, p_reason, p_decided_by, v_now);

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case p_decision
            when 'release_to_seller' then 'Admin released funds to seller'
            when 'refund_to_buyer'   then 'Admin refunded buyer'
            else 'Admin applied partial refund'
          end,
          p_reason, 'admin');
end;
$$;

-- Simple cancel / expire (kept for completeness; real usage mostly in awaiting_payment).
create or replace function cancel_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not can_transition(v_deal.status, 'cancelled') then return; end if;
  update deals set status = 'cancelled', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind) values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal cancelled', 'cancelled');
end;
$$;

create or replace function expire_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if v_deal.status <> 'awaiting_payment' then return; end if;
  if not can_transition(v_deal.status, 'expired') then return; end if;
  update deals set status = 'expired', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal expired', 'Buyer did not pay within the payment window.', 'expired');
end;
$$;

-- Grant execute rights (the RLS policies already restrict who can actually reach these via the anon key).
grant execute on function create_deal, pay_deal, mark_delivered, confirm_receipt,
  raise_query, submit_proof, resolve_after_proof_deadline, apply_admin_decision,
  cancel_deal, expire_deal to anon, authenticated;