-- 0052: prevent a seller from becoming the buyer of the same deal.
--
-- The client hides the payment action for the creator, but this invariant must
-- also hold at the database boundary so direct RPC/table calls cannot bypass it.

alter table public.deals
  drop constraint if exists deals_distinct_participants;

alter table public.deals
  add constraint deals_distinct_participants
  check (
    buyer_wallet_address is null
    or not public.addr_eq(seller_wallet_address, buyer_wallet_address)
  ) not valid;

create or replace function public.prevent_self_deal_participants()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.buyer_wallet_address is not null
     and public.addr_eq(new.seller_wallet_address, new.buyer_wallet_address) then
    raise exception 'The seller wallet cannot accept or pay its own deal';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_self_deal_participants()
  from public, anon, authenticated;

drop trigger if exists prevent_self_deal_participants on public.deals;
create trigger prevent_self_deal_participants
before insert or update of seller_wallet_address, buyer_wallet_address
on public.deals
for each row execute function public.prevent_self_deal_participants();

-- Validate immediately when historical data already satisfies the invariant.
-- If a legacy self-deal exists, new writes are still blocked and the constraint
-- stays NOT VALID until that historical record is reviewed manually.
do $$
begin
  if not exists (
    select 1
    from public.deals
    where buyer_wallet_address is not null
      and public.addr_eq(seller_wallet_address, buyer_wallet_address)
  ) then
    alter table public.deals
      validate constraint deals_distinct_participants;
  end if;
end;
$$;
