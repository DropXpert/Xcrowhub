-- 0035: remove public access to private escrow data.
--
-- The original link-as-token policies exposed every deal, proof, query,
-- decision, timeline event, transaction, chat message, and offer through the
-- anon Data API.  Marketplace listings and profile feedback remain public,
-- but escrow data is now visible only to the deal participants or admins.
--
-- A buyer may still open a deal link through get_deal_by_link(). Once
-- begin_payment binds the buyer wallet, normal table access becomes participant-only.

-- ---------------------------------------------------------------------------
-- Deals and related escrow records
-- ---------------------------------------------------------------------------
drop policy if exists deals_read_public on deals;
drop policy if exists deals_read_participant on deals;
create policy deals_read_participant on deals
for select to authenticated
using (
  is_admin()
  or (
    caller_addr() is not null
    and (
      addr_eq(seller_wallet_address, caller_addr())
      or addr_eq(buyer_wallet_address, caller_addr())
    )
  )
);

-- The deal ID is the existing share-link capability. Keep that link flow
-- working without reopening the entire deals table through the Data API: this
-- RPC returns exactly one requested deal, while all related/private tables
-- remain participant-scoped below.
create or replace function get_deal_by_link(p_deal_id text)
returns setof public.deals
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from public.deals d
  where d.id = p_deal_id
  limit 1;
$$;

revoke all on function get_deal_by_link(text) from public;
grant execute on function get_deal_by_link(text) to anon, authenticated;

drop policy if exists proofs_read_public on proofs;
drop policy if exists proofs_read_participant on proofs;
create policy proofs_read_participant on proofs
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from deals d
    where d.id = proofs.deal_id
      and (
        addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

drop policy if exists queries_read_public on queries;
drop policy if exists queries_read_participant on queries;
create policy queries_read_participant on queries
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from deals d
    where d.id = queries.deal_id
      and (
        addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

drop policy if exists decisions_read_public on decisions;
drop policy if exists decisions_read_participant on decisions;
create policy decisions_read_participant on decisions
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from deals d
    where d.id = decisions.deal_id
      and (
        addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

drop policy if exists timeline_read_public on timeline;
drop policy if exists timeline_read_participant on timeline;
create policy timeline_read_participant on timeline
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from deals d
    where d.id = timeline.deal_id
      and (
        addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

drop policy if exists transactions_read_public on transactions;
drop policy if exists transactions_read_participant on transactions;
create policy transactions_read_participant on transactions
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from deals d
    where d.id = transactions.deal_id
      and (
        addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

-- Do not leave a second permissive policy behind: Data API privileges are
-- reduced as well as RLS-restricted, so anonymous requests fail closed.
revoke select on deals, proofs, queries, decisions, timeline, transactions from anon, public;
grant select on deals, proofs, queries, decisions, timeline, transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Deal chat
-- ---------------------------------------------------------------------------
drop policy if exists dm_read on deal_messages;
drop policy if exists dm_read_participant on deal_messages;
create policy dm_read_participant on deal_messages
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from deals d
    where d.id = deal_messages.deal_id
      and (
        addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

drop policy if exists dm_insert on deal_messages;
create policy dm_insert on deal_messages
for insert to authenticated
with check (
  caller_addr() is not null
  and sender_role in ('buyer', 'seller')
  and addr_eq(sender_addr, caller_addr())
  and exists (
    select 1
    from deals d
    where d.id = deal_messages.deal_id
      and (
        is_admin()
        or addr_eq(d.seller_wallet_address, caller_addr())
        or addr_eq(d.buyer_wallet_address, caller_addr())
      )
  )
);

revoke select, insert on deal_messages from anon, public;
grant select, insert on deal_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Offers: only the buyer and seller involved in an offer can see it.
-- Listings themselves stay public for marketplace browsing.
-- ---------------------------------------------------------------------------
drop policy if exists offers_read on offers;
drop policy if exists offers_read_participant on offers;
create policy offers_read_participant on offers
for select to authenticated
using (
  is_admin()
  or (
    caller_addr() is not null
    and (
      addr_eq(buyer_addr, caller_addr())
      or addr_eq(seller_addr, caller_addr())
    )
  )
);

revoke select, insert, update on offers from anon, public;
grant select, insert, update on offers to authenticated;
