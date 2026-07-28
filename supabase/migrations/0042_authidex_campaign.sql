-- 0042: AuthideX campaign support
--
-- AuthideX owns attribution, referral counting, qualification and rewards.
-- XcrowHub only accepts a one-time campaign coupon and exposes a private,
-- server-to-server activity summary for AuthideX to query.

create table if not exists public.campaign_coupons (
  code text primary key,
  campaign_id text not null,
  reward_nim numeric(20,5) not null check (reward_nim > 0),
  max_claims integer not null check (max_claims > 0),
  claim_count integer not null default 0 check (claim_count >= 0),
  active boolean not null default true,
  assigned_external_id text,
  assigned_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_coupon_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  coupon_code text not null references public.campaign_coupons(code),
  wallet_address text not null,
  wallet_norm text not null,
  claimed_at timestamptz not null default now(),
  unique (campaign_id, wallet_norm),
  unique (coupon_code, wallet_norm)
);

create index if not exists idx_campaign_coupon_claims_wallet
  on public.campaign_coupon_claims(wallet_norm);

-- Pre-generate 100 different one-time codes. AuthideX receives a specific
-- code through issue_campaign_coupon after its referral-link submission.
insert into public.campaign_coupons (code, campaign_id, reward_nim, max_claims)
select
  'XCG-' || upper(substr(md5('xcrowhub-escrow-guardians-' || n::text), 1, 10)),
  'xcrowhub-escrow-guardians',
  500,
  1
from generate_series(1, 100) as g(n)
on conflict (code) do nothing;

-- If an earlier local version seeded one shared code, disable it so only the
-- unique-code pool can be issued going forward.
update public.campaign_coupons
set active = false
where code = 'ESCROW100';

create or replace function public.issue_campaign_coupon(
  p_campaign_id text,
  p_external_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_external_id text := nullif(trim(coalesce(p_external_user_id, '')), '');
  v_coupon public.campaign_coupons;
begin
  if nullif(trim(coalesce(p_campaign_id, '')), '') is null
     or v_external_id is null then
    raise exception 'campaign_id and external_user_id are required';
  end if;

  select * into v_coupon
  from public.campaign_coupons
  where campaign_id = trim(p_campaign_id)
    and assigned_external_id = v_external_id
  limit 1;

  if found then
    return jsonb_build_object(
      'issued', true,
      'already_issued', true,
      'campaign_id', v_coupon.campaign_id,
      'code', v_coupon.code,
      'reward_nim', v_coupon.reward_nim
    );
  end if;

  select * into v_coupon
  from public.campaign_coupons
  where campaign_id = trim(p_campaign_id)
    and active
    and assigned_at is null
    and claim_count = 0
  order by created_at, code
  limit 1
  for update skip locked;

  if not found then
    raise exception 'No campaign coupons are available';
  end if;

  update public.campaign_coupons
  set assigned_external_id = v_external_id,
      assigned_at = now()
  where code = v_coupon.code
  returning * into v_coupon;

  return jsonb_build_object(
    'issued', true,
    'already_issued', false,
    'campaign_id', v_coupon.campaign_id,
    'code', v_coupon.code,
    'reward_nim', v_coupon.reward_nim
  );
end;
$$;

revoke all on function public.issue_campaign_coupon(text, text)
  from public, anon, authenticated;
grant execute on function public.issue_campaign_coupon(text, text)
  to service_role;

create or replace function public.claim_campaign_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text := caller_addr();
  v_wallet_norm text;
  v_coupon public.campaign_coupons;
  v_existing public.campaign_coupon_claims;
begin
  if v_caller is null or nullif(trim(v_caller), '') is null then
    raise exception 'Not authenticated';
  end if;

  v_wallet_norm := norm_addr(v_caller);
  select * into v_coupon
  from public.campaign_coupons
  where code = upper(trim(coalesce(p_code, '')))
  for update;

  if not found or not v_coupon.active then
    raise exception 'Invalid or inactive coupon code';
  end if;

  if v_coupon.assigned_external_id is null then
    raise exception 'This coupon has not been issued yet';
  end if;

  select * into v_existing
  from public.campaign_coupon_claims
  where campaign_id = v_coupon.campaign_id
    and wallet_norm = v_wallet_norm;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'already_claimed', true,
      'campaign_id', v_coupon.campaign_id,
      'code', v_coupon.code,
      'reward_nim', v_coupon.reward_nim
    );
  end if;

  if v_coupon.claim_count >= v_coupon.max_claims then
    raise exception 'This campaign coupon has already been fully claimed';
  end if;

  insert into public.campaign_coupon_claims (
    campaign_id, coupon_code, wallet_address, wallet_norm
  ) values (
    v_coupon.campaign_id, v_coupon.code, trim(v_caller), v_wallet_norm
  );

  update public.campaign_coupons
  set claim_count = claim_count + 1
  where code = v_coupon.code;

  return jsonb_build_object(
    'claimed', true,
    'already_claimed', false,
    'campaign_id', v_coupon.campaign_id,
    'code', v_coupon.code,
    'reward_nim', v_coupon.reward_nim
  );
end;
$$;

revoke all on function public.claim_campaign_coupon(text) from public, anon;
grant execute on function public.claim_campaign_coupon(text) to authenticated;

alter table public.campaign_coupons enable row level security;
alter table public.campaign_coupon_claims enable row level security;

-- AuthideX calls this function through the signed Edge Function. It receives
-- only aggregate activity; referral attribution never enters XcrowHub.
create or replace function public.authidex_activity_for_wallet(p_wallet_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_norm text := norm_addr(p_wallet_address);
  v_created integer;
  v_completed integer;
  v_first_completed timestamptz;
begin
  if v_wallet_norm = '' then
    raise exception 'wallet_address is required';
  end if;

  select count(*)::integer into v_created
  from public.deals d
  where d.listing_id is null
    and norm_addr(d.seller_wallet_address) = v_wallet_norm;

  select count(*)::integer, min(d.released_at)
    into v_completed, v_first_completed
  from public.deals d
  where d.listing_id is null
    and d.status = 'released'
    and (
      norm_addr(d.seller_wallet_address) = v_wallet_norm
      or norm_addr(d.buyer_wallet_address) = v_wallet_norm
    );

  return jsonb_build_object(
    'wallet_address', p_wallet_address,
    'has_created_private_deal', v_created > 0,
    'private_deals_created', v_created,
    'private_deals_completed', coalesce(v_completed, 0),
    'first_private_deal_completed_at', v_first_completed,
    'referral_count', null,
    'referral_count_source', 'authidex'
  );
end;
$$;

revoke all on function public.authidex_activity_for_wallet(text)
  from public, anon, authenticated;
grant execute on function public.authidex_activity_for_wallet(text) to service_role;
