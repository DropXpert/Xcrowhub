-- 0025: Admin Telegram alerts for tickets and disputes
--
-- Reuses the existing notifications pipeline (0021_notifications_telegram):
-- DB trigger -> notifications row -> flush_notifications cron -> notify
-- edge function -> Telegram. All we need is:
--   (a) a synthetic recipient_addr the triggers can target, and
--   (b) a notification_contacts row that maps that recipient to the
--       admin's Telegram chat_id.
--
-- The sentinel '__admin__' is safe because addr_eq normalises to
-- lower(strip-whitespace), and no real wallet address (NQ... / 0x...)
-- can contain underscores. The RLS policy on notifications limits SELECT
-- to caller_addr() = recipient_addr, so admin notifications never leak
-- into any end user's in-app bell -- they are Telegram-only, which is
-- what we want here.

-- ── (a) register admin as a notification recipient ───────────────────────────
insert into notification_contacts (addr, telegram_chat_id, telegram_username, enabled, linked_at)
values ('__admin__', 6199272731, 'xcrowhub-admin', true, now())
on conflict (addr) do update set
  telegram_chat_id = excluded.telegram_chat_id,
  enabled = true;

-- ── (b) triggers ─────────────────────────────────────────────────────────────

-- New support ticket opened by a user.
create or replace function tg_notify_admin_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app_notify(
    '__admin__', 'ticket', 'New support ticket',
    'Ticket ' || substr(NEW.id::text, 1, 8) || ' opened on deal ' || NEW.deal_id
      || case when coalesce(NEW.subject, '') = '' then '' else ' — ' || NEW.subject end,
    '/admin/support', NEW.deal_id,
    'admin:ticket:' || NEW.id::text || ':open'
  );
  return NEW;
end; $$;

drop trigger if exists trg_notify_admin_ticket on support_tickets;
create trigger trg_notify_admin_ticket after insert on support_tickets
  for each row execute function tg_notify_admin_ticket();

-- New user reply on an existing ticket. Skip admin's own replies -- the
-- admin obviously doesn't need a Telegram ping about their own message.
create or replace function tg_notify_admin_ticket_msg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.sender <> 'user' then return NEW; end if;
  perform app_notify(
    '__admin__', 'ticket', 'New ticket reply',
    'User replied on ticket for deal ' || NEW.deal_id
      || ': ' || left(coalesce(NEW.body, ''), 120),
    '/admin/support', NEW.deal_id,
    'admin:ticket_msg:' || NEW.id::text
  );
  return NEW;
end; $$;

drop trigger if exists trg_notify_admin_ticket_msg on support_messages;
create trigger trg_notify_admin_ticket_msg after insert on support_messages
  for each row execute function tg_notify_admin_ticket_msg();

-- Dispute raised on a deal. Fires from the INSERT into `queries` inside
-- the raise_query RPC, so the trigger catches both direct inserts and
-- future callers that don't go through the RPC.
create or replace function tg_notify_admin_dispute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app_notify(
    '__admin__', 'dispute', 'Dispute opened',
    NEW.raised_by::text || ' raised a dispute on deal ' || NEW.deal_id
      || ' (' || NEW.reason::text || ').'
      || case when coalesce(NEW.details, '') = '' then '' else ' — ' || left(NEW.details, 160) end,
    '/deal/' || NEW.deal_id || '/status', NEW.deal_id,
    'admin:dispute:' || NEW.id::text
  );
  return NEW;
end; $$;

drop trigger if exists trg_notify_admin_dispute on queries;
create trigger trg_notify_admin_dispute after insert on queries
  for each row execute function tg_notify_admin_dispute();

-- Deal escalated to admin review (proof window expired or a proof was
-- submitted that requires human judgement). Kept on a dedicated trigger
-- rather than folding into 0021's tg_notify_deal_status so this file
-- stays a clean superset -- 0021 can evolve independently.
create or replace function tg_notify_admin_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.status <> 'under_admin_review' then return NEW; end if;
  perform app_notify(
    '__admin__', 'dispute', 'Deal needs admin review',
    'Deal ' || NEW.id || ' moved to admin review. Both proofs are ready to inspect.',
    '/admin/deal/' || NEW.id, NEW.id,
    'admin:review:' || NEW.id
  );
  return NEW;
end; $$;

drop trigger if exists trg_notify_admin_review on deals;
create trigger trg_notify_admin_review after update of status on deals
  for each row execute function tg_notify_admin_review();
