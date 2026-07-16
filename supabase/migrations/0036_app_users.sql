-- 0036: verified wallet user registry
--
-- XcrowHub uses custom wallet-signed JWTs rather than Supabase Auth users.
-- auth_nonces cannot be treated as a user table because a nonce is consumed
-- before signature verification completes. This registry is updated only by
-- the auth Edge Function after the wallet signature has been verified.

create table if not exists public.app_users (
  wallet_norm    text primary key,
  wallet_address text not null,
  network        text not null default 'unknown'
                   check (network in ('nimiq', 'evm', 'unknown')),
  is_admin       boolean not null default false,
  first_seen_at  timestamptz not null default now(),
  last_login_at  timestamptz,
  login_count    bigint not null default 0 check (login_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint app_users_wallet_norm_matches
    check (wallet_norm = norm_addr(wallet_address) and wallet_norm <> '')
);

create index if not exists idx_app_users_last_login
  on public.app_users(last_login_at desc nulls last);

alter table public.app_users enable row level security;

-- The full user directory is operational data. App clients must not be able
-- to enumerate it; the service-role auth function and SQL dashboard can.
revoke all on table public.app_users from public, anon, authenticated;
grant select, insert, update on table public.app_users to service_role;

-- Generate or return a wallet's referral code without relying on auth.jwt().
-- This is intentionally service-role only and is used by register_app_user.
create or replace function public.ensure_referral_code_for_wallet(
  p_wallet_address text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := norm_addr(p_wallet_address);
  v_code text;
begin
  if v_norm = '' then
    raise exception 'Wallet address is required';
  end if;

  select code into v_code
  from public.referral_codes
  where addr_norm = v_norm;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into public.referral_codes (code, addr, addr_norm)
      values (v_code, trim(p_wallet_address), v_norm);
      return v_code;
    exception when unique_violation then
      -- Either the random code collided or another login created this
      -- wallet's code concurrently. Return the latter; otherwise retry.
      select code into v_code
      from public.referral_codes
      where addr_norm = v_norm;
      if v_code is not null then
        return v_code;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_referral_code_for_wallet(text)
  from public, anon, authenticated;
grant execute on function public.ensure_referral_code_for_wallet(text)
  to service_role;

-- Atomic successful-login upsert. login_count is incremented server-side so
-- concurrent logins cannot overwrite one another.
create or replace function public.register_app_user(
  p_wallet_address text,
  p_network text default 'unknown',
  p_is_admin boolean default false
)
returns public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := norm_addr(p_wallet_address);
  v_network text;
  v_user public.app_users;
begin
  if v_norm = '' then
    raise exception 'Wallet address is required';
  end if;

  v_network := case lower(coalesce(p_network, ''))
    when 'nimiq' then 'nimiq'
    when 'evm' then 'evm'
    else 'unknown'
  end;

  insert into public.app_users (
    wallet_norm,
    wallet_address,
    network,
    is_admin,
    first_seen_at,
    last_login_at,
    login_count,
    updated_at
  ) values (
    v_norm,
    trim(p_wallet_address),
    v_network,
    coalesce(p_is_admin, false),
    now(),
    now(),
    1,
    now()
  )
  on conflict (wallet_norm) do update set
    wallet_address = excluded.wallet_address,
    network = excluded.network,
    is_admin = excluded.is_admin,
    last_login_at = now(),
    login_count = app_users.login_count + 1,
    updated_at = now()
  returning * into v_user;

  perform public.ensure_referral_code_for_wallet(p_wallet_address);
  return v_user;
end;
$$;

revoke all on function public.register_app_user(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.register_app_user(text, text, boolean)
  to service_role;

-- Seed wallets that already performed real application activity before the
-- registry existed. login_count remains 0 until their next verified login, so
-- reports can distinguish backfilled users from newly tracked logins.
with wallet_events as (
  select seller_wallet_address as wallet_address, created_at as event_at from public.deals
  union all
  select buyer_wallet_address, created_at from public.deals where buyer_wallet_address is not null
  union all
  select seller_addr, created_at from public.listings
  union all
  select buyer_addr, created_at from public.offers
  union all
  select seller_addr, created_at from public.offers
  union all
  select opener_addr, created_at from public.support_tickets
  union all
  select sender_addr, created_at from public.support_messages where sender = 'user'
  union all
  select sender_addr, created_at from public.deal_messages where sender_role <> 'system'
  union all
  select from_addr, created_at from public.feedbacks
  union all
  select to_addr, created_at from public.feedbacks
  union all
  select referee_addr, created_at from public.referrals
  union all
  select referrer_addr, created_at from public.referrals
  union all
  select addr, created_at from public.referral_codes
  union all
  select recipient_addr, created_at from public.notifications
  union all
  select addr, linked_at from public.notification_contacts
), normalized as (
  select
    wallet_address,
    norm_addr(wallet_address) as wallet_norm,
    event_at
  from wallet_events
  where nullif(trim(wallet_address), '') is not null
), existing_users as (
  select
    wallet_norm,
    (array_agg(wallet_address order by event_at desc))[1] as wallet_address,
    min(event_at) as first_seen_at
  from normalized
  where wallet_norm <> ''
  group by wallet_norm
)
insert into public.app_users (
  wallet_norm,
  wallet_address,
  network,
  first_seen_at,
  login_count
)
select
  wallet_norm,
  wallet_address,
  case
    when wallet_norm like 'nq%' then 'nimiq'
    when wallet_norm like '0x%' then 'evm'
    else 'unknown'
  end,
  first_seen_at,
  0
from existing_users
on conflict (wallet_norm) do update set
  wallet_address = excluded.wallet_address,
  first_seen_at = least(app_users.first_seen_at, excluded.first_seen_at),
  updated_at = now();

do $$
declare
  user_row record;
begin
  for user_row in select wallet_address from public.app_users loop
    perform public.ensure_referral_code_for_wallet(user_row.wallet_address);
  end loop;
end;
$$;
