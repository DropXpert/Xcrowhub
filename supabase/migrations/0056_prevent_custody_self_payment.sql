-- A managed NIM payment always sends funds to the platform custody wallet.
-- That same wallet cannot be the buyer because Nimiq rejects self transfers.
-- Enforce this on the server as well as in the payment UI.

create or replace function public.begin_payment(
  p_deal_id text,
  p_buyer text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_caller text := caller_addr();
  v_now timestamptz := now();
  v_buyer_norm text := lower(regexp_replace(coalesce(p_buyer, ''), '\s', '', 'g'));
  v_custody_norm text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if p_buyer is null or not addr_eq(p_buyer, v_caller) then
    raise exception 'Buyer must be the connected or linked wallet';
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_deal.price_currency = 'NIM' then
    v_custody_norm := custody_addr_for('NIM');
    if v_custody_norm <> '' and v_buyer_norm = v_custody_norm then
      raise exception 'The XcrowHub custody wallet cannot pay into itself';
    end if;
  end if;

  if v_deal.status <> 'awaiting_payment' then raise exception 'Deal is not awaiting payment'; end if;
  if v_deal.payment_deadline_at is not null and v_now > v_deal.payment_deadline_at then
    raise exception 'The payment window has closed';
  end if;
  if v_deal.buyer_wallet_address is not null
     and not addr_eq(v_deal.buyer_wallet_address, v_caller) then
    raise exception 'Deal already belongs to another buyer';
  end if;

  update public.deals
  set buyer_wallet_address = case
        when price_currency = 'USDT' and escrow_model = 'smart_contract'
          then p_buyer
        else coalesce(buyer_wallet_address, p_buyer)
      end,
      payment_started_at = case
        when payment_started_at is null
          or payment_started_at <= v_now - interval '15 minutes'
          then v_now
        else payment_started_at
      end,
      updated_at = v_now
  where id = p_deal_id;
end;
$$;

revoke all on function public.begin_payment(text, text) from public, anon;
grant execute on function public.begin_payment(text, text) to authenticated;

-- Release any unpaid deal that was already reserved by the custody wallet
-- before this guard existed. A real buyer can then open the link and pay it.
update public.deals
set buyer_wallet_address = null,
    payment_started_at = null,
    updated_at = now()
where price_currency = 'NIM'
  and status = 'awaiting_payment'
  and payment_tx_hash is null
  and lower(regexp_replace(coalesce(buyer_wallet_address, ''), '\s', '', 'g')) =
      custody_addr_for('NIM');
