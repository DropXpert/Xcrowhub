-- 0005: Transitional caller compatibility for remaining procedures.
-- create_deal, mark_delivered, raise_query, submit_proof, cancel_deal
-- accept the actor address from the request body for early client sessions.
-- Later migrations tighten wallet-auth checks through Edge-minted JWTs.

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
  v_id text := 'PH-' || upper(substr(md5(gen_random_uuid()::text),1,4)) || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  v_now timestamptz := now();
begin
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
    v_now, v_now, v_now + (48 * interval '1 hour'),
    'not_submitted', 'not_submitted'
  );

  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, v_id, v_now, 'Deal created', 'created');

  return v_id;
end;
$$;

create or replace function mark_delivered(p_deal_id text, p_delivery_note text)
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
  if not found then raise exception 'Deal not found'; end if;

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
  v_deadline timestamptz := now() + (24 * interval '1 hour');
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_deal.status not in ('funds_held', 'delivered_by_seller') then
    raise exception 'Query can only be raised while funds are held or after delivery';
  end if;

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
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_deal.status <> 'proof_window' then
    raise exception 'Proofs can only be submitted while the proof window is open';
  end if;

  insert into proofs (id, deal_id, submitted_by, explanation, tx_hash, attachment_urls, created_at)
  values (gen_random_uuid()::text, p_deal_id, p_submitted_by, p_explanation, p_tx_hash, p_attachment_urls, v_now);

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

create or replace function cancel_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if not can_transition(v_deal.status, 'cancelled') then return; end if;
  update deals set status = 'cancelled', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal cancelled', 'cancelled');
end;
$$;

grant execute on function create_deal, mark_delivered, raise_query, submit_proof, cancel_deal
  to anon, authenticated;
