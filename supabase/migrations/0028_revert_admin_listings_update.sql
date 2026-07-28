-- 0028: revert 0026 — admin path for listings UPDATE was over-broad.
--
-- 0026 broadened listings_update to admins with no WITH CHECK, meaning a
-- compromised admin JWT could rewrite payout_addr (or any other column) on
-- any listing and silently redirect future purchase funds — ListingDetail
-- passes l.payoutAddr straight into createDeal.
--
-- 0027 replaced the client-side soft-delete path with a SECURITY DEFINER
-- RPC (delete_listing) that does its own owner/admin check, so the RLS
-- broadening is no longer needed. Restore seller-only UPDATE.

drop policy if exists listings_update on listings;
create policy listings_update on listings for update
  using (addr_eq(seller_addr, caller_addr()));
