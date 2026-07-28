-- 0022: cap open seller deals during beta
--
-- Abuse control: a seller wallet can have at most 10 non-terminal deals at
-- once. Closed deals (released/refunded/partially_refunded/cancelled/expired)
-- do not count. The advisory transaction lock prevents parallel creates from
-- racing past the limit.

create or replace function active_seller_deal_count(p_seller_wallet_address text)
returns int
language sql stable set search_path = public
as $$
  select count(*)::int
  from deals
  where addr_eq(seller_wallet_address, p_seller_wallet_address)
    and status not in ('released', 'refunded', 'partially_refunded', 'cancelled', 'expired')
$$;

grant execute on function active_seller_deal_count(text) to anon, authenticated;

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
  v_id text := 'PH-' || upper(substr(md5(gen_random_uuid()::text),1,4)) || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  v_now timestamptz := now();
  v_seller_norm text := lower(regexp_replace(coalesce(p_seller_wallet_address, ''), '\s', '', 'g'));
  v_active_deals int := 0;
begin
  if caller_addr() is null then raise exception 'Not authenticated'; end if;
  if v_seller_norm = '' then raise exception 'Seller wallet is required'; end if;

  perform pg_advisory_xact_lock(20260701, hashtext(v_seller_norm));

  select count(*)::int
    into v_active_deals
  from deals
  where lower(regexp_replace(coalesce(seller_wallet_address, ''), '\s', '', 'g')) = v_seller_norm
    and status not in ('released', 'refunded', 'partially_refunded', 'cancelled', 'expired');

  if v_active_deals >= 10 then
    raise exception 'You already have 10 active deals. Finish or close one before creating another.';
  end if;

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

grant execute on function create_deal(text,text,numeric,currency,text,int,int,text,text,text,text)
  to anon, authenticated;
