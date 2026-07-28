-- Row Level Security (RLS) — Supabase enforces these per-request based
-- on the auth JWT (which our wallet-signature Edge Function mints).
--
-- Auth model:
--   auth.jwt() ->> 'wallet_addr'   the verified Nimiq/EVM address of the caller
--   auth.jwt() ->> 'role'          'authenticated' (any signed wallet) | 'admin'
--
-- Anyone (no auth) can read a deal by ID — the deal link itself is the
-- access token, same as a Stripe payment link. Writes always require a
-- matching wallet signature.

alter table deals       enable row level security;
alter table proofs      enable row level security;
alter table queries     enable row level security;
alter table decisions   enable row level security;
alter table timeline    enable row level security;
alter table transactions enable row level security;
alter table auth_nonces  enable row level security;

-- ── deals ──────────────────────────────────────────────────────────────
-- Anyone can read a deal (link-as-token model).
create policy deals_read_public on deals
  for select using (true);

-- Inserts only via stored procedure `create_deal()`. No direct insert.
-- (Procedure runs with security definer, bypasses RLS for the insert.)

-- Updates only via stored procedures (transition functions).
-- Direct UPDATE blocked.

-- ── proofs / queries / decisions / timeline ────────────────────────────
-- Public read so buyer + seller see each other's submissions.
create policy proofs_read_public      on proofs     for select using (true);
create policy queries_read_public     on queries    for select using (true);
create policy decisions_read_public   on decisions  for select using (true);
create policy timeline_read_public    on timeline   for select using (true);
create policy transactions_read_public on transactions for select using (true);

-- Writes only via stored procedures.

-- ── auth nonces ────────────────────────────────────────────────────────
-- Edge Function manages these via service role; no client access.
-- (Policies left empty = deny all for anon/authenticated.)
