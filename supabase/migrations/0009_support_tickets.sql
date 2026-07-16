-- 0009: support_tickets table (replaces thread-only model)
-- Each ticket has a status (open/resolved) and links to support_messages.
-- Users create tickets by deal ID; admin resolves them.

create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  deal_id     text not null,
  subject     text not null default '',
  status      text not null default 'open' check (status in ('open', 'resolved')),
  opener_addr text not null default '',
  resolved_at timestamptz,
  resolved_by text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tickets_deal on support_tickets(deal_id);
create index if not exists idx_tickets_opener on support_tickets(opener_addr);
create index if not exists idx_tickets_status on support_tickets(status);

alter table support_tickets enable row level security;

create policy tickets_read on support_tickets for select using (true);
create policy tickets_insert on support_tickets for insert with check (true);
create policy tickets_update on support_tickets for update using (true);

grant select, insert, update on support_tickets to anon, authenticated;

-- Add ticket_id FK to support_messages
alter table support_messages add column if not exists ticket_id uuid references support_tickets(id) on delete cascade;
create index if not exists idx_support_ticket on support_messages(ticket_id);
