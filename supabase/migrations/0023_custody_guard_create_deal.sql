-- 0023: server-side custody-address guard in create_deal
--
-- Without this, create_deal accepts any address as seller_wallet_address,
-- including the platform custody hot-wallet. When that happens the payout
-- Edge Function sends funds back to custody (self-transfer) instead of to
-- the seller. This migration closes the gap by validating the seller address
-- against the stored custody addresses before inserting the deal row.
--
-- ONE-TIME SETUP (run in SQL Editor after deploying):
--   insert into platform_config (key, value)
--   values
--     ('nim_custody_addr', 'NQ…'),   -- your NIM custody address (spaces ok)
--     ('evm_custody_addr', '0x…')    -- your EVM / Polygon custody address
--   on conflict (key) do update set value = excluded.value, updated_at = now();

-- ── platform_config: service-role-only key-value store ───────────────────────
create table if not exists platform_config (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table platform_config enable row level security;
revoke all on table platform_config from anon, authenticated;

-- SECURITY DEFINER wrapper — lets other security-definer procedures (create_deal,
-- custody_addr_for) read config values without opening the table to app roles.
create or replace function platform_config_get(p_key text)
returns text
language sql
security definer
set search_path = public
as $$
  select value from platform_config where key = p_key limit 1;
$$;
revoke all on function platform_config_get(text) from public, anon, authenticated;

-- Returns the normalised (lowercase, no spaces) custody address for the given
-- currency. Returns '' when the config key is absent so the guard below
-- skips gracefully instead of blocking all deal creation.
create or replace function custody_addr_for(p_currency text)
returns text
language sql
security definer
set search_path = public
as $$
  select lower(
    regexp_replace(
      coalesce(
        platform_config_get(
          case p_currency
            when 'NIM'  then 'nim_custody_addr'
            when 'USDT' then 'evm_custody_addr'
            else             ''
          end
        ),
        ''
      ),
      '\s', '', 'g'
    )
  );
$$;
revoke all on function custody_addr_for(text) from public, anon, authenticated;

-- ── create_deal: forward-port from 0022 + custody guard ──────────────────────
create or replace function create_deal(
  p_title                     text,
  p_description               text,
  p_price_amount              numeric,
  p_price_currency            currency,
  p_seller_wallet_address     text,
  p_delivery_deadline_hours   int,
  p_confirmation_window_hours int,
  p_required_delivery_proof   text,
  p_refund_terms              text,
  p_category                  text default 'other',
  p_listing_id                text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id          text        := 'PH-' || upper(substr(md5(gen_random_uuid()::text),1,4))
                                      || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  v_now         timestamptz := now();
  v_seller_norm text        := lower(regexp_replace(coalesce(p_seller_wallet_address, ''), '\s', '', 'g'));
  v_custody     text        := custody_addr_for(p_price_currency::text);
  v_active_deals int        := 0;
begin
  if caller_addr() is null then raise exception 'Not authenticated'; end if;
  if v_seller_norm = '' then raise exception 'Seller wallet is required'; end if;

  -- Block the platform custody address from being used as a seller wallet.
  -- Guard is skipped (v_custody = '') when platform_config is not yet populated.
  if v_custody <> '' and v_seller_norm = v_custody then
    raise exception 'Cannot use the platform custody address as a seller wallet';
  end if;

  -- Serialize concurrent creates for the same seller to enforce the active-deal cap.
  perform pg_advisory_xact_lock(20260701, hashtext(v_seller_norm));

  select count(*)::int
    into v_active_deals
  from deals
  where lower(regexp_replace(coalesce(seller_wallet_address, ''), '\s', '', 'g')) = v_seller_norm
    and status not in ('released', 'refunded', 'partially_refunded', 'cancelled', 'expired');

  if v_active_deals >= 10 then
    raise exception 'You already have 10 active deals. Finish or close one before creating another.';
  end if;

  insert into deals (
    id, title, description, price_amount, price_currency,
    seller_wallet_address, delivery_deadline_hours, confirmation_window_hours,
    required_delivery_proof, refund_terms, status, category, listing_id,
    created_at, updated_at, payment_deadline_at,
    buyer_proof_status, seller_proof_status
  ) values (
    v_id, p_title, coalesce(p_description, ''), p_price_amount, p_price_currency,
    p_seller_wallet_address, p_delivery_deadline_hours, p_confirmation_window_hours,
    p_required_delivery_proof, p_refund_terms, 'awaiting_payment',
    coalesce(p_category, 'other'), p_listing_id,
    v_now, v_now, v_now + (48 * interval '1 hour'),
    'not_submitted', 'not_submitted'
  );

  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, v_id, v_now, 'Deal created', 'created');

  return v_id;
end;
$$;

grant execute on function create_deal(text,text,numeric,currency,text,int,int,text,text,text,text)
  to anon, authenticated;
