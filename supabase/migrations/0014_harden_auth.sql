-- 0014: production auth hardening
--
-- Supersedes the demo-relaxed procedures (0004/0005) by re-enforcing wallet
-- identity on every state transition, gating admin actions, adding deadline
-- guards, and locking down direct-write RLS on offers/listings/deal_messages.
--
-- Requires the auth Edge Function to mint JWTs carrying `wallet_addr` and
-- `app_role` claims (see functions/auth). Public SELECT stays open (link-as-token).

-- ── identity helpers ─────────────────────────────────────────────────────────
-- Normalised (lowercased, whitespace-stripped) caller address from the JWT.
create or replace function caller_addr()
returns text language sql stable as $$
  select nullif(lower(regexp_replace(coalesce(auth.jwt() ->> 'wallet_addr', ''), '\s', '', 'g')), '')
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'app_role', '') = 'admin'
$$;

-- Whitespace/case-insensitive address compare (NQ addresses carry spaces).
create or replace function addr_eq(a text, b text)
returns boolean language sql immutable as $$
  select lower(regexp_replace(coalesce(a, ''), '\s', '', 'g'))
       = lower(regexp_replace(coalesce(b, ''), '\s', '', 'g'))
$$;

grant execute on function caller_addr, is_admin, addr_eq to anon, authenticated;

-- ── create_deal (11-arg, listing-aware) ──────────────────────────────────────
-- Creator may be the buyer (direct buy) or seller (accepted offer); the seller
-- address is data. Only require an authenticated caller.
create or replace function create_deal(
  p_title                     text,
  p_description               text,
  p_price_amount              numeric,
  p_price_currency            currency,
  p_seller_wallet_address     text,
  p_delivery_deadline_hours   int,
  p_confirmation_window_hours int,
  p_required_delivery_proof   text,
  p_refund_terms              text,
  p_category                  text default 'other',
  p_listing_id                text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id  text := 'PH-' || upper(substr(md5(gen_random_uuid()::text),1,4)) || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  v_now timestamptz := now();
begin
  if caller_addr() is null then raise exception 'Not authenticated'; end if;

  insert into deals (
    id, title, description, price_amount, price_currency,
    seller_wallet_address, delivery_deadline_hours, confirmation_window_hours,
    required_delivery_proof, refund_terms, status, category, listing_id,
    created_at, updated_at, payment_deadline_at,
    buyer_proof_status, seller_proof_status
  ) values (
    v_id, p_title, coalesce(p_description, ''), p_price_amount, p_price_currency,
    p_seller_wallet_address, p_delivery_deadline_hours, p_confirmation_window_hours,
    p_required_delivery_proof, p_refund_terms, 'awaiting_payment',
    coalesce(p_category, 'other'), p_listing_id,
    v_now, v_now, v_now + (48 * interval '1 hour'),
    'not_submitted', 'not_submitted'
  );

  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, v_id, v_now, 'Deal created', 'created');

  return v_id;
end;
$$;

-- ── pay_deal — caller becomes the buyer ──────────────────────────────────────
create or replace function pay_deal(
  p_deal_id text, p_buyer_wallet_address text, p_payment_tx_hash text
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not addr_eq(p_buyer_wallet_address, v_caller) then
    raise exception 'Payer must be the connected wallet';
  end if;
  if not can_transition(v_deal.status, 'funds_held') then
    raise exception 'Illegal transition: % -> funds_held', v_deal.status;
  end if;

  update deals set status = 'funds_held', buyer_wallet_address = p_buyer_wallet_address,
    payment_tx_hash = p_payment_tx_hash, paid_at = v_now, updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer paid into protected hold',
          v_deal.price_amount::text || ' ' || v_deal.price_currency::text, 'paid');
end;
$$;

-- ── mark_delivered — seller only ─────────────────────────────────────────────
create or replace function mark_delivered(p_deal_id text, p_delivery_note text default '')
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null or not addr_eq(v_deal.seller_wallet_address, v_caller) then
    raise exception 'Only the seller can mark delivery';
  end if;
  if v_deal.status <> 'funds_held' then raise exception 'Deal is not in funds_held status'; end if;

  update deals set status = 'delivered_by_seller',
    delivery_note = coalesce(nullif(p_delivery_note, ''), delivery_note),
    delivered_at = v_now,
    confirmation_deadline_at = v_now + (v_deal.confirmation_window_hours || ' hours')::interval,
    updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Seller marked as delivered', p_delivery_note, 'delivered');
end;
$$;

-- ── confirm_receipt — buyer only (auto-releases) ─────────────────────────────
create or replace function confirm_receipt(p_deal_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null or not addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Only the buyer can confirm receipt';
  end if;
  if not can_transition(v_deal.status, 'received_by_buyer') then
    raise exception 'Illegal transition: % -> received_by_buyer', v_deal.status;
  end if;

  update deals set status = 'received_by_buyer', received_at = v_now, updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer confirmed receipt', 'received');

  update deals set status = 'released', released_at = v_now, updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Funds released to seller',
          v_deal.price_amount::text || ' ' || v_deal.price_currency::text, 'released');

  if v_deal.listing_id is not null then
    update listings set orders_count = orders_count + 1, updated_at = v_now where id = v_deal.listing_id;
  end if;
end;
$$;

-- ── raise_query — a party only, side derived from the caller ──────────────────
create or replace function raise_query(
  p_deal_id text, p_raised_by party_role, p_reason query_reason, p_details text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
  v_role party_role; v_deadline timestamptz := now() + (24 * interval '1 hour');
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null then raise exception 'Not authenticated'; end if;

  if addr_eq(v_deal.seller_wallet_address, v_caller) then v_role := 'seller';
  elsif addr_eq(v_deal.buyer_wallet_address, v_caller) then v_role := 'buyer';
  else raise exception 'Only buyer or seller can raise a query'; end if;
  if p_raised_by <> v_role then raise exception 'Cannot raise a query as the other party'; end if;

  if v_deal.status not in ('funds_held', 'delivered_by_seller') then
    raise exception 'Query can only be raised while funds are held or after delivery';
  end if;

  update deals set status = 'proof_window', proof_deadline_at = v_deadline, updated_at = v_now where id = p_deal_id;

  insert into queries (id, deal_id, raised_by, reason, details, created_at)
  values (gen_random_uuid()::text, p_deal_id, v_role, p_reason, p_details, v_now);
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case when v_role = 'buyer' then 'Buyer raised a query' else 'Seller raised a query' end,
          p_reason::text, 'query');
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Proof window opened',
          'Both sides have 24 hours to submit proof.', 'proof');
end;
$$;

-- ── submit_proof — a party only, side derived from the caller ─────────────────
create or replace function submit_proof(
  p_deal_id text, p_submitted_by party_role, p_explanation text,
  p_tx_hash text default null, p_attachment_urls jsonb default '[]'::jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr(); v_role party_role;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_deal.status <> 'proof_window' then
    raise exception 'Proofs can only be submitted while the proof window is open';
  end if;

  if addr_eq(v_deal.seller_wallet_address, v_caller) then v_role := 'seller';
  elsif addr_eq(v_deal.buyer_wallet_address, v_caller) then v_role := 'buyer';
  else raise exception 'Only buyer or seller can submit proof'; end if;
  if p_submitted_by <> v_role then raise exception 'Cannot submit proof as the other party'; end if;

  insert into proofs (id, deal_id, submitted_by, explanation, tx_hash, attachment_urls, created_at)
  values (gen_random_uuid()::text, p_deal_id, v_role, p_explanation, p_tx_hash, p_attachment_urls, v_now);

  if v_role = 'buyer' then
    update deals set buyer_proof_status = 'submitted', updated_at = v_now where id = p_deal_id;
  else
    update deals set seller_proof_status = 'submitted', updated_at = v_now where id = p_deal_id;
  end if;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case when v_role = 'buyer' then 'Buyer submitted proof' else 'Seller submitted proof' end,
          p_explanation, 'proof');
end;
$$;

-- ── resolve_after_proof_deadline — only once the deadline has passed ──────────
create or replace function resolve_after_proof_deadline(p_deal_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_b boolean; v_s boolean;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'proof_window' then return; end if;
  if v_deal.proof_deadline_at is null or v_deal.proof_deadline_at > v_now then return; end if;

  v_b := v_deal.buyer_proof_status = 'submitted';
  v_s := v_deal.seller_proof_status = 'submitted';

  if v_b and not v_s then
    update deals set status = 'refunded', refunded_at = v_now, updated_at = v_now where id = p_deal_id;
    insert into timeline (id, deal_id, at, label, detail, kind)
    values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer refunded', 'Seller did not submit proof within 24 hours.', 'refund');
    return;
  end if;
  if not v_b and v_s then
    update deals set status = 'released', released_at = v_now, updated_at = v_now where id = p_deal_id;
    insert into timeline (id, deal_id, at, label, detail, kind)
    values (gen_random_uuid()::text, p_deal_id, v_now, 'Funds released to seller', 'Buyer did not submit proof within 24 hours.', 'released');
    if v_deal.listing_id is not null then
      update listings set orders_count = orders_count + 1, updated_at = v_now where id = v_deal.listing_id;
    end if;
    return;
  end if;

  update deals set status = 'under_admin_review', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Moved to admin review',
          case when v_b then 'Both sides submitted proof.' else 'Neither side submitted proof in time.' end, 'admin');
end;
$$;

-- ── apply_admin_decision — admins only ───────────────────────────────────────
create or replace function apply_admin_decision(
  p_deal_id text, p_decision admin_decision_type, p_reason text,
  p_buyer_amount numeric default null, p_seller_amount numeric default null,
  p_decided_by text default 'admin'
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_target deal_status; v_caller text := caller_addr();
begin
  if not is_admin() then raise exception 'Admin privileges required'; end if;

  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status not in ('under_admin_review', 'proof_window') then
    raise exception 'Decision only allowed from under_admin_review or proof_window';
  end if;

  v_target := case p_decision
    when 'release_to_seller' then 'released'
    when 'refund_to_buyer'   then 'refunded'
    else 'partially_refunded' end;

  if p_decision = 'partial_refund' then
    if p_buyer_amount is null or p_seller_amount is null or (p_buyer_amount + p_seller_amount) <> v_deal.price_amount then
      raise exception 'Partial refund amounts must add up to the deal total';
    end if;
  end if;

  update deals set status = v_target,
    released_at = case when v_target in ('released','partially_refunded') then v_now else released_at end,
    refunded_at = case when v_target in ('refunded','partially_refunded') then v_now else refunded_at end,
    updated_at = v_now
  where id = p_deal_id;

  insert into decisions (id, deal_id, decision, buyer_amount, seller_amount, reason, decided_by, created_at)
  values (gen_random_uuid()::text, p_deal_id, p_decision, p_buyer_amount, p_seller_amount, p_reason,
          coalesce(v_caller, p_decided_by), v_now);

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case p_decision
            when 'release_to_seller' then 'Admin released funds to seller'
            when 'refund_to_buyer'   then 'Admin refunded buyer'
            else 'Admin applied partial refund' end, p_reason, 'admin');

  if v_target = 'released' and v_deal.listing_id is not null then
    update listings set orders_count = orders_count + 1, updated_at = v_now where id = v_deal.listing_id;
  end if;
end;
$$;

-- ── cancel_deal — seller only, pre-payment ───────────────────────────────────
create or replace function cancel_deal(p_deal_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_caller is null or not addr_eq(v_deal.seller_wallet_address, v_caller) then
    raise exception 'Only the seller can cancel this deal';
  end if;
  if not can_transition(v_deal.status, 'cancelled') then return; end if;
  update deals set status = 'cancelled', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal cancelled', 'cancelled');
end;
$$;

-- ── expire_deal — only once the payment window has passed ─────────────────────
create or replace function expire_deal(p_deal_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'awaiting_payment' then return; end if;
  if v_deal.payment_deadline_at is null or v_deal.payment_deadline_at > v_now then return; end if;
  update deals set status = 'expired', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal expired', 'Buyer did not pay within the payment window.', 'expired');
end;
$$;

-- ── submit_feedback — a finalized deal's participant only ─────────────────────
create or replace function submit_feedback(
  p_deal_id text, p_from_addr text, p_to_addr text, p_from_role party_role,
  p_rating integer, p_comment text default ''
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_caller text := caller_addr(); v_role party_role;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if v_deal.status not in ('released', 'refunded', 'partially_refunded') then
    raise exception 'Feedback can only be left after a deal is finalized';
  end if;

  if addr_eq(v_deal.seller_wallet_address, v_caller) then v_role := 'seller';
  elsif addr_eq(v_deal.buyer_wallet_address, v_caller) then v_role := 'buyer';
  else raise exception 'Only the buyer or seller can leave feedback'; end if;

  insert into feedbacks (id, deal_id, from_addr, to_addr, from_role, rating, comment, created_at)
  values (gen_random_uuid()::text, p_deal_id, lower(v_caller),
          lower(case when v_role = 'buyer' then v_deal.seller_wallet_address else v_deal.buyer_wallet_address end),
          v_role, p_rating, coalesce(p_comment, ''), now())
  on conflict (deal_id, from_role) do nothing;
end;
$$;

grant execute on function
  create_deal(text,text,numeric,currency,text,int,int,text,text,text,text),
  pay_deal(text,text,text), mark_delivered(text,text), confirm_receipt(text),
  raise_query(text,party_role,query_reason,text),
  submit_proof(text,party_role,text,text,jsonb),
  resolve_after_proof_deadline(text), apply_admin_decision(text,admin_decision_type,text,numeric,numeric,text),
  cancel_deal(text), expire_deal(text),
  submit_feedback(text,text,text,party_role,integer,text)
  to anon, authenticated;

-- ── RLS: direct-write tables locked to the owning wallet ─────────────────────
drop policy if exists listings_insert on listings;
drop policy if exists listings_update on listings;
create policy listings_insert on listings for insert with check (addr_eq(seller_addr, caller_addr()));
create policy listings_update on listings for update using (addr_eq(seller_addr, caller_addr()));

drop policy if exists offers_insert on offers;
drop policy if exists offers_update on offers;
create policy offers_insert on offers for insert with check (addr_eq(buyer_addr, caller_addr()));
create policy offers_update on offers for update
  using (addr_eq(buyer_addr, caller_addr()) or addr_eq(seller_addr, caller_addr()));

drop policy if exists dm_insert on deal_messages;
create policy dm_insert on deal_messages for insert with check (addr_eq(sender_addr, caller_addr()));
