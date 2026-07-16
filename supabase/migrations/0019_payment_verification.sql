-- 0019: trustless on-chain payment confirmation
--
-- Before this, a deal reached `funds_held` because the CLIENT called pay_deal
-- right after signing — no on-chain check. And the watcher couldn't help: it
-- calls the hardened pay_deal (0014) as the service role, which has no
-- wallet_addr claim, so caller_addr() is null and pay_deal throws.
--
-- New model: the client SUBMITS a tx hash; the server VERIFIES it on-chain
-- (verify-payment function / watcher) and only then confirms. The deal stays
-- `awaiting_payment` until verified — no new status needed.

-- When the buyer's client last submitted a payment tx hash for verification.
alter table deals add column if not exists payment_submitted_at timestamptz;

-- ── confirm_deal_payment — the trusted transition, callers must be server-side ─
-- Mirrors pay_deal's effect (→ funds_held + timeline 'paid') but WITHOUT the
-- caller==buyer check, because the caller (verify-payment / watcher) has already
-- verified the payment on-chain. Idempotent: no-op unless still awaiting_payment.
create or replace function confirm_deal_payment(
  p_deal_id text, p_buyer text, p_tx_hash text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_deal deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status <> 'awaiting_payment' then return; end if;
  if not can_transition(v_deal.status, 'funds_held') then return; end if;

  update deals set
    status               = 'funds_held',
    buyer_wallet_address = coalesce(buyer_wallet_address, p_buyer),
    payment_tx_hash      = p_tx_hash,
    paid_at              = v_now,
    updated_at           = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Buyer paid into protected hold',
          v_deal.price_amount::text || ' ' || v_deal.price_currency::text, 'paid');
end; $$;

-- Server-only: the watcher / verify-payment functions call this with the service
-- role. Never callable by app users.
revoke all on function confirm_deal_payment(text, text, text) from public, anon, authenticated;

-- ── submit_payment — client records its tx hash; status is NOT changed here ───
create or replace function submit_payment(
  p_deal_id text, p_tx_hash text, p_buyer text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_deal deals%rowtype; v_caller text := caller_addr(); v_now timestamptz := now();
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status <> 'awaiting_payment' then return; end if;

  update deals set
    payment_tx_hash      = coalesce(nullif(p_tx_hash, ''), payment_tx_hash),
    buyer_wallet_address = coalesce(buyer_wallet_address, p_buyer),
    payment_submitted_at = v_now,
    updated_at           = v_now
  where id = p_deal_id;
end; $$;

grant execute on function submit_payment(text, text, text) to anon, authenticated;

-- The client may no longer self-confirm a payment.
revoke execute on function pay_deal(text, text, text) from anon, authenticated;

-- ── verify_pending_payments — cron backstop ──────────────────────────────────
-- Re-triggers verify-payment for any awaiting_payment deal that submitted a tx
-- hash recently but isn't confirmed yet (e.g. the client's verify call failed).
create or replace function verify_pending_payments()
returns void language plpgsql security definer set search_path = public as $$
declare
  r      record;
  v_url  text := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/verify-payment';
  v_auth text := 'Bearer ' || current_setting('app.service_role_key', true);
  v_hdr  jsonb := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth);
begin
  for r in
    select id from deals
    where status = 'awaiting_payment'
      and payment_tx_hash is not null
      and payment_submitted_at is not null
      and payment_submitted_at > now() - interval '6 hours'
  loop
    perform net.http_post(
      url := v_url, headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id),
      timeout_milliseconds := 30000
    );
  end loop;
end; $$;

revoke all on function verify_pending_payments() from public, anon, authenticated;

-- ── crons ────────────────────────────────────────────────────────────────────
create extension if not exists pg_net;

select cron.unschedule('xcrowhub-verify-payments') where exists (
  select 1 from cron.job where jobname = 'xcrowhub-verify-payments'
);
select cron.schedule(
  'xcrowhub-verify-payments', '* * * * *',
  $$ select verify_pending_payments(); $$
);

-- EVM watcher tick (mirrors the 0007 NIM tick) — backstop log-scan for USDT
-- payments made without going through the app's submit flow.
select cron.unschedule('xcrowhub-evm-watcher') where exists (
  select 1 from cron.job where jobname = 'xcrowhub-evm-watcher'
);
select cron.schedule(
  'xcrowhub-evm-watcher', '* * * * *',
  $$
  select net.http_post(
    url     := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/watcher',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"network":"evm"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
