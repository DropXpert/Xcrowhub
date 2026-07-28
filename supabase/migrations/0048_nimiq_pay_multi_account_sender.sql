-- Nimiq Pay may execute a transaction from a different wallet account than the
-- account used to authenticate with XcrowHub. Edge Functions still verify the
-- exact recipient, amount, successful execution, submitted hash, and deal memo.
-- Keep the authenticated buyer on the deal while recording the real on-chain
-- sender in the custody ledger.
create or replace function public.claim_and_confirm_deal_payment(
  p_deal_id text,
  p_buyer text,
  p_tx_hash text,
  p_network text,
  p_from_addr text,
  p_to_addr text,
  p_block_height bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_hash text := lower(btrim(p_tx_hash));
  v_network tx_network;
  v_expected_network tx_network;
  v_claimed_deal text;
  v_now timestamptz := now();
begin
  if v_hash is null or v_hash = '' or length(v_hash) > 256 then
    raise exception 'A valid payment transaction hash is required';
  end if;
  if nullif(regexp_replace(coalesce(p_buyer, ''), '\s', '', 'g'), '') is null then
    raise exception 'A verified deal buyer is required';
  end if;
  if nullif(regexp_replace(coalesce(p_from_addr, ''), '\s', '', 'g'), '') is null then
    raise exception 'Verified on-chain sender is required';
  end if;
  if nullif(btrim(p_to_addr), '') is null then
    raise exception 'Custody recipient is required';
  end if;
  begin
    v_network := lower(btrim(p_network))::tx_network;
  exception when invalid_text_representation then
    raise exception 'Unsupported payment network: %', p_network;
  end;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;

  v_expected_network := case v_deal.price_currency
    when 'NIM' then 'nimiq'::tx_network
    when 'USDT' then 'evm'::tx_network
  end;
  if v_network is distinct from v_expected_network then
    raise exception 'Payment network does not match deal currency';
  end if;
  if v_deal.payment_tx_hash is not null
     and lower(btrim(v_deal.payment_tx_hash)) <> v_hash then
    raise exception 'Verified transaction does not match submitted transaction';
  end if;
  if v_deal.buyer_wallet_address is not null
     and not addr_eq(v_deal.buyer_wallet_address, p_buyer) then
    raise exception 'Verified buyer does not match deal buyer';
  end if;

  if v_deal.status <> 'awaiting_payment' and v_deal.status <> 'expired' then
    if v_deal.paid_at is not null
       and v_deal.payment_tx_hash is not null
       and lower(btrim(v_deal.payment_tx_hash)) = v_hash then
      return true;
    end if;
    raise exception 'Deal is not awaiting payment';
  end if;
  if v_deal.status = 'awaiting_payment'
     and not can_transition(v_deal.status, 'funds_held') then
    raise exception 'Illegal transition: % -> funds_held', v_deal.status;
  end if;

  insert into public.payment_tx_claims (network, tx_hash, deal_id)
  values (v_network, v_hash, p_deal_id)
  on conflict (network, tx_hash) do nothing;

  select c.deal_id into v_claimed_deal
  from public.payment_tx_claims c
  where c.network = v_network and c.tx_hash = v_hash
  for update;

  if v_claimed_deal is distinct from p_deal_id then
    raise exception using
      errcode = '23505',
      message = format('Payment transaction %s is already claimed by another deal', v_hash);
  end if;

  insert into public.transactions (
    id, deal_id, direction, network, amount, currency,
    from_addr, to_addr, tx_hash, block_height, status
  ) values (
    gen_random_uuid()::text,
    p_deal_id,
    'in',
    v_network,
    v_deal.price_amount,
    v_deal.price_currency,
    p_from_addr,
    coalesce(nullif(btrim(p_to_addr), ''), ''),
    v_hash,
    p_block_height,
    'confirmed'
  );

  update public.deals set
    status               = 'funds_held',
    buyer_wallet_address = coalesce(buyer_wallet_address, p_buyer),
    payment_tx_hash      = v_hash,
    paid_at              = v_now,
    updated_at           = v_now
  where id = p_deal_id;

  insert into public.timeline (id, deal_id, at, label, detail, kind)
  values (
    gen_random_uuid()::text,
    p_deal_id,
    v_now,
    case when v_deal.status = 'expired'
      then 'Late payment verified and restored to protected hold'
      else 'Buyer paid into protected hold'
    end,
    v_deal.price_amount::text || ' ' || v_deal.price_currency::text,
    'paid'
  );

  return true;
end;
$$;

revoke all on function public.claim_and_confirm_deal_payment(
  text, text, text, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.claim_and_confirm_deal_payment(
  text, text, text, text, text, text, bigint
) to service_role;
