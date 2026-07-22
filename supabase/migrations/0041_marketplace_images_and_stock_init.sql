-- Marketplace product images and correct initial inventory.

alter table public.listings
  add column if not exists image_path text;

alter table public.listings
  drop constraint if exists listings_quantity_total_check,
  add constraint listings_quantity_total_check check (quantity_total between 1 and 1000),
  drop constraint if exists listings_image_path_check,
  add constraint listings_image_path_check check (
    image_path is null
    or (
      char_length(image_path) between 1 and 500
      and image_path !~ '(^|/)\.\.(/|$)'
      and split_part(image_path, '/', 1) = norm_addr(seller_addr)
    )
  );

-- A listing always starts with all units available. Previously the column's
-- default of 1 was retained when quantity_total was greater than one.
create or replace function public.initialise_listing_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.quantity_available := new.quantity_total;
  return new;
end;
$$;

drop trigger if exists initialise_listing_inventory on public.listings;
create trigger initialise_listing_inventory
before insert on public.listings
for each row execute function public.initialise_listing_inventory();

-- Repair existing rows from authoritative marketplace deals. Every deal that
-- was not cancelled/expired consumed one unit; unpaid cancelled/expired deals
-- have already returned their reservation.
alter table public.listings disable trigger guard_listing_inventory;
with inventory as (
  select
    l.id,
    greatest(
      0,
      l.quantity_total - count(d.id) filter (
        where d.status not in ('cancelled'::deal_status, 'expired'::deal_status)
      )::integer
    ) as expected_available
  from public.listings l
  left join public.deals d on d.listing_id = l.id
  group by l.id, l.quantity_total
)
update public.listings l
set
  quantity_available = i.expected_available,
  status = case
    when l.status = 'deleted' then 'deleted'
    when i.expected_available = 0 then 'sold_out'
    when l.status = 'sold_out' then 'active'
    else l.status
  end,
  updated_at = now()
from inventory i
where l.id = i.id
  and (
    l.quantity_available <> i.expected_available
    or (l.status = 'sold_out' and i.expected_available > 0)
    or (l.status <> 'deleted' and l.status <> 'sold_out' and i.expected_available = 0)
  );
alter table public.listings enable trigger guard_listing_inventory;

-- Public image delivery with authenticated, owner-scoped writes. The first
-- object-path segment is the normalized wallet address from the signed JWT.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists listing_images_owner_insert on storage.objects;
create policy listing_images_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = public.caller_addr()
);

drop policy if exists listing_images_owner_delete on storage.objects;
create policy listing_images_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] = public.caller_addr()
);

-- A stale client must not create a new offer after the last unit is reserved.
create or replace function public.validate_marketplace_offer_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
begin
  select * into v_listing from public.listings where id = new.listing_id;
  if not found or v_listing.status <> 'active' or v_listing.quantity_available <= 0 then
    raise exception 'This listing is sold out or unavailable';
  end if;
  if not addr_eq(new.seller_addr, v_listing.seller_addr) then
    raise exception 'Offer seller does not match listing owner';
  end if;
  if new.currency <> v_listing.price_currency then
    raise exception 'Offer currency does not match listing currency';
  end if;
  if addr_eq(new.buyer_addr, v_listing.seller_addr) then
    raise exception 'You cannot make an offer on your own listing';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_marketplace_offer_inventory on public.offers;
create trigger validate_marketplace_offer_inventory
before insert on public.offers
for each row execute function public.validate_marketplace_offer_inventory();
