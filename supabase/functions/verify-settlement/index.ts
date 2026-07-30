// Verifies a Polygon SettlementExecuted event before committing a terminal
// smart-contract deal state. The client only submits a tx hash; all economic
// values are re-derived from the event and checked against the locked deal.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.2.3";
import {
  AbiCoder,
  Interface,
  keccak256,
  toUtf8Bytes,
} from "https://esm.sh/ethers@6.16.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET") ?? "";
const EVM_RPC = Deno.env.get("EVM_RPC") ?? "https://polygon.drpc.org";
const USDT_DECIMALS = Number(Deno.env.get("USDT_DECIMALS") ?? "6");
const CURRENT_ESCROW = (
  Deno.env.get("USDT_ESCROW_CONTRACT_ADDR") ?? ""
).toLowerCase();

const ESCROW_INTERFACE = new Interface([
  "event SettlementExecuted(bytes32 indexed dealId,address indexed buyer,address indexed seller,uint256 buyerAmount,uint256 sellerAmount,uint256 feeAmount,address executor)",
]);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
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
    if (
      deal.price_currency !== "USDT" ||
      deal.escrow_model !== "smart_contract"
    ) {
      return json({ error: "Deal does not use USDT smart-contract escrow" }, 400);
    }
    if (
      ["released", "refunded", "partially_refunded"].includes(deal.status) &&
      deal.contract_settlement_tx_hash
    ) {
      return json({ confirmed: true, idempotent: true });
    }

    const txHash = String(deal.contract_settlement_tx_hash ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
      return json({ confirmed: false, reason: "no settlement tx submitted" });
    }

    const receipt = await evmRpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt) return json({ confirmed: false, reason: "tx not mined yet" });
    if (receipt.status !== "0x1") {
      return json({ confirmed: false, reason: "tx reverted" });
    }

    const contractAddress = String(
      deal.escrow_contract_address || CURRENT_ESCROW
    ).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(contractAddress)) {
      throw new Error("Escrow contract address is not configured");
    }

    const buyerAddress = String(deal.buyer_wallet_address ?? "");
    if (!buyerAddress) throw new Error("Buyer wallet is missing");
    const expectedDealKey = buyerBoundEscrowKey(
      deal_id,
      buyerAddress,
    ).toLowerCase();
    const expectedAmount = decimalToUnits(
      String(deal.price_amount),
      USDT_DECIMALS
    );
    if (expectedAmount === null) throw new Error("Invalid deal amount");

    let verified:
      | {
          buyerAmount: bigint;
          sellerAmount: bigint;
          feeAmount: bigint;
        }
      | undefined;

    for (const log of receipt.logs ?? []) {
      if ((log.address ?? "").toLowerCase() !== contractAddress) continue;
      let parsed;
      try {
        parsed = ESCROW_INTERFACE.parseLog({
          topics: log.topics,
          data: log.data,
        });
      } catch {
        continue;
      }
      if (!parsed || parsed.name !== "SettlementExecuted") continue;
      if (String(parsed.args.dealId).toLowerCase() !== expectedDealKey) continue;
      if (
        !addressesEqual(
          String(parsed.args.buyer),
          String(deal.buyer_wallet_address)
        ) ||
        !addressesEqual(
          String(parsed.args.seller),
          String(deal.seller_wallet_address)
        )
      ) continue;

      const buyerAmount = BigInt(parsed.args.buyerAmount);
      const sellerAmount = BigInt(parsed.args.sellerAmount);
      const feeAmount = BigInt(parsed.args.feeAmount);
      if (buyerAmount + sellerAmount !== expectedAmount) continue;

      const expectedFee =
        buyerAmount === 0n && sellerAmount === expectedAmount
          ? (sellerAmount * BigInt(Number(deal.fee_bps ?? 0))) / 10_000n
          : 0n;
      if (feeAmount !== expectedFee) continue;
      verified = { buyerAmount, sellerAmount, feeAmount };
      break;
    }

    if (!verified) {
      return json({
        confirmed: false,
        reason: "no matching SettlementExecuted event",
      });
    }

    const { data: confirmed, error: rpcError } = await supabase.rpc(
      "confirm_contract_settlement",
      {
        p_deal_id: deal_id,
        p_tx_hash: txHash,
        p_buyer_amount: unitsToDecimal(
          verified.buyerAmount,
          USDT_DECIMALS
        ),
        p_seller_amount: unitsToDecimal(
          verified.sellerAmount,
          USDT_DECIMALS
        ),
        p_fee_amount: unitsToDecimal(verified.feeAmount, USDT_DECIMALS),
        p_contract_address: contractAddress,
        p_block_height: receipt.blockNumber
          ? parseInt(receipt.blockNumber, 16)
          : null,
      }
    );
    if (rpcError) throw rpcError;
    if (!confirmed) throw new Error("Settlement confirmation was not committed");
    return json({ confirmed: true });
  } catch (error) {
    console.error("[verify-settlement] error", error);
    return json({ error: (error as Error).message }, 500);
  }
});

async function isAuthorized(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return false;
  if (CRON_SECRET && token === CRON_SECRET) return true;
  if (!JWT_SECRET_RAW) return false;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET_RAW)
    );
    return typeof payload.wallet_addr === "string";
  } catch {
    return false;
  }
}

async function evmRpc(method: string, params: unknown[]) {
  const response = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`EVM RPC: ${JSON.stringify(body.error)}`);
  return body.result;
}

function addressesEqual(a: string, b: string): boolean {
  return a.replace(/\s+/g, "").toLowerCase() ===
    b.replace(/\s+/g, "").toLowerCase();
}

function buyerBoundEscrowKey(dealId: string, buyer: string): string {
  const reference = keccak256(toUtf8Bytes(dealId));
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address"],
      [reference, buyer],
    ),
  );
}

function decimalToUnits(amount: string, decimals: number): bigint | null {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(amount.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (/[1-9]/.test(fraction.slice(decimals))) return null;
  return BigInt(match[1]) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function unitsToDecimal(value: bigint, decimals: number): string {
  const padded = value.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
