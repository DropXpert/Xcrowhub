-- 0016: add SET search_path = public to helper functions that were missing it.
-- Supabase security advisor flags any function without an explicit search_path.
-- All SECURITY DEFINER procedures already have this set; this migration covers
-- the smaller utility / trigger functions that were overlooked.

-- Trigger function: bump updated_at timestamp
create or replace function bump_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Helper: extract verified wallet address from the JWT wallet_addr claim.
create or replace function current_wallet_addr()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'wallet_addr', '');
$$;

-- Helper: state-machine transition guard (mirrors src/lib/stateMachine.ts).
create or replace function can_transition(from_status deal_status, to_status deal_status)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  return case
    when from_status = 'draft'                  then to_status in ('awaiting_payment', 'cancelled')
    when from_status = 'awaiting_payment'       then to_status in ('funds_held', 'expired', 'cancelled')
    when from_status = 'funds_held'             then to_status in ('delivered_by_seller', 'query_open')
    when from_status = 'delivered_by_seller'    then to_status in ('received_by_buyer', 'query_open')
    when from_status = 'received_by_buyer'      then to_status in ('released')
    when from_status = 'query_open'             then to_status in ('proof_window')
    when from_status = 'proof_window'           then to_status in ('under_admin_review', 'released', 'refunded')
    when from_status = 'under_admin_review'     then to_status in ('released', 'refunded', 'partially_refunded')
    else false
  end;
end;
$$;

-- Identity helpers (from 0014) — normalised caller address + admin check.
create or replace function caller_addr()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(lower(regexp_replace(coalesce(auth.jwt() ->> 'wallet_addr', ''), '\s', '', 'g')), '')
$$;

create or replace function is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'app_role', '') = 'admin'
$$;

-- Whitespace/case-insensitive address compare (NQ addresses carry spaces).
create or replace function addr_eq(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(a, ''), '\s', '', 'g'))
       = lower(regexp_replace(coalesce(b, ''), '\s', '', 'g'))
$$;
