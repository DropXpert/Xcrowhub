-- 0027: SECURITY DEFINER RPC for deleting a listing.
--
-- Migration 0026 broadened the listings_update RLS to allow admins, but the
-- client's fire-and-forget update chained .select() to detect RLS blocks. The
-- resulting RETURNING clause was re-checked against the SELECT policy
-- (status <> 'deleted') and blew up post-update with:
--   "new row violates row-level security policy for table listings"
-- even though the UPDATE itself was legal.
--
-- Fix: move the delete into a definer function. It runs as the function owner
-- so it bypasses RLS entirely, does its own owner/admin check, and returns a
-- boolean so the client can tell success from an authz failure without playing
-- games with RETURNING. Row is soft-deleted (status='deleted') so downstream
-- FKs from deals/offers stay intact.

create or replace function delete_listing(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_addr    text := caller_addr();
  v_admin   boolean := is_admin();
  v_seller  text;
begin
  select seller_addr into v_seller from listings where id = p_id;
  if v_seller is null then
    -- Row is gone or already soft-deleted; treat as no-op success so the
    -- client's optimistic remove doesn't get stuck.
    return true;
  end if;

  if not (v_admin or addr_eq(v_seller, v_addr)) then
    raise exception 'Only the seller or an admin can delete this listing'
      using errcode = '42501';
  end if;

  update listings
     set status     = 'deleted',
         updated_at = now()
   where id = p_id
     and status <> 'deleted';

  return true;
end;
$$;

grant execute on function delete_listing(text) to authenticated;
