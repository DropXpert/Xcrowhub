// ProofHold — On-chain watcher Edge Function (Phase 5)
//
// Polls the Nimiq RPC for new incoming transactions to the custody address,
// matches them to awaiting_payment deals by an exact submitted transaction hash
// (or an exact Nimiq deal-ID memo), then atomically claims and confirms them.
//
// Invoked every minute via pg_cron (migration 0007) or Supabase scheduled function.
//
// Required secrets (supabase secrets set):
//   NIM_CUSTODY_ADDR   – public custody address (NQ95 TCM8...)
//   NIM_RPC            – JSON-RPC endpoint (default: https://rpc.nimiqwatch.com)
//   WATCHER_SECRET     – shared secret so only pg_cron can call this
//   CRON_SECRET        – uniform cron credential (verify_jwt is off)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NIM_CUSTODY_RAW = Deno.env.get("NIM_CUSTODY_ADDR") ?? "";
const NIM_RPC = Deno.env.get("NIM_RPC") ?? "https://rpc.nimiqwatch.com";
const WATCHER_SECRET = Deno.env.get("WATCHER_SECRET") ?? "";
// Uniform cron credential (Bearer). verify_jwt is off — the new API-key gateway
// rejects legacy service-role JWTs, so the pg_cron tick authorizes here instead.
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// Normalize address for comparison (strip spaces, uppercase)
const NIM_CUSTODY = NIM_CUSTODY_RAW.replace(/\s+/g, "").toUpperCase();

// EVM (Polygon USDT) config for the EVM backstop watcher.
const EVM_RPC = Deno.env.get("EVM_RPC") ?? "https://polygon-rpc.com";
const EVM_CUSTODY = (Deno.env.get("EVM_CUSTODY_ADDR") ?? "").toLowerCase();
const USDT_CONTRACT = (Deno.env.get("USDT_CONTRACT") ?? "0xc2132D05D31c914a87C6611C10748AEb04B58e8F").toLowerCase();
const USDT_DECIMALS = Number(Deno.env.get("USDT_DECIMALS") ?? "6");
// Free RPC tiers cap eth_getLogs to a small block range (Alchemy free = 10), so
// scan in chunks of this span. Raise EVM_GETLOGS_MAX_SPAN on a paid plan.
const EVM_GETLOGS_MAX_SPAN = Math.max(1, Number(Deno.env.get("EVM_GETLOGS_MAX_SPAN") ?? "10"));
// Cap blocks scanned per tick so a long-idle watcher catches up over several
// ticks instead of issuing thousands of getLogs at once.
const EVM_MAX_BLOCKS_PER_TICK = Math.max(
  EVM_GETLOGS_MAX_SPAN,
  Number(Deno.env.get("EVM_MAX_BLOCKS_PER_TICK") ?? "200"),
);
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Auth: accept the cron secret, the watcher secret, or the service role bearer.
  const auth = req.headers.get("Authorization") ?? "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const isServiceRole = bearerToken === SUPABASE_SERVICE_ROLE_KEY;
  const isWatcher = WATCHER_SECRET && bearerToken === WATCHER_SECRET;
  const isCron = CRON_SECRET && bearerToken === CRON_SECRET;

  if (!isServiceRole && !isWatcher && !isCron) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Which chain to scan this tick (cron sends {"network":"nimiq"|"evm"}).
  let network = "nimiq";
  try {
    const body = await req.json();
    if (body?.network) network = String(body.network).toLowerCase();
  } catch {
    // no body → default nimiq
  }

  const results: Record<string, unknown> = { network };

  try {
    if (network === "evm") {
      if (!EVM_CUSTODY) {
        console.warn("[watcher] EVM_CUSTODY_ADDR not set — skipping EVM watch");
        results.evm = { skipped: true, reason: "EVM_CUSTODY_ADDR not configured" };
      } else {
        results.evm = await watchEvm();
      }
    } else {
      if (!NIM_CUSTODY) {
        console.warn("[watcher] NIM_CUSTODY_ADDR not set — skipping Nimiq watch");
        results.nimiq = { skipped: true, reason: "NIM_CUSTODY_ADDR not configured" };
      } else {
        results.nimiq = await watchNimiq();
      }
    }
  } catch (err: any) {
    console.error("[watcher] error:", err);
    results.error = err.message;
  }

  return json({ ok: true, ...results, ts: new Date().toISOString() });
});

// ── Nimiq watcher ──────────────────────────────────────────────────────────

async function watchNimiq() {
  // 1. Load cursor
  const { data: cursorRow } = await supabase
    .from("watcher_cursors")
    .select("last_block")
    .eq("network", "nimiq")
    .single();

  // PostgREST serializes bigint as a string, so coerce — otherwise `fromBlock + 1`
  // would concatenate ("89177700" + 1 = "891777001") and break the block range.
  const fromBlock = Number(cursorRow?.last_block ?? 0);

  // 2. Get current block number
  const blockResp = await nimiqRpc("getBlockNumber");
  const currentBlock: number = extractData(blockResp) ?? 0;

  if (currentBlock <= fromBlock) {
    return { fromBlock, currentBlock, processed: 0, skipped: "no new blocks" };
  }

  // 3. Get recent transactions to the custody address
  // Nimiq Albatross RPC: getTransactionsByAddress(address, max)
  const txResp = await nimiqRpc("getTransactionsByAddress", [
    NIM_CUSTODY_RAW.trim(), // use original spaced format for RPC
    100,
    null, // start_at hash (null = most recent); Albatross requires this 3rd arg
  ]);

  const rawTxs = extractData(txResp);
  if (!Array.isArray(rawTxs)) {
    console.warn("[watcher/NIM] getTransactionsByAddress returned:", JSON.stringify(txResp).slice(0, 200));
    return { fromBlock, currentBlock, processed: 0, warning: "unexpected RPC response" };
  }

  // 4. Filter: only NEW incoming transactions (block > cursor, to = custody)
  const newIncoming = rawTxs.filter((tx: any) => {
    const blockNum: number = tx.blockNumber ?? tx.block_number ?? tx.blockHeight ?? 0;
    const toAddr: string = (tx.to ?? tx.toAddress ?? "").replace(/\s+/g, "").toUpperCase();
    return blockNum > fromBlock && toAddr === NIM_CUSTODY;
  });

  console.log(`[watcher/NIM] blocks ${fromBlock}→${currentBlock}, ${newIncoming.length}/${rawTxs.length} new incoming txs`);

  let processed = 0;
  for (const tx of newIncoming) {
    const matched = await processTx(tx);
    if (matched) processed++;
  }

  // 5. Update cursor
  await supabase
    .from("watcher_cursors")
    .update({ last_block: currentBlock, last_checked_at: new Date().toISOString() })
    .eq("network", "nimiq");

  return { fromBlock, currentBlock, found: newIncoming.length, processed };
}

async function processTx(tx: any): Promise<boolean> {
  const txHash: string = tx.hash ?? tx.transactionHash ?? "";
  const fromAddr: string = tx.from ?? tx.fromAddress ?? "";
  const valueLunas = BigInt(tx.value ?? 0);
  const dataHex: string = tx.recipientData ?? tx.data ?? tx.extraData ?? "";

  console.log(`[watcher/NIM] processing tx ${txHash.slice(0, 12)}… value=${valueLunas} from=${fromAddr.slice(0, 12)}`);
  if (tx.executionResult !== true) {
    console.log(`[watcher/NIM] tx ${txHash.slice(0, 12)} was not successfully executed, skipping`);
    return false;
  }
  if (!txHash || !fromAddr) {
    console.log("[watcher/NIM] transaction is missing a hash or sender, skipping");
    return false;
  }

  // Try to extract deal ID from tx data (hex-encoded UTF-8 memo)
  let dealId: string | null = null;
  if (dataHex) {
    const decoded = hexToUtf8(dataHex);
    const match = decoded.match(/PH-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    if (match) dealId = match[0];
  }

  let deal: any = null;

  if (dealId) {
    // An exact deal-ID memo is authoritative, but still has to agree with the
    // deal's currency, amount, buyer, and any previously submitted hash.
    const { data, error } = await supabase
      .from("deals")
      .select("id, price_amount, price_currency, status, buyer_wallet_address, payment_tx_hash")
      .eq("id", dealId)
      .eq("status", "awaiting_payment")
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const hashAgrees = !data.payment_tx_hash || normalizeHash(data.payment_tx_hash) === normalizeHash(txHash);
      if (
        data.price_currency !== "NIM"
        || decimalToUnits(String(data.price_amount), 5) !== valueLunas
        || !hashAgrees
        || (data.buyer_wallet_address && !addressesEqual(data.buyer_wallet_address, fromAddr))
      ) {
        console.log(`[watcher/NIM] memo deal ${dealId} does not match tx ${txHash.slice(0, 12)}, skipping`);
        return false;
      }
      deal = data;
    }
  }

  if (!deal) {
    // Never guess by amount: require exactly one deal that submitted this hash.
    const { data: candidates, error } = await supabase
      .from("deals")
      .select("id, price_amount, price_currency, status, buyer_wallet_address, payment_tx_hash")
      .eq("status", "awaiting_payment")
      .eq("price_currency", "NIM")
      .ilike("payment_tx_hash", txHash)
      .limit(3);
    if (error) throw error;

    const exactCandidates = (candidates ?? []).filter(
      (candidate: any) => normalizeHash(candidate.payment_tx_hash) === normalizeHash(txHash),
    );
    if (exactCandidates.length !== 1) {
      console.log(
        `[watcher/NIM] submitted hash ${txHash.slice(0, 12)} has ${exactCandidates.length} matching deals; skipping`,
      );
      return false;
    }
    deal = exactCandidates[0];

    if (
      decimalToUnits(String(deal.price_amount), 5) !== valueLunas
      || (deal.buyer_wallet_address && !addressesEqual(deal.buyer_wallet_address, fromAddr))
    ) {
      console.log(`[watcher/NIM] submitted deal ${deal.id} does not match tx amount/sender, skipping`);
      return false;
    }
  }

  if (!deal) {
    console.log(`[watcher/NIM] no matching deal for tx ${txHash.slice(0, 12)} (${valueLunas} lunas)`);
    return false;
  }

  console.log(`[watcher/NIM] matched deal ${deal.id} ← tx ${txHash.slice(0, 12)}`);

  // Claim + custody-ledger insert + status change are one DB transaction.
  const { data: confirmed, error: rpcErr } = await supabase.rpc("claim_and_confirm_deal_payment", {
    p_deal_id: deal.id,
    p_buyer: fromAddr,
    p_tx_hash: txHash,
    p_network: "nimiq",
    p_from_addr: fromAddr,
    p_to_addr: NIM_CUSTODY_RAW.trim(),
    p_block_height: tx.blockNumber ?? tx.block_number ?? tx.blockHeight ?? null,
  });

  if (rpcErr || !confirmed) {
    console.error(
      `[watcher/NIM] atomic confirmation failed for ${deal.id}:`,
      rpcErr?.message ?? "not committed",
    );
    return false;
  }

  console.log(`[watcher/NIM] deal ${deal.id} → funds_held ✓`);
  return true;
}

// ── EVM watcher (Polygon USDT) ───────────────────────────────────────────────
// ERC-20 transfers cannot carry a deal-ID memo. The watcher therefore only
// accepts a transaction hash that one (and only one) pending deal submitted.

async function watchEvm() {
  const { data: cursorRow } = await supabase
    .from("watcher_cursors")
    .select("last_block")
    .eq("network", "evm")
    .single();

  // PostgREST serializes bigint as a string, so coerce — otherwise `fromBlock + 1`
  // would concatenate ("89177700" + 1 = "891777001") and break the block range.
  const fromBlock = Number(cursorRow?.last_block ?? 0);
  const currentBlock = parseInt(await evmRpc("eth_blockNumber", []), 16);
  if (!Number.isFinite(currentBlock) || currentBlock <= fromBlock) {
    return { fromBlock, currentBlock, processed: 0, skipped: "no new blocks" };
  }

  // Resume at cursor+1; on an unseeded cursor look back a bounded window. Cap the
  // span per tick so a long-idle watcher catches up over several ticks.
  const start = fromBlock > 0 ? fromBlock + 1 : Math.max(0, currentBlock - EVM_MAX_BLOCKS_PER_TICK);
  const end = Math.min(currentBlock, start + EVM_MAX_BLOCKS_PER_TICK - 1);
  const toTopic = "0x" + EVM_CUSTODY.replace(/^0x/, "").padStart(64, "0");

  // Free RPC tiers cap getLogs to a small range, so scan in chunks of ≤MAX_SPAN.
  let found = 0;
  let processed = 0;
  for (let lo = start; lo <= end; lo += EVM_GETLOGS_MAX_SPAN) {
    const hi = Math.min(end, lo + EVM_GETLOGS_MAX_SPAN - 1);
    const logs = await evmRpc("eth_getLogs", [
      {
        address: USDT_CONTRACT,
        topics: [TRANSFER_SIG, null, toTopic],
        fromBlock: "0x" + lo.toString(16),
        toBlock: "0x" + hi.toString(16),
      },
    ]);
    for (const log of logs ?? []) {
      found++;
      const matched = await processEvmLog(log);
      if (matched) processed++;
    }
  }

  await supabase
    .from("watcher_cursors")
    .update({ last_block: end, last_checked_at: new Date().toISOString() })
    .eq("network", "evm");

  return { fromBlock, scannedTo: end, currentBlock, found, processed };
}

async function processEvmLog(log: any): Promise<boolean> {
  const txHash: string = log.transactionHash;
  if (!txHash) return false;

  const value = BigInt(log.data);
  const from = "0x" + (log.topics?.[1] ?? "").slice(-40).toLowerCase();

  const { data: candidates, error } = await supabase
    .from("deals")
    .select("id, price_amount, price_currency, status, buyer_wallet_address, payment_tx_hash")
    .eq("status", "awaiting_payment")
    .eq("price_currency", "USDT")
    .ilike("payment_tx_hash", txHash)
    .limit(3);
  if (error) throw error;

  const exactCandidates = (candidates ?? []).filter(
    (candidate: any) => normalizeHash(candidate.payment_tx_hash) === normalizeHash(txHash),
  );
  if (exactCandidates.length !== 1) {
    console.log(
      `[watcher/EVM] submitted hash ${txHash.slice(0, 12)} has ${exactCandidates.length} matching deals; skipping`,
    );
    return false;
  }
  const deal = exactCandidates[0];

  if (
    decimalToUnits(String(deal.price_amount), USDT_DECIMALS) !== value
    || (deal.buyer_wallet_address && !addressesEqual(deal.buyer_wallet_address, from))
  ) {
    console.log(`[watcher/EVM] submitted deal ${deal.id} does not match tx amount/sender, skipping`);
    return false;
  }

  const { data: confirmed, error: rpcErr } = await supabase.rpc("claim_and_confirm_deal_payment", {
    p_deal_id: deal.id,
    p_buyer: from,
    p_tx_hash: txHash,
    p_network: "evm",
    p_from_addr: from,
    p_to_addr: EVM_CUSTODY,
    p_block_height: parseInt(log.blockNumber, 16),
  });
  if (rpcErr || !confirmed) {
    console.error(
      `[watcher/EVM] atomic confirmation failed for ${deal.id}:`,
      rpcErr?.message ?? "not committed",
    );
    return false;
  }

  console.log(`[watcher/EVM] deal ${deal.id} → funds_held ✓`);
  return true;
}

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

function normalizeHash(hash: string | null | undefined): string {
  return (hash ?? "").trim().toLowerCase();
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
  if (/[1-9]/.test(frac.slice(decimals))) return null;

  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  return units > 0n ? units : null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function nimiqRpc(method: string, params: unknown[] = []) {
  const res = await fetch(NIM_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

// nimiqwatch wraps responses: { result: { data: value } }
// standard JSON-RPC: { result: value }
function extractData(resp: any): any {
  if (resp?.result?.data !== undefined) return resp.result.data;
  if (resp?.result !== undefined) return resp.result;
  return null;
}

function hexToUtf8(hex: string): string {
  try {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(
      clean.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
