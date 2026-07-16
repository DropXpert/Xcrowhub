-- 0024: separate listing identity from payout wallet
--
-- Before this migration `listings.seller_addr` had to be an address whose
-- currency matched `price_currency` -- because the payout at release time
-- pays that address. That meant a NIM-signed-in user creating a USDT
-- listing was forced to reconnect as their EVM wallet, which minted a new
-- JWT and effectively reset their identity in the app (profile, deals,
-- listings all keyed on wallet address, so signing in with a different
-- wallet looked like becoming a different user).
--
-- Split the concerns:
--   seller_addr  -> owner identity (login wallet). Must equal caller_addr()
--                   on write, which is enforced by RLS (unchanged).
--   payout_addr  -> currency-matched wallet the release payout targets. May
--                   equal seller_addr (when the seller listed in the same
--                   currency they were signed in with).
--
-- Backfill = seller_addr, so all existing listings keep behaving exactly
-- as before. Only listings created via the new client path can have a
-- payout_addr that differs from seller_addr.

alter table listings
  add column if not exists payout_addr text;

update listings
   set payout_addr = seller_addr
 where payout_addr is null;

alter table listings
  alter column payout_addr set not null;

-- No new index — payout_addr is only read alongside a listing row lookup;
-- there's no query that filters on it directly.
