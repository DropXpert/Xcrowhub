-- 0010: deal_messages — in-deal chat between buyer and seller
create table if not exists deal_messages (
  id          uuid primary key default gen_random_uuid(),
  deal_id     text not null references deals(id) on delete cascade,
  sender_addr text not null,
  sender_role text not null check (sender_role in ('buyer', 'seller', 'system')),
  body        text not null check (length(body) > 0 and length(body) <= 1000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_deal_messages_deal on deal_messages(deal_id, created_at asc);

alter table deal_messages enable row level security;
create policy dm_read   on deal_messages for select using (true);
create policy dm_insert on deal_messages for insert with check (length(body) > 0);

grant select, insert on deal_messages to anon, authenticated;

-- Enable realtime
alter publication supabase_realtime add table deal_messages;
