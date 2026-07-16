-- 0034: return a reserved marketplace unit when a deal closes before payment.
-- A submitted hash is deliberately not restocked automatically: the payment
-- verifier may still prove it later and restore the deal to funds_held.

create or replace function restore_listing_inventory(p_listing_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings%rowtype;
begin
  select * into v_listing from listings where id = p_listing_id for update;
  if not found or v_listing.status = 'deleted' then return; end if;
  if v_listing.quantity_available >= v_listing.quantity_total then return; end if;

  perform set_config('app.inventory_restock', 'true', true);
  update listings
     set quantity_available = quantity_available + 1,
         status = case when status = 'sold_out' then 'active' else status end,
         updated_at = now()
   where id = p_listing_id;
end;
$$;
revoke all on function restore_listing_inventory(text) from public, anon, authenticated;

create or replace function guard_listing_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_restock boolean := coalesce(current_setting('app.inventory_restock', true), 'false') = 'true';
begin
  if new.quantity_total <> old.quantity_total then
    raise exception 'Listing quantity cannot be changed after publishing';
  end if;
  if new.quantity_available <> old.quantity_available
     and new.quantity_available <> old.quantity_available - 1
     and not (v_restock and new.quantity_available = old.quantity_available + 1) then
    raise exception 'Listing inventory can only be changed by a purchase or unpaid-deal expiry';
  end if;
  if new.quantity_available = 0 and new.status = 'active' then
    raise exception 'An out-of-stock listing must be sold out';
  end if;
  if old.status = 'sold_out' and new.status = 'active' and not v_restock then
    raise exception 'A sold-out listing cannot be reactivated';
  end if;
  return new;
end;
$$;

create or replace function expire_deal(p_deal_id text)
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
  if not found or v_deal.status <> 'awaiting_payment' then return; end if;
  if v_deal.payment_deadline_at is null
     or v_deal.payment_deadline_at + interval '15 minutes' > v_now then return; end if;
  if v_deal.payment_started_at is not null
     and v_deal.payment_started_at > v_now - interval '15 minutes' then return; end if;
  if v_deal.payment_tx_hash is not null
     and (v_deal.payment_submitted_at is null or v_deal.payment_submitted_at > v_now - interval '24 hours') then
    return;
  end if;

  update deals set status = 'expired', updated_at = v_now where id = p_deal_id;
  if v_deal.listing_id is not null and v_deal.payment_tx_hash is null then
    perform restore_listing_inventory(v_deal.listing_id);
  end if;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal expired',
          'Buyer did not provide a verifiable payment within the payment window.', 'expired');
end;
$$;

create or replace function cancel_deal(p_deal_id text)
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
  if not found then return; end if;
  if v_caller is null or not addr_eq(v_deal.seller_wallet_address, v_caller) then
    raise exception 'Only the seller can cancel this deal';
  end if;
  if v_deal.payment_tx_hash is not null
     or (v_deal.payment_started_at is not null and v_deal.payment_started_at > v_now - interval '15 minutes') then
    raise exception 'Payment verification is pending; this deal cannot be cancelled';
  end if;
  if not can_transition(v_deal.status, 'cancelled') then return; end if;

  update deals set status = 'cancelled', updated_at = v_now where id = p_deal_id;
  if v_deal.listing_id is not null then perform restore_listing_inventory(v_deal.listing_id); end if;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal cancelled', 'cancelled');
  perform app_notify(v_deal.buyer_wallet_address, 'deal', 'Deal cancelled',
    'Deal ' || p_deal_id || ' was cancelled by the seller.', '/deal/' || p_deal_id,
    p_deal_id, 'deal:' || p_deal_id || ':cancelled');
end;
$$;
