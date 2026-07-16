// Xcrow payout trigger.
//
// Money-moving parameters are derived from database state.  Each economic
// payout is coordinated through payout_intents (0030) and sent to the signer
// with a deterministic idempotency reference.  The signer persists the fully
// signed raw transaction before broadcast, closing the otherwise dangerous
// crash window between chain broadcast and the database update.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNER_URL = (Deno.env.get("SIGNER_URL") ?? "").replace(/\/+$/, "");
const SIGNER_SHARED_SECRET = Deno.env.get("SIGNER_SHARED_SECRET") ?? "";
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET") ?? "";
const PAYOUT_INTERNAL_SECRET = Deno.env.get("PAYOUT_INTERNAL_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const NIM_CUSTODY = normalizedAddress(Deno.env.get("NIM_CUSTODY_ADDR"));
const EVM_CUSTODY = normalizedAddress(Deno.env.get("EVM_CUSTODY_ADDR"));
const MARKETPLACE_FEE_BPS_RAW = Deno.env.get("MARKETPLACE_FEE_BPS") ?? "100";
const MARKETPLACE_FEE_BPS = Number(MARKETPLACE_FEE_BPS_RAW);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Decision = "release_to_seller" | "refund_to_buyer" | "partial_refund";
type DealLeg = "seller" | "buyer";
type Currency = "NIM" | "USDT";
type Network = "nimiq" | "evm";
type PayoutKind = "release" | "refund" | "partial_seller" | "partial_buyer" | "referral";

interface PayoutRequest {
  kind?: "deal" | "referral_claim";
  deal_id?: string;
  decision?: Decision;
  leg?: DealLeg;
  claim_id?: string;
}

interface PayoutSpec {
  payoutKey: string;
  subjectKind: "deal" | "referral_claim";
  payoutKind: PayoutKind;
  dealId: string | null;
  referralClaimId: string | null;
  network: Network;
  currency: Currency;
  recipient: string;
  amount: string;
  feeAmount: string;
  feeBps: number;
}

interface AuthContext {
  internal: boolean;
  admin: boolean;
  walletAddr?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const configError = moneyPathConfigError();
  if (configError) {
    console.error(`[payout] refusing money movement: ${configError}`);
    return json({ error: "Payout service is not safely configured" }, 503);
  }

  try {
    const auth = await getAuthContext(req);
    const body = (await req.json()) as PayoutRequest;

    if (body.kind === "referral_claim") {
      if (!auth.internal && !auth.admin) return json({ error: "Unauthorized" }, 401);
      return await handleReferralClaim(body);
    }

    const dealId = body.deal_id;
    const decision = body.decision;
    if (!dealId || !decision) {
      return json({ error: "deal_id and decision are required" }, 400);
    }
    if (!["release_to_seller", "refund_to_buyer", "partial_refund"].includes(decision)) {
      return json({ error: "Invalid payout decision" }, 400);
    }

    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .maybeSingle();
    if (dealErr) throw dealErr;
    if (!deal) return json({ error: "Deal not found" }, 404);

    const requiredStatus = decision === "release_to_seller"
      ? "released"
      : decision === "refund_to_buyer"
      ? "refunded"
      : "partially_refunded";
    if (deal.status !== requiredStatus) {
      return json({ error: `Deal is not ${requiredStatus} (current: ${deal.status})` }, 409);
    }
    if (!auth.internal && !auth.admin && !isDealParticipant(auth.walletAddr, deal)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const spec = await deriveDealPayout(deal, decision, body.leg);
    if (spec instanceof Response) return spec;

    // Compatibility with payouts completed before migration 0030.  The specific
    // leg hash is authoritative; recipient-based transaction lookup is not.
    const existingHash = spec.payoutKind === "release" || spec.payoutKind === "partial_seller"
      ? deal.release_tx_hash
      : deal.refund_tx_hash;
    if (existingHash) {
      if (spec.payoutKind === "release") await applyLegacyFeePatch(deal.id, spec);
      return json({ success: true, txHash: existingHash, idempotent: true });
    }

    return await executePayout(spec);
  } catch (err) {
    console.error("[payout] error", err);
    return json({ error: (err as Error).message || "Internal payout error" }, 500);
  }
});

async function deriveDealPayout(
  deal: any,
  decision: Decision,
  leg: DealLeg | undefined,
): Promise<PayoutSpec | Response> {
  let recipient: string;
  let grossAmount: string;
  let payoutKind: PayoutKind;

  if (decision === "release_to_seller") {
    recipient = deal.seller_wallet_address;
    grossAmount = String(deal.price_amount);
    payoutKind = "release";
  } else if (decision === "refund_to_buyer") {
    recipient = deal.buyer_wallet_address;
    grossAmount = String(deal.price_amount);
    payoutKind = "refund";
  } else {
    if (leg !== "seller" && leg !== "buyer") {
      return json({ error: "partial_refund requires leg 'seller' | 'buyer'" }, 400);
    }
    const { data: decisionRow, error } = await supabase
      .from("decisions")
      .select("buyer_amount,seller_amount")
      .eq("deal_id", deal.id)
      .eq("decision", "partial_refund")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!decisionRow) return json({ error: "No partial-refund decision on record" }, 409);
    recipient = leg === "seller" ? deal.seller_wallet_address : deal.buyer_wallet_address;
    grossAmount = String(leg === "seller" ? decisionRow.seller_amount : decisionRow.buyer_amount);
    payoutKind = leg === "seller" ? "partial_seller" : "partial_buyer";
  }

  if (!recipient) return json({ error: "Recipient address missing" }, 409);
  const currency = deal.price_currency as Currency;
  if (currency !== "NIM" && currency !== "USDT") {
    return json({ error: "Unsupported payout currency" }, 409);
  }
  if (isCustodyRecipient(currency, recipient)) {
    return json({ error: "Recipient is the custody address; fix the deal wallet before payout" }, 409);
  }

  const decimals = currency === "NIM" ? 5 : 6;
  let grossUnits: bigint;
  try {
    grossUnits = decimalToUnits(grossAmount, decimals);
  } catch (error) {
    return json({ error: (error as Error).message }, 409);
  }
  if (grossUnits <= 0n) return json({ error: "Derived payout amount is not positive" }, 409);

  const feeApplies = payoutKind === "release" && deal.listing_id != null && MARKETPLACE_FEE_BPS > 0;
  const feeUnits = feeApplies
    ? (grossUnits * BigInt(MARKETPLACE_FEE_BPS)) / 10_000n
    : 0n;
  const payoutUnits = grossUnits - feeUnits;
  if (payoutUnits <= 0n) return json({ error: "Net payout after fee is not positive" }, 409);

  const suffix = payoutKind === "partial_seller"
    ? "partial:seller"
    : payoutKind === "partial_buyer"
    ? "partial:buyer"
    : payoutKind;

  return {
    payoutKey: `deal:${deal.id}:${suffix}`,
    subjectKind: "deal",
    payoutKind,
    dealId: deal.id,
    referralClaimId: null,
    network: currency === "NIM" ? "nimiq" : "evm",
    currency,
    recipient,
    amount: unitsToDecimal(payoutUnits, decimals),
    feeAmount: unitsToDecimal(feeUnits, decimals),
    feeBps: feeApplies ? MARKETPLACE_FEE_BPS : 0,
  };
}

async function handleReferralClaim(body: PayoutRequest): Promise<Response> {
  const claimId = body.claim_id;
  if (!claimId) return json({ error: "claim_id is required" }, 400);

  const { data: claim, error } = await supabase
    .from("referral_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw error;
  if (!claim) return json({ error: "Claim not found" }, 404);
  if (claim.status === "paid" && claim.tx_hash) {
    return json({ success: true, txHash: claim.tx_hash, idempotent: true });
  }
  if (claim.status !== "pending") {
    return json({ error: `Claim is not pending (current: ${claim.status})` }, 409);
  }

  const currency = claim.currency as Currency;
  if (currency !== "NIM" && currency !== "USDT") {
    return json({ error: "Unsupported claim currency" }, 409);
  }
  const recipient = String(claim.referrer_addr ?? "");
  if (!recipient) return json({ error: "Claim has no recipient address" }, 409);
  if (isCustodyRecipient(currency, recipient)) {
    return json({ error: "Referral recipient cannot be the custody address" }, 409);
  }
  const decimals = currency === "NIM" ? 5 : 6;
  let units: bigint;
  try {
    units = decimalToUnits(String(claim.amount), decimals);
  } catch (parseError) {
    return json({ error: (parseError as Error).message }, 409);
  }
  if (units <= 0n) return json({ error: "Claim amount is not positive" }, 409);

  return await executePayout({
    payoutKey: `referral:${claimId}`,
    subjectKind: "referral_claim",
    payoutKind: "referral",
    dealId: null,
    referralClaimId: claimId,
    network: currency === "NIM" ? "nimiq" : "evm",
    currency,
    recipient,
    amount: unitsToDecimal(units, decimals),
    feeAmount: "0",
    feeBps: 0,
  });
}

async function executePayout(spec: PayoutSpec): Promise<Response> {
  const leaseToken = crypto.randomUUID();
  const { data: claimResult, error: claimError } = await supabase.rpc("claim_payout_intent", {
    p_payout_key: spec.payoutKey,
    p_subject_kind: spec.subjectKind,
    p_payout_kind: spec.payoutKind,
    p_deal_id: spec.dealId,
    p_referral_claim_id: spec.referralClaimId,
    p_network: spec.network,
    p_currency: spec.currency,
    p_recipient: spec.recipient,
    p_amount: spec.amount,
    p_fee_amount: spec.feeAmount,
    p_fee_bps: spec.feeBps,
    p_lease_token: leaseToken,
  });
  if (claimError) throw claimError;

  const claimed = claimResult as {
    acquired?: boolean;
    status?: string;
    tx_hash?: string | null;
    lease_expires_at?: string | null;
  } | null;
  if (claimed?.status === "broadcast" && claimed.tx_hash) {
    return json({ success: true, txHash: claimed.tx_hash, idempotent: true });
  }
  if (!claimed?.acquired) {
    return json({
      success: true,
      pending: true,
      message: "Payout is already being processed",
      retryAfter: claimed?.lease_expires_at ?? undefined,
    }, 202);
  }

  console.log(
    `[payout] ${spec.payoutKey} -> ${spec.amount} ${spec.currency}` +
      (spec.feeBps ? ` (fee ${spec.feeAmount} @ ${spec.feeBps}bps)` : ""),
  );

  let signerRes: Response;
  try {
    signerRes = await fetch(`${SIGNER_URL}/sign-and-broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SIGNER_SHARED_SECRET}`,
      },
      body: JSON.stringify({
        network: spec.network,
        currency: spec.currency,
        to: spec.recipient,
        amount: spec.amount,
        reference: spec.payoutKey,
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    await releaseLease(spec.payoutKey, leaseToken, (error as Error).message);
    return json({ error: "Signer request failed; payout remains retryable" }, 502);
  }

  if (!signerRes.ok) {
    const signerError = (await signerRes.text()).slice(0, 2000);
    console.error(`[payout] signer failed for ${spec.payoutKey}: ${signerError}`);
    await releaseLease(spec.payoutKey, leaseToken, signerError);
    return json({ error: "Signer failed; payout remains retryable" }, 502);
  }

  const signerBody = await signerRes.json().catch(() => null) as { txHash?: unknown } | null;
  const txHash = typeof signerBody?.txHash === "string" ? signerBody.txHash.trim() : "";
  if (!txHash) {
    await releaseLease(spec.payoutKey, leaseToken, "Signer returned no transaction hash");
    return json({ error: "Signer returned an invalid response" }, 502);
  }

  const { data: completed, error: completeError } = await supabase.rpc("complete_payout_intent", {
    p_payout_key: spec.payoutKey,
    p_lease_token: leaseToken,
    p_tx_hash: txHash,
  });
  if (completeError) {
    // Do not clear the lease here: the transaction may already be on-chain.  On
    // retry, the signer returns/rebroadcasts the exact persisted signed tx.
    console.error(`[payout] ${spec.payoutKey} broadcast as ${txHash}, DB finalization failed`, completeError);
    return json({
      error: "Payout broadcast; database finalization will retry safely",
      retryable: true,
    }, 503);
  }

  const result = completed as { tx_hash?: string; idempotent?: boolean } | null;
  return json({
    success: true,
    txHash: result?.tx_hash ?? txHash,
    idempotent: result?.idempotent ?? false,
    payoutAmount: spec.amount,
    feeAmount: spec.feeAmount,
    feeBps: spec.feeBps,
  });
}

async function releaseLease(payoutKey: string, leaseToken: string, errorMessage: string) {
  const { error } = await supabase.rpc("release_payout_intent", {
    p_payout_key: payoutKey,
    p_lease_token: leaseToken,
    p_error: errorMessage,
  });
  if (error) console.error(`[payout] failed to release lease for ${payoutKey}`, error);
}

async function applyLegacyFeePatch(dealId: string, spec: PayoutSpec) {
  const { error } = await supabase
    .from("deals")
    .update({ fee_amount: Number(spec.feeAmount), fee_bps: spec.feeBps })
    .eq("id", dealId);
  if (error) throw error;
}

function moneyPathConfigError(): string | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "Supabase service credentials are missing";
  if (!SIGNER_URL) return "SIGNER_URL is missing";
  if (!SIGNER_SHARED_SECRET || SIGNER_SHARED_SECRET === "change-me-to-a-long-random-value") {
    return "SIGNER_SHARED_SECRET is missing or still the placeholder";
  }
  if (!NIM_CUSTODY || !EVM_CUSTODY) {
    return "NIM_CUSTODY_ADDR and EVM_CUSTODY_ADDR are both required";
  }
  if (!Number.isInteger(MARKETPLACE_FEE_BPS) || MARKETPLACE_FEE_BPS < 0 || MARKETPLACE_FEE_BPS >= 10_000) {
    return "MARKETPLACE_FEE_BPS must be an integer from 0 to 9999";
  }
  return null;
}

async function getAuthContext(req: Request): Promise<AuthContext> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { internal: false, admin: false };
  if ((PAYOUT_INTERNAL_SECRET && token === PAYOUT_INTERNAL_SECRET) ||
      (CRON_SECRET && token === CRON_SECRET) || token === SUPABASE_SERVICE_ROLE_KEY) {
    return { internal: true, admin: false };
  }
  if (JWT_SECRET_RAW) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET_RAW));
      return {
        internal: false,
        admin: payload.app_role === "admin",
        walletAddr: typeof payload.wallet_addr === "string" ? payload.wallet_addr : undefined,
      };
    } catch {
      // Invalid user token.
    }
  }
  return { internal: false, admin: false };
}

function decimalToUnits(value: string, decimals: number): bigint {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("Payout amount is not a valid decimal");
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.slice(decimals).match(/[1-9]/)) {
    throw new Error(`Payout amount exceeds ${decimals} decimal places`);
  }
  const padded = fraction.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(padded || "0");
}

function unitsToDecimal(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const fraction = (units % scale).toString().padStart(decimals, "0");
  return decimals === 0 ? whole.toString() : `${whole}.${fraction}`;
}

function normalizedAddress(address: unknown): string {
  return typeof address === "string" ? address.replace(/\s+/g, "").toLowerCase() : "";
}

function isDealParticipant(walletAddr: string | undefined, deal: any): boolean {
  const wallet = normalizedAddress(walletAddr);
  return Boolean(wallet) && (
    wallet === normalizedAddress(deal.seller_wallet_address) ||
    wallet === normalizedAddress(deal.buyer_wallet_address)
  );
}

function isCustodyRecipient(currency: Currency, address: string): boolean {
  const custody = currency === "NIM" ? NIM_CUSTODY : EVM_CUSTODY;
  return Boolean(custody) && normalizedAddress(address) === custody;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
