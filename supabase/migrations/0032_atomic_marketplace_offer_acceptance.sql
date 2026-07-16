-- 0032: accept a marketplace offer atomically and bind its buyer to the deal.
--
-- A listing is reusable: accepting one offer starts one escrow deal without
-- removing the listing from browse. This RPC makes the accepted offer the
-- authoritative buyer, so it appears in both parties' deal history before
-- payment and cannot be accepted twice during concurrent clicks.

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
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_offer
  from offers
  where id = p_offer_id
  for update;
  if not found then
    raise exception 'Offer not found';
  end if;

  if v_offer.expires_at <= now() then
    raise exception 'This offer has expired';
  end if;

  -- The seller accepts a new offer; the buyer accepts a seller counter.
  if (v_offer.status = 'pending' and not addr_eq(v_offer.seller_addr, v_caller))
     or (v_offer.status = 'countered' and not addr_eq(v_offer.buyer_addr, v_caller))
     or v_offer.status not in ('pending', 'countered') then
    raise exception 'You cannot accept this offer';
  end if;

  select * into v_listing
  from listings
  where id = v_offer.listing_id
  for update;
  if not found or v_listing.status <> 'active' then
    raise exception 'This listing is no longer available';
  end if;
  if v_listing.price_currency <> v_offer.currency then
    raise exception 'Offer currency does not match the listing';
  end if;

  v_deal_id := create_deal(
    v_listing.title,
    v_listing.description,
    v_offer.current_amount,
    v_offer.currency,
    coalesce(v_listing.payout_addr, v_listing.seller_addr),
    v_listing.delivery_hours,
    v_listing.confirmation_hours,
    coalesce(v_listing.required_delivery_proof, ''),
    coalesce(v_listing.refund_terms, ''),
    coalesce(v_listing.category, 'other'),
    v_listing.id
  );

  update deals
     set buyer_wallet_address = v_offer.buyer_addr,
         updated_at = now()
   where id = v_deal_id;

  update offers
     set status = 'accepted',
         deal_id = v_deal_id,
         updated_at = now()
   where id = v_offer.id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text, v_deal_id, now(), 'Marketplace offer accepted',
    'Buyer is assigned and can fund escrow.', 'created'
  );

  return v_deal_id;
end;
$$;

revoke all on function accept_marketplace_offer(uuid) from public, anon;
grant execute on function accept_marketplace_offer(uuid) to authenticated;

-- An accepted offer must always be backed by the atomic RPC above.  Keep the
-- existing direct client actions (withdraw/decline/counter), but prohibit a
-- client from forging an accepted status or attaching an arbitrary deal ID.
drop policy if exists offers_update on offers;
create policy offers_update on offers for update
  using (addr_eq(buyer_addr, caller_addr()) or addr_eq(seller_addr, caller_addr()))
  with check (
    (addr_eq(buyer_addr, caller_addr()) or addr_eq(seller_addr, caller_addr()))
    and status <> 'accepted'
    and deal_id is null
  );
