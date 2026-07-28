-- 0033: inventory-aware marketplace listings.
-- A listing reserves one unit as soon as a buyer starts an escrow deal (direct
-- buy or accepted offer). When the last unit is reserved it becomes sold_out,
-- so no second buyer can pay for an unavailable item.

alter table listings
  add column if not exists quantity_total integer not null default 1,
  add column if not exists quantity_available integer not null default 1;

alter table listings
  drop constraint if exists listings_quantity_total_check,
  drop constraint if exists listings_quantity_available_check,
  add constraint listings_quantity_total_check check (quantity_total >= 1),
  add constraint listings_quantity_available_check check (
    quantity_available >= 0 and quantity_available <= quantity_total
  );

alter table listings drop constraint if exists listings_status_check;
alter table listings
  add constraint listings_status_check
  check (status in ('active', 'paused', 'sold_out', 'deleted'));

-- Sellers may pause an in-stock listing, but cannot resurrect or increase
-- inventory through a direct client update. Inventory is consumed only by the
-- two atomic purchase paths below.
create or replace function guard_listing_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quantity_total <> old.quantity_total then
    raise exception 'Listing quantity cannot be changed after publishing';
  end if;
  if new.quantity_available <> old.quantity_available
     and new.quantity_available <> old.quantity_available - 1 then
    raise exception 'Listing inventory can only be reserved by a purchase';
  end if;
  if new.quantity_available = 0 and new.status = 'active' then
    raise exception 'An out-of-stock listing must be sold out';
  end if;
  if old.status = 'sold_out' and new.status = 'active' then
    raise exception 'A sold-out listing cannot be reactivated';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_listing_inventory on listings;
create trigger guard_listing_inventory
before update of quantity_total, quantity_available, status on listings
for each row execute function guard_listing_inventory();

create or replace function buy_marketplace_listing(p_listing_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings%rowtype;
  v_buyer text := caller_addr();
  v_deal_id text;
begin
  if v_buyer is null then raise exception 'Not authenticated'; end if;

  select * into v_listing from listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'active' or v_listing.quantity_available <= 0 then
    raise exception 'This listing is sold out or unavailable';
  end if;
  if addr_eq(v_listing.seller_addr, v_buyer) then
    raise exception 'You cannot buy your own listing';
  end if;

  update listings
     set quantity_available = quantity_available - 1,
         status = case when quantity_available = 1 then 'sold_out' else status end,
         updated_at = now()
   where id = v_listing.id;

  if v_listing.quantity_available = 1 then
    update offers
       set status = 'expired', updated_at = now()
     where listing_id = v_listing.id
       and status in ('pending', 'countered');
  end if;

  v_deal_id := create_deal(
    v_listing.title, v_listing.description, v_listing.price_amount,
    v_listing.price_currency, coalesce(v_listing.payout_addr, v_listing.seller_addr),
    v_listing.delivery_hours, v_listing.confirmation_hours,
    coalesce(v_listing.required_delivery_proof, ''), coalesce(v_listing.refund_terms, ''),
    coalesce(v_listing.category, 'other'), v_listing.id
  );

  update deals set buyer_wallet_address = v_buyer, updated_at = now() where id = v_deal_id;
  return v_deal_id;
end;
$$;

revoke all on function buy_marketplace_listing(text) from public, anon;
grant execute on function buy_marketplace_listing(text) to authenticated;

-- Recreate acceptance so an accepted offer consumes stock in the same
-- transaction as the offer/deal link.
create or replace function accept_marketplace_offer(p_offer_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer offers%rowtype;
  v_listing listings%rowtype;
  v_deal_id text;
  v_caller text := caller_addr();
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_offer from offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_offer.expires_at <= now() then raise exception 'This offer has expired'; end if;
  if (v_offer.status = 'pending' and not addr_eq(v_offer.seller_addr, v_caller))
     or (v_offer.status = 'countered' and not addr_eq(v_offer.buyer_addr, v_caller))
     or v_offer.status not in ('pending', 'countered') then
    raise exception 'You cannot accept this offer';
  end if;

  select * into v_listing from listings where id = v_offer.listing_id for update;
  if not found or v_listing.status <> 'active' or v_listing.quantity_available <= 0 then
    raise exception 'This listing is sold out or unavailable';
  end if;
  if v_listing.price_currency <> v_offer.currency then
    raise exception 'Offer currency does not match the listing';
  end if;

  update listings
     set quantity_available = quantity_available - 1,
         status = case when quantity_available = 1 then 'sold_out' else status end,
         updated_at = now()
   where id = v_listing.id;

  if v_listing.quantity_available = 1 then
    update offers
       set status = 'expired', updated_at = now()
     where listing_id = v_listing.id
       and id <> v_offer.id
       and status in ('pending', 'countered');
  end if;

  v_deal_id := create_deal(
    v_listing.title, v_listing.description, v_offer.current_amount, v_offer.currency,
    coalesce(v_listing.payout_addr, v_listing.seller_addr), v_listing.delivery_hours,
    v_listing.confirmation_hours, coalesce(v_listing.required_delivery_proof, ''),
    coalesce(v_listing.refund_terms, ''), coalesce(v_listing.category, 'other'), v_listing.id
  );
  update deals set buyer_wallet_address = v_offer.buyer_addr, updated_at = now() where id = v_deal_id;
  update offers set status = 'accepted', deal_id = v_deal_id, updated_at = now() where id = v_offer.id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, v_deal_id, now(), 'Marketplace offer accepted',
          'Buyer is assigned and can fund escrow.', 'created');
  return v_deal_id;
end;
$$;
