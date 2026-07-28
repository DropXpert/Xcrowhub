-- Enforce campaign-wide minimum escrow values at the database boundary.
-- Existing historical rows remain valid; only new amounts and amount changes
-- are checked.
create or replace function public.guard_deal_payment_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price_amount is null then
    raise exception 'Deal price is required';
  end if;
  if new.price_currency = 'NIM' and new.price_amount < 5 then
    raise exception 'Minimum NIM deal amount is 5 NIM';
  end if;
  if new.price_currency = 'USDT' and new.price_amount < 1 then
    raise exception 'Minimum USDT deal amount is 1 USDT';
  end if;
  if new.price_currency = 'NIM' and new.price_amount <> trunc(new.price_amount, 5) then
    raise exception 'NIM deal price cannot exceed 5 decimal places';
  end if;
  if new.price_currency = 'USDT' and new.price_amount <> trunc(new.price_amount, 6) then
    raise exception 'USDT deal price cannot exceed 6 decimal places';
  end if;
  return new;
end;
$$;

create or replace function public.guard_marketplace_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price_currency = 'NIM' and new.price_amount < 5 then
    raise exception 'Minimum NIM listing amount is 5 NIM';
  end if;
  if new.price_currency = 'USDT' and new.price_amount < 1 then
    raise exception 'Minimum USDT listing amount is 1 USDT';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_marketplace_amount on public.listings;
create trigger guard_marketplace_amount
before insert or update of price_amount, price_currency on public.listings
for each row execute function public.guard_marketplace_amount();

create or replace function public.guard_offer_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.currency = 'NIM'
     and (new.original_amount < 5 or new.current_amount < 5) then
    raise exception 'Minimum NIM offer amount is 5 NIM';
  end if;
  if new.currency = 'USDT'
     and (new.original_amount < 1 or new.current_amount < 1) then
    raise exception 'Minimum USDT offer amount is 1 USDT';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_offer_amount on public.offers;
create trigger guard_offer_amount
before insert or update of original_amount, current_amount, currency on public.offers
for each row execute function public.guard_offer_amount();

revoke all on function public.guard_deal_payment_amount() from public, anon, authenticated;
revoke all on function public.guard_marketplace_amount() from public, anon, authenticated;
revoke all on function public.guard_offer_amount() from public, anon, authenticated;
