-- 0017: marketplace fee + server-side auto-settle
--
-- Two additive pieces:
--
-- 1. Fee bookkeeping columns on `deals`. The actual 1% deduction happens in the
--    payout Edge Function (the single place funds move) — it pays the seller 99%
--    and leaves the 1% in the custody hot wallet. These columns just RECORD what
--    was taken, for receipts/auditing. Default 0 so non-marketplace and refund
--    payouts are unaffected.
--
-- 2. `settle_pending_payouts()` + a pg_cron schedule. The happy path
--    (confirm_receipt / auto_release_deal) only flips a deal to `released` in the
--    DB — it never moved money on-chain. This sweep finds any finalized deal that
--    still has no payout tx and POSTs to the payout function, which is idempotent
--    (an existing out-tx to the recipient short-circuits). That makes payout — and
--    therefore the fee — fire uniformly on every release path, not just admin ones.

-- ── 1. fee bookkeeping ───────────────────────────────────────────────────────
alter table deals add column if not exists fee_amount numeric(38, 18) not null default 0;
alter table deals add column if not exists fee_bps    integer        not null default 0;

-- ── 2. auto-settle sweep ─────────────────────────────────────────────────────
-- pg_net is used to call the payout Edge Function server-to-server. The service
-- role key is read from a DB setting (same mechanism as the 0007 watcher cron):
--   alter database postgres set app.service_role_key = '<service_role_key>';
create extension if not exists pg_net;

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
  -- Full release to seller (happy path, auto-release, seller-wins-dispute).
  for r in
    select id from deals where status = 'released' and release_tx_hash is null
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'release_to_seller'),
      timeout_milliseconds := 30000
    );
  end loop;

  -- Full refund to buyer.
  for r in
    select id from deals where status = 'refunded' and refund_tx_hash is null
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'refund_to_buyer'),
      timeout_milliseconds := 30000
    );
  end loop;

  -- Partial refund — seller leg.
  for r in
    select id from deals where status = 'partially_refunded' and release_tx_hash is null
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'seller'),
      timeout_milliseconds := 30000
    );
  end loop;

  -- Partial refund — buyer leg.
  for r in
    select id from deals where status = 'partially_refunded' and refund_tx_hash is null
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'buyer'),
      timeout_milliseconds := 30000
    );
  end loop;
end;
$$;

-- Only the service role / cron should run this (it spends money downstream).
revoke all on function settle_pending_payouts() from public, anon, authenticated;

-- Sweep every minute. Re-running is safe: the payout function is idempotent.
select cron.unschedule('xcrowhub-auto-settle') where exists (
  select 1 from cron.job where jobname = 'xcrowhub-auto-settle'
);

select cron.schedule(
  'xcrowhub-auto-settle',
  '* * * * *',
  $$ select settle_pending_payouts(); $$
);
