-- 0044: resolve an XcrowHub referral link for AuthideX
--
-- This is a read-only, service-role-only summary. It resolves the XcrowHub
-- ref code carried by the link and reports only referrals observed by
-- XcrowHub after a referred wallet authenticated in the app.

create or replace function public.authidex_referral_detail(p_referral_link text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text := trim(coalesce(p_referral_link, ''));
  v_code text;
  v_match text[];
  v_referrer public.referral_codes;
begin
  if v_link = '' then
    raise exception 'referral_link is required';
  end if;

  -- AuthideX sends the full XcrowHub URL. Accepting a bare code is useful for
  -- server-side retries, but never accept an arbitrary external URL.
  if v_link ~ '^[A-Za-z0-9]{4,12}$' then
    v_code := upper(v_link);
  elsif v_link ~* '^https://(app|www)\\.xcrowhub\\.com(/|$)' then
    v_match := regexp_match(v_link, '[?&]ref=([A-Za-z0-9]{4,12})(&|$)');
    if v_match is not null then
      v_code := upper(v_match[1]);
    end if;
  end if;

  if v_code is null then
    return jsonb_build_object(
      'valid', false,
      'referral_link', v_link,
      'referral_code', null,
      'reason', 'No valid XcrowHub referral code found'
    );
  end if;

  select * into v_referrer
  from public.referral_codes
  where code = v_code;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'referral_link', v_link,
      'referral_code', v_code,
      'reason', 'Referral code does not exist'
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'referral_link', v_link,
    'referral_code', v_code,
    'referrer_wallet_address', v_referrer.addr,
    'referrer_wallet_norm', v_referrer.addr_norm,
    'referral_source', 'xcrowhub_observed',
    'xcrowhub_referral_count', (
      select count(*)::integer
      from public.referrals r
      where r.referrer_norm = v_referrer.addr_norm
    ),
    'referred_users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'wallet_address', r.referee_addr,
          'referred_at', r.created_at,
          'private_deals_created', (
            select count(*)::integer from public.deals d
            where d.listing_id is null
              and norm_addr(d.seller_wallet_address) = r.referee_norm
          ),
          'private_deals_completed', (
            select count(*)::integer from public.deals d
            where d.listing_id is null
              and d.status = 'released'
              and (
                norm_addr(d.seller_wallet_address) = r.referee_norm
                or norm_addr(d.buyer_wallet_address) = r.referee_norm
              )
          ),
          'qualified', exists (
            select 1 from public.deals d
            where d.listing_id is null
              and d.status = 'released'
              and (
                norm_addr(d.seller_wallet_address) = r.referee_norm
                or norm_addr(d.buyer_wallet_address) = r.referee_norm
              )
          )
        ) order by r.created_at
      )
      from public.referrals r
      where r.referrer_norm = v_referrer.addr_norm
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.authidex_referral_detail(text)
  from public, anon, authenticated;
grant execute on function public.authidex_referral_detail(text) to service_role;
