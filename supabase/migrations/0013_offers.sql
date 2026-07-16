-- 0013: marketplace offers (buyer↔seller price negotiation)
--
-- Lightweight pre-deal layer that mirrors the permissive patterns used by
-- listings (0011) and deal_messages (0010): a plain table with direct
-- insert/update + realtime. It never touches the escrow state machine — on
-- acceptance the frontend calls the existing create_deal() at the agreed price.
--
-- Offer lifecycle (single mutable row):
--   pending   → seller's turn  (accept / decline / counter)
--   countered → buyer's turn   (accept / decline)
--   accepted  (carries deal_id) | declined | withdrawn | expired   [terminal]

create table if not exists offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      text not null references listings(id) on delete cascade,
  buyer_addr      text not null,
  seller_addr     text not null,
  currency        currency not null,
  original_amount numeric(20,8) not null check (original_amount > 0),
  current_amount  numeric(20,8) not null check (current_amount > 0),
  message         text not null default '' check (length(message) <= 500),
  status          text not null default 'pending'
                    check (status in ('pending','countered','accepted','declined','withdrawn','expired')),
  deal_id         text references deals(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '48 hours'
);

create index if not exists idx_offers_seller  on offers(seller_addr, status);
create index if not exists idx_offers_buyer   on offers(buyer_addr, status);
create index if not exists idx_offers_listing on offers(listing_id);

alter table offers enable row level security;
create policy offers_read   on offers for select using (true);
create policy offers_insert on offers for insert with check (current_amount > 0);
create policy offers_update on offers for update using (true);

grant select, insert, update on offers to anon, authenticated;

-- Realtime so sellers see new offers and buyers see status changes live.
alter publication supabase_realtime add table offers;

-- ── Orders count (was called by listingStore but never defined → no-op until now) ──
-- Credited on deal *release*, not on deal creation, so the count reflects
-- genuinely completed sales rather than abandoned payment links.
create or replace function increment_listing_orders(p_listing_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set orders_count = orders_count + 1,
      updated_at   = now()
  where id = p_listing_id;
end;
$$;

grant execute on function increment_listing_orders(text) to anon, authenticated;

-- ── Link deals back to the listing they came from (additive) ──────────────────
-- Lets release-time order crediting know which listing to credit, and enables
-- listing↔deal analytics later. Nullable so direct/legacy deals stay valid.
alter table deals add column if not exists listing_id text;

-- Re-create create_deal with an extra p_listing_id arg. Faithful copy of the
-- 0006 body (10-arg, with category) plus listing_id in the INSERT. Additive:
-- the param defaults to null so existing callers are unaffected.
drop function if exists create_deal(text,text,numeric,currency,text,int,int,text,text,text);

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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  text := 'PH-' || upper(substr(md5(gen_random_uuid()::text),1,4)) || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  v_now timestamptz := now();
begin
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

grant execute on function create_deal(text,text,numeric,currency,text,int,int,text,text,text,text) to anon, authenticated;
