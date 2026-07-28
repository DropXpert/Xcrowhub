-- 0046: expose XcrowHub referral counts by NIM wallet address
--
-- AuthideX already identifies a participant by wallet_address for activity
-- checks. Keep referral attribution inside XcrowHub, but make the aggregate
-- referral totals available for the same wallet-based leaderboard request.

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
  v_referral_count integer;
  v_qualified_referral_count integer;
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

  select count(*)::integer
    into v_referral_count
  from public.referrals r
  where r.referrer_norm = v_wallet_norm;

  select count(*)::integer
    into v_qualified_referral_count
  from public.referrals r
  where r.referrer_norm = v_wallet_norm
    and exists (
      select 1
      from public.deals d
      where d.listing_id is null
        and d.status = 'released'
        and (
          norm_addr(d.seller_wallet_address) = r.referee_norm
          or norm_addr(d.buyer_wallet_address) = r.referee_norm
        )
    );

  return jsonb_build_object(
    'wallet_address', p_wallet_address,
    'has_created_private_deal', v_created > 0,
    'private_deals_created', v_created,
    'private_deals_completed', coalesce(v_completed, 0),
    'first_private_deal_completed_at', v_first_completed,
    'referral_count', coalesce(v_referral_count, 0),
    'qualified_referral_count', coalesce(v_qualified_referral_count, 0),
    'referral_count_source', 'xcrowhub'
  );
end;
$$;

revoke all on function public.authidex_activity_for_wallet(text)
  from public, anon, authenticated;
grant execute on function public.authidex_activity_for_wallet(text) to service_role;

-- Detailed wallet lookup for leaderboard/admin integrations. The input is a
-- NIM address, never a referral URL or referral code.
create or replace function public.authidex_referral_detail_for_wallet(p_wallet_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_norm text := norm_addr(p_wallet_address);
begin
  if v_wallet_norm = '' then
    raise exception 'wallet_address is required';
  end if;

  return jsonb_build_object(
    'valid', exists (
      select 1 from public.app_users u where u.wallet_norm = v_wallet_norm
    ),
    'wallet_address', p_wallet_address,
    'wallet_norm', v_wallet_norm,
    'referral_count', (
      select count(*)::integer
      from public.referrals r
      where r.referrer_norm = v_wallet_norm
    ),
    'qualified_referral_count', (
      select count(*)::integer
      from public.referrals r
      where r.referrer_norm = v_wallet_norm
        and exists (
          select 1
          from public.deals d
          where d.listing_id is null
            and d.status = 'released'
            and (
              norm_addr(d.seller_wallet_address) = r.referee_norm
              or norm_addr(d.buyer_wallet_address) = r.referee_norm
            )
        )
    ),
    'referral_count_source', 'xcrowhub'
  );
end;
$$;

revoke all on function public.authidex_referral_detail_for_wallet(text)
  from public, anon, authenticated;
grant execute on function public.authidex_referral_detail_for_wallet(text) to service_role;
