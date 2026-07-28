-- 0043: coupon pool assignment is owned by AuthideX, not wallet identity
--
-- This migration also upgrades installations that briefly used the earlier
-- wallet-bound coupon draft. AuthideX assigns a code to its own external user;
-- XcrowHub only validates that the code is active and unused at claim time.

drop index if exists public.idx_campaign_coupon_assigned_wallet;
alter table if exists public.campaign_coupons
  drop column if exists assigned_wallet_address,
  drop column if exists assigned_wallet_norm;

drop function if exists public.issue_campaign_coupon(text, text, text);

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
    raise exception 'This campaign coupon has already been claimed';
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
