-- 0026: admins can soft-delete any listing.
--
-- Client soft-deletes via update({status:'deleted'}) — see listingStore
-- deleteListing / toggleStatus. The existing listings_update policy only
-- allows the seller. Broaden it so is_admin() rows also pass.
--
-- Kept as a soft delete: we still want to keep the row for auditing and to
-- preserve FK references from deals/offers. RLS on select already hides
-- 'deleted' rows from marketplace browse (see 0011).

drop policy if exists listings_update on listings;
create policy listings_update on listings for update
  using (addr_eq(seller_addr, caller_addr()) or is_admin());
