-- 0008: support_messages table for deal-scoped chat
-- Users enter a deal ID to open a support thread.
-- Admin replies from /admin/support.
-- RLS: anyone can insert (anon ok), read only messages for the deal they opened.
-- Admin (service_role) can read all.

create table if not exists support_messages (
  id          uuid primary key default gen_random_uuid(),
  deal_id     text not null,
  sender      text not null check (sender in ('user', 'admin')),
  sender_addr text not null default '',
  body        text not null check (length(body) > 0 and length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_support_messages_deal on support_messages(deal_id, created_at asc);

alter table support_messages enable row level security;

-- Anyone can read messages for a specific deal (user knows the deal ID = access token)
create policy support_read on support_messages
  for select using (true);

-- Anyone can insert (user or admin)
create policy support_insert on support_messages
  for insert with check (length(body) > 0);

grant select, insert on support_messages to anon, authenticated;
