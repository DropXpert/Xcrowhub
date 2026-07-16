-- 0020: move cron→function auth from a DB GUC to Supabase Vault
--
-- Supabase's managed instance denies `ALTER DATABASE ... SET app.service_role_key`
-- in the SQL editor, so the 0007/0017/0018/0019 crons (which read
-- current_setting('app.service_role_key')) were sending an empty bearer → the
-- functions 401'd and nothing auto-ran. Read the key from Vault instead.
--
-- NOTE: this project enforces the new Supabase API-key system, whose Edge gateway
-- rejects legacy service-role JWTs (UNAUTHORIZED_LEGACY_JWT). So the value stored
-- here is NOT a JWT — it is a shared CRON_SECRET that the functions (running with
-- verify_jwt = false) validate in code. The Vault entry keeps its legacy name.
--
-- ONE-TIME (run in SQL editor):
--   select vault.create_secret('<CRON_SECRET>', 'service_role_key');
--   -- also: supabase secrets set CRON_SECRET=<same value>

-- Reads the cron auth token from Vault. SECURITY DEFINER (owned by postgres,
-- which can decrypt the vault). Server-side only.
create or replace function app_service_key()
returns text language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1;
$$;
revoke all on function app_service_key() from public, anon, authenticated;

-- ── settle_pending_payouts — now authed via Vault ────────────────────────────
create or replace function settle_pending_payouts()
returns void language plpgsql security definer set search_path = public as $$
declare
  r      record;
  v_url  text := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/payout';
  v_auth text := 'Bearer ' || app_service_key();
  v_hdr  jsonb := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth);
begin
  for r in select id from deals where status = 'released' and release_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'release_to_seller'),
      timeout_milliseconds := 30000);
  end loop;

  for r in select id from deals where status = 'refunded' and refund_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'refund_to_buyer'),
      timeout_milliseconds := 30000);
  end loop;

  for r in select id from deals where status = 'partially_refunded' and release_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'seller'),
      timeout_milliseconds := 30000);
  end loop;

  for r in select id from deals where status = 'partially_refunded' and refund_tx_hash is null loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id, 'decision', 'partial_refund', 'leg', 'buyer'),
      timeout_milliseconds := 30000);
  end loop;

  for r in select id from referral_claims where status = 'pending' loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('kind', 'referral_claim', 'claim_id', r.id),
      timeout_milliseconds := 30000);
  end loop;
end; $$;

-- ── verify_pending_payments — now authed via Vault ───────────────────────────
create or replace function verify_pending_payments()
returns void language plpgsql security definer set search_path = public as $$
declare
  r      record;
  v_url  text := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/verify-payment';
  v_auth text := 'Bearer ' || app_service_key();
  v_hdr  jsonb := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth);
begin
  for r in
    select id from deals
    where status = 'awaiting_payment'
      and payment_tx_hash is not null
      and payment_submitted_at is not null
      and payment_submitted_at > now() - interval '6 hours'
  loop
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id),
      timeout_milliseconds := 30000);
  end loop;
end; $$;

-- ── trigger_watcher — Vault-authed watcher tick (replaces inline cron bodies) ─
create or replace function trigger_watcher(p_network text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/watcher',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || app_service_key()),
    body    := jsonb_build_object('network', p_network),
    timeout_milliseconds := 30000
  );
end; $$;
revoke all on function trigger_watcher(text) from public, anon, authenticated;

-- ── reschedule the inline watcher crons to use the Vault-authed helper ────────
select cron.unschedule('proofhold-nim-watcher') where exists (
  select 1 from cron.job where jobname = 'proofhold-nim-watcher'
);
select cron.schedule('proofhold-nim-watcher', '* * * * *', $$ select trigger_watcher('nimiq'); $$);

select cron.unschedule('xcrowhub-evm-watcher') where exists (
  select 1 from cron.job where jobname = 'xcrowhub-evm-watcher'
);
select cron.schedule('xcrowhub-evm-watcher', '* * * * *', $$ select trigger_watcher('evm'); $$);

-- (xcrowhub-auto-settle and xcrowhub-verify-payments call the functions above,
--  which now read Vault — no reschedule needed.)
