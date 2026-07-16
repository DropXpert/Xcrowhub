-- 0031: harden support access, make deadline transitions server-driven, and
-- remove the public marketplace-counter mutation.

-- ---------------------------------------------------------------------------
-- Support tickets/messages
-- ---------------------------------------------------------------------------
-- The original policies allowed anonymous users to read every support thread,
-- update any ticket, and insert messages labelled as admin. Support data is now
-- visible only to the ticket opener and admins; identities are derived from the
-- wallet JWT rather than trusted request fields.

drop policy if exists tickets_read on support_tickets;
drop policy if exists tickets_insert on support_tickets;
drop policy if exists tickets_update on support_tickets;

create policy tickets_read on support_tickets for select
  using (
    is_admin()
    or (caller_addr() is not null and addr_eq(opener_addr, caller_addr()))
  );

create policy tickets_insert on support_tickets for insert
  with check (
    caller_addr() is not null
    and addr_eq(opener_addr, caller_addr())
    and status = 'open'
    and resolved_at is null
    and resolved_by is null
  );

-- Ticket status changes go through set_support_ticket_status(); direct UPDATE
-- would let a caller rewrite ownership or the associated deal.
revoke update on support_tickets from anon, authenticated;
grant select, insert on support_tickets to authenticated;
revoke select, insert on support_tickets from anon;

create or replace function set_support_ticket_status(
  p_ticket_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket support_tickets%rowtype;
  v_caller text := caller_addr();
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_status not in ('open', 'resolved') then raise exception 'Invalid ticket status'; end if;

  select * into v_ticket
  from support_tickets
  where id = p_ticket_id
  for update;

  if not found then raise exception 'Support ticket not found'; end if;
  if not is_admin() and not addr_eq(v_ticket.opener_addr, v_caller) then
    raise exception 'Not authorized for this ticket';
  end if;
  if p_status = 'resolved' and not is_admin() then
    raise exception 'Only an admin can resolve a ticket';
  end if;

  update support_tickets
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      resolved_by = case when p_status = 'resolved' then v_caller else null end,
      updated_at = now()
  where id = p_ticket_id;
end;
$$;

revoke all on function set_support_ticket_status(uuid, text) from public, anon;
grant execute on function set_support_ticket_status(uuid, text) to authenticated;

drop policy if exists support_read on support_messages;
drop policy if exists support_insert on support_messages;

create policy support_read on support_messages for select
  using (
    is_admin()
    or exists (
      select 1
      from support_tickets t
      where t.id = support_messages.ticket_id
        and caller_addr() is not null
        and addr_eq(t.opener_addr, caller_addr())
    )
  );

create policy support_insert on support_messages for insert
  with check (
    caller_addr() is not null
    and ticket_id is not null
    and exists (
      select 1
      from support_tickets t
      where t.id = support_messages.ticket_id
        and t.deal_id = support_messages.deal_id
        and t.status = 'open'
        and (
          (is_admin() and support_messages.sender = 'admin')
          or (
            not is_admin()
            and support_messages.sender = 'user'
            and addr_eq(t.opener_addr, caller_addr())
            and addr_eq(support_messages.sender_addr, caller_addr())
          )
        )
    )
  );

revoke select, insert on support_messages from anon;
grant select, insert on support_messages to authenticated;

create or replace function touch_support_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update support_tickets set updated_at = now() where id = NEW.ticket_id;
  return NEW;
end;
$$;

drop trigger if exists trg_touch_support_ticket on support_messages;
create trigger trg_touch_support_ticket
after insert on support_messages
for each row execute function touch_support_ticket_on_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table support_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marketplace order count
-- ---------------------------------------------------------------------------
-- Counts are updated inside the locked deal-release procedures. A public RPC
-- allowed anyone to inflate them and the frontend also double-counted releases.
revoke all on function increment_listing_orders(text) from public, anon, authenticated;

-- Forward-port auto_release_deal with the same release accounting used by the
-- other terminal transitions. A non-null elapsed deadline is mandatory.
create or replace function auto_release_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'delivered_by_seller' then return; end if;
  if v_deal.confirmation_deadline_at is null or v_deal.confirmation_deadline_at > v_now then return; end if;

  update deals
  set status = 'released', released_at = v_now, updated_at = v_now
  where id = p_deal_id;

  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text,
    p_deal_id,
    v_now,
    'Funds auto-released to seller',
    'Buyer did not confirm within the confirmation window.',
    'released'
  );

  if v_deal.listing_id is not null then
    update listings
    set orders_count = orders_count + 1, updated_at = v_now
    where id = v_deal.listing_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-side deadline reconciliation
-- ---------------------------------------------------------------------------
-- Client timers remain a fast-path, but correctness no longer depends on a user
-- having the app open when a deadline expires.

-- A submitted chain transaction gets a full verification grace period. Without
-- this guard, expiry/cancellation can win the race against verify-payment after
-- funds have already left the buyer, leaving those funds stranded in custody.
create or replace function expire_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_deal.status <> 'awaiting_payment' then return; end if;
  if v_deal.payment_deadline_at is null
     or v_deal.payment_deadline_at + interval '15 minutes' > v_now then
    return;
  end if;

  if v_deal.payment_started_at is not null
     and v_deal.payment_started_at > v_now - interval '15 minutes' then
    return;
  end if;

  -- Submitted hashes get an on-chain verification grace period. After it
  -- expires, the deal may close so fabricated hashes cannot freeze a listing;
  -- verify-payment can still restore a subsequently proven real payment.
  if v_deal.payment_tx_hash is not null
     and (
       v_deal.payment_submitted_at is null
       or v_deal.payment_submitted_at > v_now - interval '24 hours'
     ) then
    return;
  end if;

  update deals set status = 'expired', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text,
    p_deal_id,
    v_now,
    'Deal expired',
    'Buyer did not provide a verifiable payment within the payment window.',
    'expired'
  );
end;
$$;

-- Preserve the notification-enabled cancellation path from migration 0021,
-- while refusing to cancel a deal whose on-chain payment is being verified.
create or replace function cancel_deal(p_deal_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
  v_caller text := caller_addr();
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then return; end if;
  if v_caller is null or not addr_eq(v_deal.seller_wallet_address, v_caller) then
    raise exception 'Only the seller can cancel this deal';
  end if;
  if v_deal.payment_tx_hash is not null
     or (
       v_deal.payment_started_at is not null
       and v_deal.payment_started_at > v_now - interval '15 minutes'
     ) then
    raise exception 'Payment verification is pending; this deal cannot be cancelled';
  end if;
  if not can_transition(v_deal.status, 'cancelled') then return; end if;

  update deals set status = 'cancelled', updated_at = v_now where id = p_deal_id;
  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, p_deal_id, v_now, 'Deal cancelled', 'cancelled');

  perform app_notify(
    v_deal.buyer_wallet_address,
    'deal',
    'Deal cancelled',
    'Deal ' || p_deal_id || ' was cancelled by the seller.',
    '/deal/' || p_deal_id,
    p_deal_id,
    'deal:' || p_deal_id || ':cancelled'
  );
end;
$$;

  -- Retry pending hashes rapidly during the first 24 hours. After a deal has
  -- expired, recheck it hourly for 30 days so an RPC outage cannot strand a
  -- genuinely paid transfer; a verified hash atomically restores funds_held.
create or replace function verify_pending_payments()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_url text := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/verify-payment';
  v_auth text := 'Bearer ' || app_service_key();
  v_hdr jsonb := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth);
begin
  for r in
    select id from deals
    where payment_tx_hash is not null
      and payment_submitted_at is not null
      and (
        (status = 'awaiting_payment' and payment_submitted_at > now() - interval '24 hours')
        or (
          status = 'expired'
          and payment_submitted_at > now() - interval '30 days'
          and extract(minute from now()) = 0
        )
      )
  loop
    perform net.http_post(
      url := v_url,
      headers := v_hdr,
      body := jsonb_build_object('deal_id', r.id),
      timeout_milliseconds := 30000
    );
  end loop;
end;
$$;

create or replace function reconcile_deal_deadlines()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from deals
    where status = 'awaiting_payment'
      and payment_deadline_at is not null
      and payment_deadline_at + interval '15 minutes' <= now()
      and (
        payment_started_at is null
        or payment_started_at <= now() - interval '15 minutes'
      )
      and (
        payment_tx_hash is null
        or (
          payment_submitted_at is not null
          and payment_submitted_at <= now() - interval '24 hours'
        )
      )
  loop
    perform expire_deal(r.id);
  end loop;

  for r in
    select id from deals
    where status = 'proof_window'
      and proof_deadline_at is not null
      and proof_deadline_at <= now()
  loop
    perform resolve_after_proof_deadline(r.id);
  end loop;

  for r in
    select id from deals
    where status = 'delivered_by_seller'
      and confirmation_deadline_at is not null
      and confirmation_deadline_at <= now()
  loop
    perform auto_release_deal(r.id);
  end loop;
end;
$$;

revoke all on function reconcile_deal_deadlines() from public, anon, authenticated;

select cron.unschedule('xcrowhub-reconcile-deadlines')
where exists (select 1 from cron.job where jobname = 'xcrowhub-reconcile-deadlines');

select cron.schedule(
  'xcrowhub-reconcile-deadlines',
  '* * * * *',
  $$ select reconcile_deal_deadlines(); $$
);
