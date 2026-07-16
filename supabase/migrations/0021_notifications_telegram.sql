-- 0021: durable notifications + Telegram delivery + dispute hardening
--
-- Nimiq Pay has no push on Android, so a closed-app user never learns a deal
-- moved, an offer arrived, or a dispute was raised against them. This adds a
-- durable `notifications` table fed by DB triggers (so it captures events no
-- matter which proc/edge function/realtime write caused them), delivered to
-- Telegram by a cron flush, and read in-app by the notification bell.
--
-- It also closes the dispute exploit: a one-sided proof used to auto-pay after
-- the window (resolve_after_proof_deadline). Since we can't reliably notify the
-- other side, silence must not move money — every dispute now goes to a human.

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_addr  text not null,                 -- normalised (lower, no spaces)
  kind            text not null,                 -- deal | offer | message | dispute
  title           text not null,
  body            text not null default '',
  url             text not null default '',      -- in-app path, e.g. /deal/PH-../status
  deal_id         text,
  dedupe_key      text unique,                   -- idempotency (one row per event)
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  tg_attempted_at timestamptz,
  tg_sent_at      timestamptz
);
create index if not exists notifications_recipient_idx on notifications (recipient_addr, created_at desc);

alter table notifications enable row level security;
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select using (addr_eq(recipient_addr, caller_addr()));

-- Opt-in delivery channels (just Telegram for now).
create table if not exists notification_contacts (
  addr              text primary key,            -- normalised wallet address
  telegram_chat_id  bigint,
  telegram_username text,
  enabled           boolean not null default true,
  linked_at         timestamptz not null default now()
);
alter table notification_contacts enable row level security;
drop policy if exists nc_select on notification_contacts;
create policy nc_select on notification_contacts
  for select using (addr_eq(addr, caller_addr()));

-- Short-lived tokens that bind a Telegram /start to a wallet.
create table if not exists telegram_link_tokens (
  token      text primary key,
  addr       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
alter table telegram_link_tokens enable row level security;  -- no policies: definer-only

-- Realtime feed for the in-app bell.
alter publication supabase_realtime add table notifications;

-- ── notify helper (idempotent insert) ────────────────────────────────────────
create or replace function app_notify(
  p_addr text, p_kind text, p_title text, p_body text,
  p_url text, p_deal_id text, p_dedupe text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_addr text := nullif(lower(regexp_replace(coalesce(p_addr, ''), '\s', '', 'g')), '');
begin
  if v_addr is null then return; end if;                 -- no recipient → skip
  insert into notifications (id, recipient_addr, kind, title, body, url, deal_id, dedupe_key, created_at)
  values (gen_random_uuid(), v_addr, p_kind, p_title, p_body, coalesce(p_url, ''), p_deal_id, p_dedupe, now())
  on conflict (dedupe_key) do nothing;
end; $$;
revoke all on function app_notify(text,text,text,text,text,text,text) from public, anon, authenticated;

-- ── trigger: deal status transitions ─────────────────────────────────────────
create or replace function tg_notify_deal_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id   text := NEW.id;
  v_sell text := NEW.seller_wallet_address;
  v_buy  text := NEW.buyer_wallet_address;
  v_amt  text := NEW.price_amount::text || ' ' || NEW.price_currency::text;
  v_url  text := '/deal/' || NEW.id || '/status';
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;

  if NEW.status = 'funds_held' then
    perform app_notify(v_sell, 'deal', 'Payment received',
      'Buyer paid ' || v_amt || ' into escrow for ' || v_id || '. You can start delivering.',
      v_url, v_id, 'deal:'||v_id||':funds_held');
  elsif NEW.status = 'delivered_by_seller' then
    perform app_notify(v_buy, 'deal', 'Seller delivered',
      'Delivery marked for ' || v_id || '. Review and confirm receipt.',
      v_url, v_id, 'deal:'||v_id||':delivered');
  elsif NEW.status = 'released' then
    perform app_notify(v_sell, 'deal', 'Funds released',
      v_amt || ' released to you for ' || v_id || '.',
      v_url, v_id, 'deal:'||v_id||':released');
  elsif NEW.status = 'refunded' then
    perform app_notify(v_buy, 'deal', 'You were refunded',
      v_amt || ' refunded to you for ' || v_id || '.',
      v_url, v_id, 'deal:'||v_id||':refunded');
  elsif NEW.status = 'partially_refunded' then
    perform app_notify(v_buy,  'deal', 'Partial refund',
      'A partial refund was applied to ' || v_id || '.', v_url, v_id, 'deal:'||v_id||':partial:buyer');
    perform app_notify(v_sell, 'deal', 'Partial settlement',
      'A partial settlement was applied to ' || v_id || '.', v_url, v_id, 'deal:'||v_id||':partial:seller');
  elsif NEW.status = 'under_admin_review' then
    perform app_notify(v_buy,  'dispute', 'Dispute under review',
      'Deal ' || v_id || ' is now being reviewed by an admin.', v_url, v_id, 'deal:'||v_id||':review:buyer');
    perform app_notify(v_sell, 'dispute', 'Dispute under review',
      'Deal ' || v_id || ' is now being reviewed by an admin.', v_url, v_id, 'deal:'||v_id||':review:seller');
  elsif NEW.status = 'expired' then
    perform app_notify(v_sell, 'deal', 'Deal expired',
      'Deal ' || v_id || ' expired — the buyer did not pay in time.', v_url, v_id, 'deal:'||v_id||':expired');
  end if;
  -- proof_window and cancelled are emitted in-proc (the actor is known there).
  return NEW;
end; $$;

drop trigger if exists trg_notify_deal_status on deals;
create trigger trg_notify_deal_status after update of status on deals
  for each row execute function tg_notify_deal_status();

-- ── trigger: offers (new / accepted / countered / declined) ───────────────────
create or replace function tg_notify_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_amt text := NEW.current_amount::text || ' ' || NEW.currency::text;
begin
  if TG_OP = 'INSERT' then
    perform app_notify(NEW.seller_addr, 'offer', 'New offer received',
      v_amt || ' offered on your listing.', '/listings/'||NEW.listing_id, null,
      'offer:'||NEW.id::text||':new');
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if NEW.status = 'accepted' then
      perform app_notify(NEW.buyer_addr, 'offer', 'Offer accepted',
        'Pay ' || v_amt || ' to start the deal.',
        case when NEW.deal_id is not null then '/deal/'||NEW.deal_id||'/pay' else '/listings/'||NEW.listing_id end,
        NEW.deal_id, 'offer:'||NEW.id::text||':accepted');
    elsif NEW.status = 'countered' then
      perform app_notify(NEW.buyer_addr, 'offer', 'Seller countered',
        'New price: ' || v_amt || '.', '/listings/'||NEW.listing_id, null,
        'offer:'||NEW.id::text||':countered:'||NEW.current_amount::text);
    elsif NEW.status = 'declined' then
      perform app_notify(NEW.buyer_addr, 'offer', 'Offer declined',
        'The seller declined your offer.', '/listings/'||NEW.listing_id, null,
        'offer:'||NEW.id::text||':declined');
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_offer_ins on offers;
drop trigger if exists trg_notify_offer_upd on offers;
create trigger trg_notify_offer_ins after insert on offers
  for each row execute function tg_notify_offer();
create trigger trg_notify_offer_upd after update of status on offers
  for each row execute function tg_notify_offer();

-- ── trigger: deal chat messages ──────────────────────────────────────────────
create or replace function tg_notify_deal_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_deal deals%rowtype; v_to text;
begin
  if NEW.sender_role = 'system' then return NEW; end if;
  select * into v_deal from deals where id = NEW.deal_id;
  if not found then return NEW; end if;

  if addr_eq(v_deal.buyer_wallet_address, NEW.sender_addr) then
    v_to := v_deal.seller_wallet_address;
  else
    v_to := v_deal.buyer_wallet_address;
  end if;

  perform app_notify(v_to, 'message', 'New message',
    'New message on deal ' || NEW.deal_id || '.', '/deal/'||NEW.deal_id, NEW.deal_id,
    'msg:'||NEW.id::text);
  return NEW;
end; $$;

drop trigger if exists trg_notify_deal_message on deal_messages;
create trigger trg_notify_deal_message after insert on deal_messages
  for each row execute function tg_notify_deal_message();

-- ── recreate raise_query (0014 logic) + notify the other party ────────────────
create or replace function raise_query(
  p_deal_id text, p_raised_by party_role, p_reason query_reason, p_details text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
  v_role party_role; v_deadline timestamptz := now() + (24 * interval '1 hour');
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null then raise exception 'Not authenticated'; end if;

  if addr_eq(v_deal.seller_wallet_address, v_caller) then v_role := 'seller';
  elsif addr_eq(v_deal.buyer_wallet_address, v_caller) then v_role := 'buyer';
  else raise exception 'Only buyer or seller can raise a query'; end if;
  if p_raised_by <> v_role then raise exception 'Cannot raise a query as the other party'; end if;

  if v_deal.status not in ('funds_held', 'delivered_by_seller') then
    raise exception 'Query can only be raised while funds are held or after delivery';
  end if;

  update deals set status = 'proof_window', proof_deadline_at = v_deadline, updated_at = v_now where id = p_deal_id;

  insert into queries (id, deal_id, raised_by, reason, details, created_at)
  values (gen_random_uuid()::text, p_deal_id, v_role, p_reason, p_details, v_now);
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case when v_role = 'buyer' then 'Buyer raised a query' else 'Seller raised a query' end,
          p_reason::text, 'query');
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Proof window opened',
          'Both sides have 24 hours to submit proof.', 'proof');

  -- Notify the OTHER party (the one who did not raise the dispute).
  perform app_notify(
    case when v_role = 'buyer' then v_deal.seller_wallet_address else v_deal.buyer_wallet_address end,
    'dispute', 'Dispute opened',
    'A dispute was opened on deal ' || p_deal_id || '. Submit your proof within 24h, or it goes to admin review.',
    '/deal/'||p_deal_id||'/proof', p_deal_id, 'dispute:'||p_deal_id||':opened');
end; $$;

-- ── recreate submit_proof (0014 logic) + notify the other party ───────────────
create or replace function submit_proof(
  p_deal_id text, p_submitted_by party_role, p_explanation text,
  p_tx_hash text default null, p_attachment_urls jsonb default '[]'::jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr(); v_role party_role;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_deal.status <> 'proof_window' then
    raise exception 'Proofs can only be submitted while the proof window is open';
  end if;

  if addr_eq(v_deal.seller_wallet_address, v_caller) then v_role := 'seller';
  elsif addr_eq(v_deal.buyer_wallet_address, v_caller) then v_role := 'buyer';
  else raise exception 'Only buyer or seller can submit proof'; end if;
  if p_submitted_by <> v_role then raise exception 'Cannot submit proof as the other party'; end if;

  insert into proofs (id, deal_id, submitted_by, explanation, tx_hash, attachment_urls, created_at)
  values (gen_random_uuid()::text, p_deal_id, v_role, p_explanation, p_tx_hash, p_attachment_urls, v_now);

  if v_role = 'buyer' then
    update deals set buyer_proof_status = 'submitted', updated_at = v_now where id = p_deal_id;
  else
    update deals set seller_proof_status = 'submitted', updated_at = v_now where id = p_deal_id;
  end if;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now,
          case when v_role = 'buyer' then 'Buyer submitted proof' else 'Seller submitted proof' end,
          p_explanation, 'proof');

  -- Nudge the other party to submit theirs before the window closes.
  perform app_notify(
    case when v_role = 'buyer' then v_deal.seller_wallet_address else v_deal.buyer_wallet_address end,
    'dispute', 'Other party submitted proof',
    'The ' || v_role::text || ' submitted proof on deal ' || p_deal_id || '. Add yours before the window closes.',
    '/deal/'||p_deal_id||'/proof', p_deal_id, 'dispute:'||p_deal_id||':proof:'||v_role::text);
end; $$;

-- ── FIX: resolve_after_proof_deadline — disputes never auto-pay ───────────────
-- A one-sided proof used to auto-refund/auto-release. With unreliable mobile
-- notifications, the other side's silence cannot be treated as consent — every
-- contested outcome goes to a human. (apply_admin_decision handles the rest.)
create or replace function resolve_after_proof_deadline(p_deal_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_b boolean; v_s boolean;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'proof_window' then return; end if;
  if v_deal.proof_deadline_at is null or v_deal.proof_deadline_at > v_now then return; end if;

  v_b := v_deal.buyer_proof_status = 'submitted';
  v_s := v_deal.seller_proof_status = 'submitted';

  update deals set status = 'under_admin_review', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Moved to admin review',
          case
            when v_b and v_s then 'Both sides submitted proof.'
            when v_b then 'Only the buyer submitted proof — sent for admin review.'
            when v_s then 'Only the seller submitted proof — sent for admin review.'
            else 'Neither side submitted proof in time — sent for admin review.'
          end, 'admin');
end; $$;

-- ── recreate cancel_deal (0014 logic) + notify the buyer ──────────────────────
create or replace function cancel_deal(p_deal_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_deal deals%rowtype; v_now timestamptz := now(); v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_caller is null or not addr_eq(v_deal.seller_wallet_address, v_caller) then
    raise exception 'Only the seller can cancel this deal';
  end if;
  if not can_transition(v_deal.status, 'cancelled') then return; end if;
  update deals set status = 'cancelled', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal cancelled', 'cancelled');

  perform app_notify(v_deal.buyer_wallet_address, 'deal', 'Deal cancelled',
    'Deal ' || p_deal_id || ' was cancelled by the seller.', '/deal/'||p_deal_id, p_deal_id,
    'deal:'||p_deal_id||':cancelled');
end; $$;

-- ── linking RPCs (authenticated) ──────────────────────────────────────────────
create or replace function create_telegram_link_token()
returns text language plpgsql security definer set search_path = public as $$
declare v_addr text := caller_addr(); v_token text := md5(gen_random_uuid()::text);
begin
  if v_addr is null then raise exception 'Not authenticated'; end if;
  insert into telegram_link_tokens (token, addr, expires_at)
  values (v_token, v_addr, now() + interval '15 minutes');
  return v_token;
end; $$;

create or replace function get_my_notification_settings()
returns table (telegram_linked boolean, telegram_username text)
language sql security definer set search_path = public as $$
  select (c.addr is not null) as telegram_linked, c.telegram_username
  from (select caller_addr() as a) q
  left join notification_contacts c on addr_eq(c.addr, q.a) and c.enabled;
$$;

create or replace function unlink_telegram()
returns void language plpgsql security definer set search_path = public as $$
declare v_addr text := caller_addr();
begin
  if v_addr is null then raise exception 'Not authenticated'; end if;
  update notification_contacts set enabled = false where addr_eq(addr, v_addr);
end; $$;

create or replace function mark_notifications_read(p_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_addr text := caller_addr();
begin
  if v_addr is null then return; end if;
  update notifications set read_at = now()
  where addr_eq(recipient_addr, v_addr) and read_at is null
    and (p_ids is null or id = any(p_ids));
end; $$;

grant execute on function create_telegram_link_token(), get_my_notification_settings(),
  unlink_telegram(), mark_notifications_read(uuid[]) to authenticated;

-- ── service-role linking (called by the telegram-webhook function) ────────────
create or replace function link_telegram(p_token text, p_chat_id bigint, p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_addr text;
begin
  select addr into v_addr from telegram_link_tokens
   where token = p_token and used_at is null and expires_at > now()
   for update;
  if v_addr is null then return null; end if;

  update telegram_link_tokens set used_at = now() where token = p_token;
  insert into notification_contacts (addr, telegram_chat_id, telegram_username, enabled, linked_at)
  values (v_addr, p_chat_id, p_username, true, now())
  on conflict (addr) do update set
    telegram_chat_id  = excluded.telegram_chat_id,
    telegram_username = excluded.telegram_username,
    enabled           = true,
    linked_at         = now();
  return v_addr;
end; $$;

create or replace function unlink_telegram_by_chat(p_chat_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update notification_contacts set enabled = false where telegram_chat_id = p_chat_id;
end; $$;

revoke all on function link_telegram(text,bigint,text)    from public, anon, authenticated;
revoke all on function unlink_telegram_by_chat(bigint)     from public, anon, authenticated;
grant execute on function link_telegram(text,bigint,text), unlink_telegram_by_chat(bigint) to service_role;

-- ── flush: push unsent notifications to Telegram (cron, Vault-authed) ─────────
create or replace function flush_notifications()
returns void language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_url text := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/notify';
  v_hdr jsonb := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || app_service_key());
begin
  for r in
    select n.id, n.title, n.body, n.url, c.telegram_chat_id
    from notifications n
    join notification_contacts c on addr_eq(c.addr, n.recipient_addr) and c.enabled
    where n.tg_sent_at is null
      and c.telegram_chat_id is not null
      and (n.tg_attempted_at is null or n.tg_attempted_at < now() - interval '5 minutes')
      and n.created_at > now() - interval '1 day'
    order by n.created_at
    limit 50
  loop
    update notifications set tg_attempted_at = now() where id = r.id;
    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('notification_id', r.id, 'chat_id', r.telegram_chat_id,
                                 'title', r.title, 'text', r.body, 'url', r.url),
      timeout_milliseconds := 20000);
  end loop;
end; $$;
revoke all on function flush_notifications() from public, anon, authenticated;

select cron.unschedule('xcrowhub-notify') where exists (select 1 from cron.job where jobname = 'xcrowhub-notify');
select cron.schedule('xcrowhub-notify', '* * * * *', $$ select flush_notifications(); $$);
