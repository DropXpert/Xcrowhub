// XcrowHub — Payment verification Edge Function
//
// Confirms a deal's payment by VERIFYING the submitted tx hash on-chain, then
// calls the server-only atomic claim/confirm RPC to move it to funds_held. The
// client can no longer self-confirm (pay_deal is revoked); it only submits a
// hash via submit_payment, and this function decides whether it's real.
//
// POST { deal_id }
//   → { confirmed: boolean, reason?: string }
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
//   CRON_SECRET                               (shared secret the cron sweep sends)
//   JWT_SECRET                                (validate the client's wallet JWT)
//   NIM_RPC, NIM_CUSTODY_ADDR                 (Nimiq verification)
//   EVM_RPC, EVM_CUSTODY_ADDR, USDT_CONTRACT, USDT_DECIMALS  (USDT verification)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared secret the pg_cron sweep sends (Bearer). The project enforces the new
// API-key system, so the gateway rejects legacy service-role JWTs — we run with
// verify_jwt = false and authorize here instead.
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET") ?? "";

const NIM_RPC = Deno.env.get("NIM_RPC") ?? "https://rpc.nimiqwatch.com";
const NIM_CUSTODY = (Deno.env.get("NIM_CUSTODY_ADDR") ?? "").replace(/\s+/g, "").toUpperCase();

const EVM_RPC = Deno.env.get("EVM_RPC") ?? "https://polygon-rpc.com";
const EVM_CUSTODY = (Deno.env.get("EVM_CUSTODY_ADDR") ?? "").toLowerCase();
const USDT_CONTRACT = (Deno.env.get("USDT_CONTRACT") ?? "0xc2132D05D31c914a87C6611C10748AEb04B58e8F").toLowerCase();
const USDT_DECIMALS = Number(Deno.env.get("USDT_DECIMALS") ?? "6");

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!(await isAuthorized(req))) return json({ error: "Unauthorized" }, 401);

  try {
    const { deal_id } = (await req.json()) as { deal_id?: string };
    if (!deal_id) return json({ error: "deal_id is required" }, 400);

    const { data: deal, error } = await supabase
      .from("deals")
      .select("*")
      .eq("id", deal_id)
      .maybeSingle();
    if (error) throw error;
    if (!deal) return json({ error: "Deal not found" }, 404);

    // An expired deal with a submitted hash remains recoverable: if delayed
    // chain verification proves payment, the atomic RPC restores funds_held.
    const recoverExpired =
      deal.status === "expired" && !deal.paid_at && Boolean(deal.payment_tx_hash);
    if (deal.status !== "awaiting_payment" && !recoverExpired) {
      return json({ confirmed: Boolean(deal.paid_at), reason: `status=${deal.status}` });
    }

    const txHash: string | null = deal.payment_tx_hash;
    if (!txHash) return json({ confirmed: false, reason: "no tx hash submitted" });

    const currency: "NIM" | "USDT" = deal.price_currency;
    const amount = String(deal.price_amount);
    const buyer: string = deal.buyer_wallet_address ?? "";

    const result =
      currency === "NIM"
        ? await verifyNim(txHash, amount, buyer)
        : await verifyUsdt(txHash, amount, buyer);

    if (!result.ok) {
      console.log(`[verify-payment] ${deal_id} not confirmed: ${result.reason}`);
      return json({ confirmed: false, reason: result.reason });
    }

    // The RPC claims the chain tx, writes the ledger, and advances the deal in
    // one PostgreSQL transaction.  Its unique claim key closes concurrent reuse.
    const verifiedBuyer = result.from ?? buyer;
    const { data: confirmed, error: rpcErr } = await supabase.rpc(
      "claim_and_confirm_deal_payment",
      {
        p_deal_id: deal_id,
        p_buyer: verifiedBuyer,
        p_tx_hash: txHash,
        p_network: currency === "NIM" ? "nimiq" : "evm",
        p_from_addr: verifiedBuyer,
        p_to_addr: currency === "NIM" ? NIM_CUSTODY : EVM_CUSTODY,
        p_block_height: result.blockHeight ?? null,
      },
    );
    if (rpcErr) throw rpcErr;
    if (!confirmed) throw new Error("Payment confirmation was not committed");

    console.log(`[verify-payment] ${deal_id} confirmed (${amount} ${currency})`);
    return json({ confirmed: true });
  } catch (err) {
    console.error("[verify-payment] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// Cron (shared CRON_SECRET) or any signed-in user (wallet JWT). This function
// never trusts the caller's claims — it re-verifies the payment on-chain — so
// auth here is purely abuse prevention. verify_jwt is off because the new
// API-key gateway rejects both our cron's key and the wallet JWTs.
async function isAuthorized(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (CRON_SECRET && token === CRON_SECRET) return true;
  if (JWT_SECRET_RAW) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET_RAW));
      return typeof payload.wallet_addr === "string";
    } catch {
      // not a valid wallet JWT
    }
  }
  return false;
}

// ── USDT (Polygon) ───────────────────────────────────────────────────────────
async function verifyUsdt(
  txHash: string,
  amount: string,
  buyer: string,
): Promise<{ ok: boolean; reason?: string; from?: string; blockHeight?: number }> {
  const receipt = await evmRpc("eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { ok: false, reason: "tx not mined yet" };
  if (receipt.status !== "0x1") return { ok: false, reason: "tx reverted" };

  const expected = decimalToUnits(amount, USDT_DECIMALS);
  if (expected === null) {
    return { ok: false, reason: `deal amount is not representable with ${USDT_DECIMALS} USDT decimals` };
  }

  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== USDT_CONTRACT) continue;
    if ((log.topics?.[0] ?? "").toLowerCase() !== TRANSFER_SIG) continue;
    const to = topicToAddress(log.topics[2]);
    if (to !== EVM_CUSTODY) continue;
    const value = BigInt(log.data);
    if (value !== expected) continue;

    const from = topicToAddress(log.topics[1]);
    // If we already know the buyer, bind to it; otherwise accept the sender.
    if (buyer && !addressesEqual(from, buyer)) {
      return { ok: false, reason: "sender mismatch" };
    }
    return {
      ok: true,
      from,
      blockHeight: receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : undefined,
    };
  }
  return { ok: false, reason: "no matching USDT transfer to custody" };
}

// ── NIM ──────────────────────────────────────────────────────────────────────
async function verifyNim(
  txHash: string,
  amount: string,
  buyer: string,
): Promise<{ ok: boolean; reason?: string; from?: string; blockHeight?: number }> {
  // Nimiq PoS deliberately excludes mempool entries from getTransactionByHash;
  // executionResult=true is the explicit proof that the included tx succeeded.
  const executed = extractData(await nimiqRpc("getTransactionByHash", [txHash]));
  if (!executed) return { ok: false, reason: "tx not found yet" };
  const tx = executed.transaction ?? executed;
  const executionResult = executed.executionResult ?? tx.executionResult;
  if (executionResult !== true) {
    return { ok: false, reason: "transaction is not confirmed and successfully executed" };
  }

  const to = (tx.to ?? tx.toAddress ?? tx.recipient ?? "").replace(/\s+/g, "").toUpperCase();
  if (to !== NIM_CUSTODY) return { ok: false, reason: "recipient is not custody" };

  const expectedLunas = decimalToUnits(amount, 5);
  if (expectedLunas === null) {
    return { ok: false, reason: "deal amount is not representable with 5 NIM decimals" };
  }
  const value = BigInt(tx.value ?? 0);
  if (value !== expectedLunas) return { ok: false, reason: "amount mismatch" };

  const from = tx.from ?? tx.fromAddress ?? "";
  if (!from) return { ok: false, reason: "transaction sender is missing" };
  if (buyer && !addressesEqual(from, buyer)) {
    return { ok: false, reason: "sender mismatch" };
  }
  return {
    ok: true,
    from,
    blockHeight:
      tx.blockNumber ?? tx.block_number ?? tx.blockHeight
      ?? executed.blockNumber ?? executed.block_number ?? executed.blockHeight
      ?? undefined,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
async function evmRpc(method: string, params: unknown[]) {
  const res = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`EVM RPC: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function nimiqRpc(method: string, params: unknown[] = []) {
  const res = await fetch(NIM_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

function extractData(resp: any): any {
  if (resp?.result?.data !== undefined) return resp.result.data;
  if (resp?.result !== undefined) return resp.result;
  return null;
}

// 32-byte topic → lowercase 0x address (last 20 bytes).
function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

function addressesEqual(a: string, b: string): boolean {
  return a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();
}

// Decimal string ("20", "20.5") → integer base units, no float error.
function decimalToUnits(amount: string, decimals: number): bigint | null {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(amount.trim());
  if (!match) return null;

  const whole = match[1];
  const frac = match[2] ?? "";
  // Extra zeroes are harmless (Postgres numeric values may be padded), but a
  // non-zero discarded digit would make an underpayment compare as exact.
  if (/[1-9]/.test(frac.slice(decimals))) return null;

  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  return units > 0n ? units : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
