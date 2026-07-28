-- 0011: seller listings (storefront)
create table if not exists listings (
  id                    text primary key default 'LS-' || upper(substr(md5(gen_random_uuid()::text),1,4)) || '-' || upper(substr(md5(gen_random_uuid()::text),1,4)),
  seller_addr           text not null,
  title                 text not null,
  description           text not null default '',
  price_amount          numeric(20,8) not null check (price_amount > 0),
  price_currency        currency not null default 'USDT',
  category              text not null default 'other',
  delivery_hours        integer not null default 48,
  confirmation_hours    integer not null default 24,
  required_delivery_proof text not null default '',
  refund_terms          text not null default '',
  tags                  text[] not null default '{}',
  status                text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  orders_count          integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_listings_seller on listings(seller_addr);
create index if not exists idx_listings_status on listings(status);
create index if not exists idx_listings_category on listings(category);

alter table listings enable row level security;
create policy listings_read   on listings for select using (status <> 'deleted');
create policy listings_insert on listings for insert with check (true);
create policy listings_update on listings for update using (true);

grant select, insert, update on listings to anon, authenticated;
