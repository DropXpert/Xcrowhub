-- Restore least-privilege RPC grants after the self-hosted database restore.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.  The managed
-- database had explicit revokes for these server-only SECURITY DEFINER helpers,
-- but the restore left anon/authenticated grants in their ACLs.

-- Secrets and scheduled-job entry points are database-internal.
revoke all on function public.app_service_key() from public, anon, authenticated;
revoke all on function public.settle_pending_payouts() from public, anon, authenticated;
revoke all on function public.verify_pending_payments() from public, anon, authenticated;
revoke all on function public.trigger_watcher(text) from public, anon, authenticated;
revoke all on function public.flush_notifications() from public, anon, authenticated;

-- Payout state may only be leased and completed by trusted backend code.
revoke all on function public.claim_payout_intent(
  text,text,text,text,text,tx_network,currency,text,numeric,numeric,integer,text
) from public, anon, authenticated;
revoke all on function public.claim_payout_intent(
  text,text,text,text,text,uuid,tx_network,currency,text,numeric,numeric,integer,text
) from public, anon, authenticated;
revoke all on function public.complete_payout_intent(text,text,text)
  from public, anon, authenticated;
revoke all on function public.release_payout_intent(text,text,text)
  from public, anon, authenticated;

grant execute on function public.claim_payout_intent(
  text,text,text,text,text,tx_network,currency,text,numeric,numeric,integer,text
) to service_role;
grant execute on function public.claim_payout_intent(
  text,text,text,text,text,uuid,tx_network,currency,text,numeric,numeric,integer,text
) to service_role;
grant execute on function public.complete_payout_intent(text,text,text) to service_role;
grant execute on function public.release_payout_intent(text,text,text) to service_role;

-- Payment verification is performed by the watcher/Edge Function only.
revoke all on function public.claim_and_confirm_deal_payment(
  text,text,text,text,text,text,bigint
) from public, anon, authenticated;
revoke all on function public.confirm_deal_payment(text,text,text)
  from public, anon, authenticated;
grant execute on function public.claim_and_confirm_deal_payment(
  text,text,text,text,text,text,bigint
) to service_role;
grant execute on function public.confirm_deal_payment(text,text,text) to service_role;

-- AuthideX campaign issuance and reporting are private backend APIs.
revoke all on function public.issue_campaign_coupon(text,text)
  from public, anon, authenticated;
revoke all on function public.authidex_activity_for_wallet(text)
  from public, anon, authenticated;
revoke all on function public.authidex_referral_detail(text)
  from public, anon, authenticated;
revoke all on function public.authidex_referral_detail_for_wallet(text)
  from public, anon, authenticated;

grant execute on function public.issue_campaign_coupon(text,text) to service_role;
grant execute on function public.authidex_activity_for_wallet(text) to service_role;
grant execute on function public.authidex_referral_detail(text) to service_role;
grant execute on function public.authidex_referral_detail_for_wallet(text) to service_role;

-- Coupon redemption remains an authenticated user action, never anonymous.
revoke all on function public.claim_campaign_coupon(text) from public, anon;
grant execute on function public.claim_campaign_coupon(text) to authenticated, service_role;

-- Additional helpers invoked by trusted services or database triggers.
revoke all on function public.app_notify(text,text,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.increment_listing_orders(text)
  from public, anon, authenticated;
revoke all on function public.restore_listing_inventory(text)
  from public, anon, authenticated;
revoke all on function public.platform_config_get(text)
  from public, anon, authenticated;
revoke all on function public.custody_addr_for(text)
  from public, anon, authenticated;
revoke all on function public.link_telegram(text,bigint,text)
  from public, anon, authenticated;
revoke all on function public.unlink_telegram_by_chat(bigint)
  from public, anon, authenticated;

grant execute on function public.app_notify(text,text,text,text,text,text,text) to service_role;
grant execute on function public.increment_listing_orders(text) to service_role;
grant execute on function public.restore_listing_inventory(text) to service_role;
grant execute on function public.platform_config_get(text) to service_role;
grant execute on function public.custody_addr_for(text) to service_role;
grant execute on function public.link_telegram(text,bigint,text) to service_role;
grant execute on function public.unlink_telegram_by_chat(bigint) to service_role;

-- Admin UI procedures stay available to authenticated users, with their
-- existing in-function admin checks, but are never callable anonymously.
revoke all on function public.apply_admin_decision(
  text,admin_decision_type,text,numeric,numeric,text
) from public, anon;
revoke all on function public.set_support_ticket_status(uuid,text) from public, anon;
grant execute on function public.apply_admin_decision(
  text,admin_decision_type,text,numeric,numeric,text
) to authenticated;
grant execute on function public.set_support_ticket_status(uuid,text) to authenticated;

-- Prevent the same restore/default-ACL regression for future functions owned
-- by postgres. Public functions must be granted explicitly by their migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
