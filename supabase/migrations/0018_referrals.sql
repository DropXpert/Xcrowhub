-- 0018: referral system
--
-- Each wallet gets a short referral code. A new wallet that authenticates with a
-- pending code is bound to its referrer once (first-touch, permanent). When a
-- REFERRED SELLER completes a marketplace sale, the platform takes its 1% fee
-- (0017) and the referrer accrues 10% OF THAT FEE as a claimable balance. The
-- reward is paid out of the fee that already sits in the custody wallet, so it
-- never costs more than was collected. Balances are claimed manually per
-- currency; a pending claim is settled on-chain by the auto-settle cron.

-- Referral reward = this many basis points OF THE FEE (1000 = 10%).
-- (Kept inline in functions below; documented here for reference.)

-- ── normalize helper ─────────────────────────────────────────────────────────
create or replace function norm_addr(a text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(a, ''), '\s', '', 'g'))
$$;
grant execute on function norm_addr(text) to anon, authenticated;

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists referral_codes (
  code       text primary key,
  addr       text not null,            -- original address (used for payout/display)
  addr_norm  text not null unique,     -- normalized, for matching
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  referee_norm  text primary key,      -- a wallet is referred at most once
  referee_addr  text not null,
  referrer_norm text not null,
  referrer_addr text not null,
  code          text not null,
  created_at    timestamptz not null default now(),
  constraint no_self_referral check (referee_norm <> referrer_norm)
);
create index if not exists idx_referrals_referrer on referrals(referrer_norm);

create table if not exists referral_earnings (
  id            text primary key default gen_random_uuid()::text,
  deal_id       text not null unique references deals(id) on delete cascade,
  referrer_norm text not null,
  referrer_addr text not null,
  referee_norm  text not null,
  currency      currency not null,
  fee_amount    numeric(38, 18) not null,
  reward_amount numeric(38, 18) not null,
  status        text not null default 'accrued' check (status in ('accrued', 'claimed')),
  claim_id      text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_rearn_referrer on referral_earnings(referrer_norm, currency, status);

create table if not exists referral_claims (
  id            text primary key default gen_random_uuid()::text,
  referrer_norm text not null,
  referrer_addr text not null,
  currency      currency not null,
  amount        numeric(38, 18) not null,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  tx_hash       text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists idx_rclaims_status on referral_claims(status);

-- ── ensure_referral_code: caller's code, generated on first request ──────────
create or replace function ensure_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare v_caller text := caller_addr(); v_orig text; v_code text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select code into v_code from referral_codes where addr_norm = v_caller;
  if v_code is not null then return v_code; end if;

  v_orig := coalesce(auth.jwt() ->> 'wallet_addr', v_caller);

  -- 6 hex chars (16.7M space); retry on the rare collision.
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from referral_codes where code = v_code);
  end loop;

  begin
    insert into referral_codes (code, addr, addr_norm) values (v_code, v_orig, v_caller);
  exception when unique_violation then
    -- another session created it first; fall through to the existing one
    null;
  end;

  select code into v_code from referral_codes where addr_norm = v_caller;
  return v_code;
end; $$;

-- ── attach_referral: bind the caller to a code's owner (once, permanent) ─────
create or replace function attach_referral(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_caller text := caller_addr(); v_orig text; v_ref_norm text; v_ref_addr text; v_code text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  v_code := upper(nullif(trim(p_code), ''));
  if v_code is null then return; end if;

  -- First-touch wins: ignore if this wallet is already referred.
  if exists (select 1 from referrals where referee_norm = v_caller) then return; end if;

  select addr_norm, addr into v_ref_norm, v_ref_addr from referral_codes where code = v_code;
  if v_ref_norm is null then return; end if;        -- unknown code
  if v_ref_norm = v_caller then return; end if;      -- no self-referral

  v_orig := coalesce(auth.jwt() ->> 'wallet_addr', v_caller);
  insert into referrals (referee_norm, referee_addr, referrer_norm, referrer_addr, code)
  values (v_caller, v_orig, v_ref_norm, v_ref_addr, v_code)
  on conflict (referee_norm) do nothing;
end; $$;

-- ── accrue_referral_earning: trigger when the fee is first recorded on a deal ─
-- Fires from the payout function's update of deals.fee_amount. Only a marketplace
-- full release sets fee_amount > 0 (see 0017), so this captures exactly the
-- "successful marketplace sale" case. Reward = 10% of the fee, to the seller's
-- referrer, rounded to the currency's precision. Idempotent on deal_id.
create or replace function accrue_referral_earning()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller_norm text; v_ref referrals%rowtype; v_dec int; v_reward numeric;
begin
  if NEW.fee_amount is null or NEW.fee_amount <= 0 then return NEW; end if;
  if coalesce(OLD.fee_amount, 0) > 0 then return NEW; end if;  -- only on first set

  v_seller_norm := norm_addr(NEW.seller_wallet_address);
  select * into v_ref from referrals where referee_norm = v_seller_norm;
  if not found then return NEW; end if;

  v_dec := case when NEW.price_currency = 'NIM' then 5 else 6 end;
  v_reward := round(NEW.fee_amount * 1000 / 10000.0, v_dec);  -- 10% of the fee
  if v_reward <= 0 then return NEW; end if;

  insert into referral_earnings (deal_id, referrer_norm, referrer_addr, referee_norm, currency, fee_amount, reward_amount)
  values (NEW.id, v_ref.referrer_norm, v_ref.referrer_addr, v_seller_norm, NEW.price_currency, NEW.fee_amount, v_reward)
  on conflict (deal_id) do nothing;

  return NEW;
end; $$;

drop trigger if exists trg_accrue_referral on deals;
create trigger trg_accrue_referral
  after update of fee_amount on deals
  for each row execute function accrue_referral_earning();

-- ── get_referral_summary: code + count + balances for the profile page ───────
create or replace function get_referral_summary()
returns json language plpgsql security definer set search_path = public as $$
declare v_caller text := caller_addr(); v_code text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  v_code := ensure_referral_code();
  return json_build_object(
    'code', v_code,
    'referralCount', (select count(*) from referrals where referrer_norm = v_caller),
    'balances', coalesce((
      select json_agg(json_build_object('currency', currency, 'accrued', accrued))
      from (
        select currency, sum(reward_amount) as accrued
        from referral_earnings
        where referrer_norm = v_caller and status = 'accrued'
        group by currency
      ) b
    ), '[]'::json),
    'lifetime', coalesce((
      select json_agg(json_build_object('currency', currency, 'total', total))
      from (
        select currency, sum(reward_amount) as total
        from referral_earnings where referrer_norm = v_caller group by currency
      ) l
    ), '[]'::json)
  );
end; $$;

-- ── claim_referral_earnings: move accrued balance into a pending claim ───────
create or replace function claim_referral_earnings(p_currency currency)
returns json language plpgsql security definer set search_path = public as $$
declare v_caller text := caller_addr(); v_orig text; v_total numeric; v_claim_id text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select coalesce(sum(reward_amount), 0) into v_total
  from referral_earnings
  where referrer_norm = v_caller and status = 'accrued' and currency = p_currency;
  if v_total <= 0 then raise exception 'No balance to claim'; end if;

  v_orig := coalesce(
    (select referrer_addr from referral_earnings
       where referrer_norm = v_caller and currency = p_currency limit 1),
    auth.jwt() ->> 'wallet_addr', v_caller);

  v_claim_id := gen_random_uuid()::text;
  insert into referral_claims (id, referrer_norm, referrer_addr, currency, amount, status)
  values (v_claim_id, v_caller, v_orig, p_currency, v_total, 'pending');

  update referral_earnings set status = 'claimed', claim_id = v_claim_id
  where referrer_norm = v_caller and status = 'accrued' and currency = p_currency;

  return json_build_object('claimId', v_claim_id, 'amount', v_total, 'currency', p_currency);
end; $$;

grant execute on function
  ensure_referral_code(), attach_referral(text), get_referral_summary(),
  claim_referral_earnings(currency)
  to anon, authenticated;

-- ── RLS: owners read their own rows; all writes go through the functions above ─
alter table referral_codes    enable row level security;
alter table referrals         enable row level security;
alter table referral_earnings enable row level security;
alter table referral_claims   enable row level security;

drop policy if exists rc_read  on referral_codes;
drop policy if exists rf_read  on referrals;
drop policy if exists re_read  on referral_earnings;
drop policy if exists rcl_read on referral_claims;

create policy rc_read  on referral_codes    for select using (addr_norm = caller_addr());
create policy rf_read  on referrals         for select using (referrer_norm = caller_addr() or referee_norm = caller_addr());
create policy re_read  on referral_earnings for select using (referrer_norm = caller_addr());
create policy rcl_read on referral_claims   for select using (referrer_norm = caller_addr());

grant select on referral_codes, referrals, referral_earnings, referral_claims to anon, authenticated;

-- ── extend auto-settle (0017) to also pay pending referral claims ────────────
create or replace function settle_pending_payouts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_url    text := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/payout';
  v_auth   text := 'Bearer ' || current_setting('app.service_role_key', true);
  v_hdr    jsonb := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth);
begin
  -- Full release to seller.
  for r in select id from deals where status = 'released' and release_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'release_to_seller'),
      timeout_milliseconds := 30000);
  end loop;

  -- Full refund to buyer.
  for r in select id from deals where status = 'refunded' and refund_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'refund_to_buyer'),
      timeout_milliseconds := 30000);
  end loop;

  -- Partial refund — seller leg.
  for r in select id from deals where status = 'partially_refunded' and release_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'seller'),
      timeout_milliseconds := 30000);
  end loop;

  -- Partial refund — buyer leg.
  for r in select id from deals where status = 'partially_refunded' and refund_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'buyer'),
      timeout_milliseconds := 30000);
  end loop;

  -- Referral claims awaiting payout.
  for r in select id from referral_claims where status = 'pending' loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('kind', 'referral_claim', 'claim_id', r.id),
      timeout_milliseconds := 30000);
  end loop;
end;
$$;
