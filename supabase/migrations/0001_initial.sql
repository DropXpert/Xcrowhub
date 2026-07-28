-- ProofHold — initial schema for Supabase Postgres.
--
-- Naming: snake_case to match SQL convention. App-side TypeScript types
-- in src/types/deal.ts use camelCase; mapping happens in the API client.
--
-- Time fields: timestamptz (Supabase default). ISO-8601 over the wire.
-- Amounts: numeric(38, 18) — handles NIM (5 decimals) and wei-scale alike.

create type deal_status as enum (
  'draft',
  'awaiting_payment',
  'funds_held',
  'delivered_by_seller',
  'received_by_buyer',
  'released',
  'query_open',
  'proof_window',
  'under_admin_review',
  'refunded',
  'partially_refunded',
  'cancelled',
  'expired'
);

create type currency as enum ('NIM', 'USDT');

create type proof_status as enum ('not_submitted', 'submitted');

create type party_role as enum ('buyer', 'seller');

create type query_reason as enum (
  'product_not_received',
  'wrong_product',
  'broken_link',
  'incomplete_delivery',
  'buyer_not_confirming',
  'false_claim',
  'no_response',
  'other'
);

create type admin_decision_type as enum (
  'release_to_seller',
  'refund_to_buyer',
  'partial_refund'
);

create type timeline_kind as enum (
  'created', 'paid', 'delivered', 'received', 'released',
  'query', 'proof', 'admin', 'refund', 'cancelled', 'expired'
);

create type tx_direction as enum ('in', 'out');
create type tx_network as enum ('nimiq', 'evm');
create type tx_status as enum ('broadcast', 'confirmed', 'failed');

-- ── deals ──────────────────────────────────────────────────────────────
create table deals (
  id                          text primary key,                       -- PH-XXXX-XXXX
  title                       text not null,
  description                 text not null default '',
  price_amount                numeric(38, 18) not null,
  price_currency              currency not null,

  seller_wallet_address       text not null,
  buyer_wallet_address        text,

  delivery_deadline_hours     integer not null,
  confirmation_window_hours   integer not null,
  required_delivery_proof     text not null default '',
  refund_terms                text not null default '',

  status                      deal_status not null default 'awaiting_payment',

  payment_tx_hash             text,
  escrow_tx_hash              text,
  release_tx_hash             text,
  refund_tx_hash              text,

  delivery_note               text,

  payment_deadline_at         timestamptz,
  proof_deadline_at           timestamptz,
  paid_at                     timestamptz,
  delivered_at                timestamptz,
  received_at                 timestamptz,
  released_at                 timestamptz,
  refunded_at                 timestamptz,

  buyer_proof_status          proof_status not null default 'not_submitted',
  seller_proof_status         proof_status not null default 'not_submitted',

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_deals_seller  on deals(seller_wallet_address);
create index idx_deals_buyer   on deals(buyer_wallet_address);
create index idx_deals_status  on deals(status);
create index idx_deals_updated on deals(updated_at desc);

-- Auto-bump updated_at on any UPDATE
create or replace function bump_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger deals_updated_at
  before update on deals
  for each row execute function bump_updated_at();

-- ── proofs ─────────────────────────────────────────────────────────────
create table proofs (
  id              text primary key,
  deal_id         text not null references deals(id) on delete cascade,
  submitted_by    party_role not null,
  explanation     text not null default '',
  tx_hash         text,
  attachment_urls jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index idx_proofs_deal on proofs(deal_id);

-- ── queries ────────────────────────────────────────────────────────────
create table queries (
  id          text primary key,
  deal_id     text not null references deals(id) on delete cascade,
  raised_by   party_role not null,
  reason      query_reason not null,
  details     text not null default '',
  created_at  timestamptz not null default now()
);
create index idx_queries_deal on queries(deal_id);

-- ── admin decisions ────────────────────────────────────────────────────
create table decisions (
  id            text primary key,
  deal_id       text not null references deals(id) on delete cascade,
  decision      admin_decision_type not null,
  buyer_amount  numeric(38, 18),
  seller_amount numeric(38, 18),
  reason        text not null,
  decided_by    text not null,
  created_at    timestamptz not null default now()
);
create index idx_decisions_deal on decisions(deal_id);

-- ── timeline ───────────────────────────────────────────────────────────
create table timeline (
  id       text primary key,
  deal_id  text not null references deals(id) on delete cascade,
  at       timestamptz not null default now(),
  label    text not null,
  detail   text,
  kind     timeline_kind not null
);
create index idx_timeline_deal on timeline(deal_id, at);

-- ── transactions (custody ledger) ──────────────────────────────────────
create table transactions (
  id           text primary key,
  deal_id      text not null references deals(id) on delete cascade,
  direction    tx_direction not null,
  network      tx_network not null,
  amount       numeric(38, 18) not null,
  currency     currency not null,
  from_addr    text not null,
  to_addr      text not null,
  tx_hash      text not null,
  block_height bigint,
  status       tx_status not null default 'broadcast',
  created_at   timestamptz not null default now()
);
create index idx_tx_deal   on transactions(deal_id);
create index idx_tx_hash   on transactions(tx_hash);
create index idx_tx_status on transactions(status);

-- ── watcher cursors (where the on-chain poller is up to) ───────────────
create table watcher_cursors (
  network         tx_network primary key,
  last_block      bigint not null default 0,
  last_checked_at timestamptz not null default now()
);

insert into watcher_cursors(network, last_block) values
  ('nimiq', 0),
  ('evm', 0);

-- ── auth nonces (replay protection for wallet signatures) ──────────────
create table auth_nonces (
  nonce      text primary key,
  address    text not null,
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_nonces_expires on auth_nonces(expires_at);
