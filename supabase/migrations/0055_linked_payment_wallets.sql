-- Keep one XcrowHub identity while allowing a separately verified payment
-- wallet. NIM remains the primary identity and an EVM address can be linked
-- for USDT funding and payouts.

create table if not exists public.wallet_links (
  primary_addr text not null,
  primary_norm text not null,
  linked_addr text not null,
  linked_norm text not null,
  network text not null check (network in ('evm')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (primary_norm, linked_norm),
  unique (linked_norm),
  check (primary_norm <> linked_norm)
);

create unique index if not exists wallet_links_one_active_network
on public.wallet_links (primary_norm, network)
where active;

alter table public.wallet_links enable row level security;
revoke all on table public.wallet_links from public, anon, authenticated;
grant select, insert, update, delete on table public.wallet_links to service_role;

create or replace function public.link_wallet_addresses(
  p_primary text,
  p_linked text,
  p_network text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primary text := lower(regexp_replace(coalesce(p_primary, ''), '\s', '', 'g'));
  v_linked text := lower(regexp_replace(coalesce(p_linked, ''), '\s', '', 'g'));
begin
  if v_primary !~ '^nq[0-9]{2}[a-z0-9]{32}$' then
    raise exception 'The primary XcrowHub identity must be a valid NIM address';
  end if;
  if p_network <> 'evm' or v_linked !~ '^0x[0-9a-f]{40}$' then
    raise exception 'The linked payment wallet must be a valid EVM address';
  end if;
  if exists (
    select 1 from public.wallet_links
    where linked_norm = v_linked and primary_norm <> v_primary
  ) then
    raise exception 'This payment wallet is already linked to another XcrowHub identity';
  end if;
  if exists (
    select 1 from public.wallet_links
    where linked_norm = v_primary or primary_norm = v_linked
  ) then
    raise exception 'Wallet link chains are not allowed';
  end if;

  update public.wallet_links
  set active = false, updated_at = now()
  where primary_norm = v_primary and network = p_network and linked_norm <> v_linked;

  insert into public.wallet_links (
    primary_addr, primary_norm, linked_addr, linked_norm, network, active
  ) values (
    btrim(p_primary), v_primary, btrim(p_linked), v_linked, p_network, true
  )
  on conflict (primary_norm, linked_norm) do update
    set linked_addr = excluded.linked_addr,
        active = true,
        updated_at = now();
end;
$$;

revoke all on function public.link_wallet_addresses(text, text, text)
from public, anon, authenticated;
grant execute on function public.link_wallet_addresses(text, text, text)
to service_role;

-- Resolve both a primary identity and its linked payment wallets to the same
-- account root. SECURITY DEFINER lets RLS policies use the locked link table
-- without exposing that table through the Data API.
create or replace function public.account_root(p_address text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with normalized as (
    select lower(regexp_replace(coalesce(p_address, ''), '\s', '', 'g')) as addr
  )
  select coalesce(
    (select wl.primary_norm
       from public.wallet_links wl, normalized n
      where wl.linked_norm = n.addr
      limit 1),
    (select addr from normalized)
  );
$$;

create or replace function public.addr_eq(a text, b text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.account_root(a) <> ''
     and public.account_root(a) = public.account_root(b);
$$;

revoke all on function public.account_root(text) from public;
grant execute on function public.account_root(text) to anon, authenticated, service_role;
revoke all on function public.addr_eq(text, text) from public;
grant execute on function public.addr_eq(text, text) to anon, authenticated, service_role;

create or replace function public.get_my_linked_wallet(p_network text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select wl.linked_addr
  from public.wallet_links wl
  where wl.primary_norm = public.caller_addr()
    and wl.network = p_network
    and wl.active
  limit 1;
$$;

revoke all on function public.get_my_linked_wallet(text) from public, anon;
grant execute on function public.get_my_linked_wallet(text) to authenticated;

-- Marketplace orders may reserve a deal with the buyer's NIM identity before
-- the USDT wallet is connected. At payment start, store the verified EVM
-- sender as the on-chain buyer while addr_eq keeps the NIM identity authorized.
create or replace function public.begin_payment(
  p_deal_id text,
  p_buyer text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_caller text := caller_addr();
  v_now timestamptz := now();
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_buyer is null or not addr_eq(p_buyer, v_caller) then
    raise exception 'Buyer must be the connected or linked wallet';
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status <> 'awaiting_payment' then raise exception 'Deal is not awaiting payment'; end if;
  if v_deal.payment_deadline_at is not null and v_now > v_deal.payment_deadline_at then
    raise exception 'The payment window has closed';
  end if;
  if v_deal.buyer_wallet_address is not null
     and not addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Deal already belongs to another buyer';
  end if;

  update public.deals
  set buyer_wallet_address = case
        when price_currency = 'USDT' and escrow_model = 'smart_contract'
          then p_buyer
        else coalesce(buyer_wallet_address, p_buyer)
      end,
      payment_started_at = case
        when payment_started_at is null
          or payment_started_at <= v_now - interval '15 minutes'
          then v_now
        else payment_started_at
      end,
      updated_at = v_now
  where id = p_deal_id;
end;
$$;

revoke all on function public.begin_payment(text, text) from public, anon;
grant execute on function public.begin_payment(text, text) to authenticated;

-- The linked EVM address is a payment rail, not a second product user.
-- Existing accidental registrations remain untouched, but future linking does
-- not insert the secondary address into app_users.
