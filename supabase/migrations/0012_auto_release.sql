-- 0012: auto-release on confirmation timeout

-- Add confirmation_deadline_at to deals
alter table deals add column if not exists confirmation_deadline_at timestamptz;

-- Update mark_delivered to set confirmation_deadline_at
create or replace function mark_delivered(p_deal_id text, p_delivery_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now  timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  if v_deal.status <> 'funds_held' then raise exception 'Deal is not in funds_held status'; end if;

  update deals set
    status                   = 'delivered_by_seller',
    delivery_note            = coalesce(nullif(p_delivery_note,''), delivery_note),
    delivered_at             = v_now,
    confirmation_deadline_at = v_now + (v_deal.confirmation_window_hours || ' hours')::interval,
    updated_at               = v_now
  where id = p_deal_id;
end;
$$;

-- auto_release_deal: called by pg_cron or frontend when timer expires
create or replace function auto_release_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now  timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'delivered_by_seller' then return; end if;
  -- Only release if deadline has actually passed
  if v_deal.confirmation_deadline_at is not null and v_deal.confirmation_deadline_at > v_now then return; end if;

  update deals set
    status      = 'released',
    released_at = v_now,
    updated_at  = v_now
  where id = p_deal_id;
end;
$$;

grant execute on function mark_delivered(text, text)   to anon, authenticated;
grant execute on function auto_release_deal(text)      to anon, authenticated;

-- pg_cron: sweep all delivered_by_seller deals every minute
-- Run this in SQL Editor after enabling pg_cron:
-- SELECT cron.schedule(
--   'proofhold-auto-release'::text,
--   '* * * * *'::text,
--   $$
--   SELECT auto_release_deal(id)
--   FROM deals
--   WHERE status = 'delivered_by_seller'
--     AND confirmation_deadline_at IS NOT NULL
--     AND confirmation_deadline_at <= now()
--   $$::text
-- );
