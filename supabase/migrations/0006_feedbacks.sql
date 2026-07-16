-- 0006: Feedback/rating system + deal categories

-- feedbacks table
create table if not exists feedbacks (
  id          text primary key,
  deal_id     text not null references deals(id) on delete cascade,
  from_addr   text not null,
  to_addr     text not null,
  from_role   party_role not null,
  rating      integer not null check (rating >= 1 and rating <= 5),
  comment     text not null default '',
  created_at  timestamptz not null default now(),
  unique(deal_id, from_role)
);
create index if not exists idx_feedbacks_to   on feedbacks(to_addr);
create index if not exists idx_feedbacks_from on feedbacks(from_addr);
create index if not exists idx_feedbacks_deal on feedbacks(deal_id);

alter table feedbacks enable row level security;
create policy feedbacks_read_public on feedbacks for select using (true);

-- category column on deals (default 'other' so existing rows are valid)
alter table deals add column if not exists category text not null default 'other';

-- submit_feedback — demo-relaxed (no JWT required)
create or replace function submit_feedback(
  p_deal_id   text,
  p_from_addr text,
  p_to_addr   text,
  p_from_role party_role,
  p_rating    integer,
  p_comment   text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if v_deal.status not in ('released', 'refunded', 'partially_refunded') then
    raise exception 'Feedback can only be left after a deal is finalized';
  end if;

  insert into feedbacks (id, deal_id, from_addr, to_addr, from_role, rating, comment, created_at)
  values (
    gen_random_uuid()::text,
    p_deal_id,
    lower(p_from_addr),
    lower(p_to_addr),
    p_from_role,
    p_rating,
    coalesce(p_comment, ''),
    now()
  )
  on conflict (deal_id, from_role) do nothing;
end;
$$;

-- Drop old create_deal (9-arg) before replacing with 10-arg version
drop function if exists create_deal(text,text,numeric,currency,text,int,int,text,text);

-- Re-create create_deal to accept category
create or replace function create_deal(
  p_title                     text,
  p_description               text,
  p_price_amount              numeric,
  p_price_currency            currency,
  p_seller_wallet_address     text,
  p_delivery_deadline_hours   int,
  p_confirmation_window_hours int,
  p_required_delivery_proof   text,
  p_refund_terms              text,
  p_category                  text default 'other'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  text := 'PH-' || upper(substr(md5(gen_random_uuid()::text),1,4)) || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  v_now timestamptz := now();
begin
  insert into deals (
    id, title, description, price_amount, price_currency,
    seller_wallet_address, delivery_deadline_hours, confirmation_window_hours,
    required_delivery_proof, refund_terms, status, category,
    created_at, updated_at, payment_deadline_at,
    buyer_proof_status, seller_proof_status
  ) values (
    v_id, p_title, coalesce(p_description, ''), p_price_amount, p_price_currency,
    p_seller_wallet_address, p_delivery_deadline_hours, p_confirmation_window_hours,
    p_required_delivery_proof, p_refund_terms, 'awaiting_payment',
    coalesce(p_category, 'other'),
    v_now, v_now, v_now + (48 * interval '1 hour'),
    'not_submitted', 'not_submitted'
  );

  insert into timeline (id, deal_id, at, label, kind)
  values (gen_random_uuid()::text, v_id, v_now, 'Deal created', 'created');

  return v_id;
end;
$$;

grant execute on function submit_feedback to anon, authenticated;
grant execute on function create_deal(text,text,numeric,currency,text,int,int,text,text,text) to anon, authenticated;
