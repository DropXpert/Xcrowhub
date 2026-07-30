import { useCallback, useEffect, useState } from "react";
import { FileSignature, RefreshCw, ShieldCheck } from "lucide-react";
import type { Deal } from "@/types/deal";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import {
  isSmartUsdtDeal,
  refundUsdtEscrow,
  signAndSettleUsdtEscrow,
  type SettlementProposal,
} from "@/lib/usdtEscrow";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { normalizeWalletAddress } from "@/lib/config";
import { SkeletonDots } from "@/components/LoadingStates";

function mapProposal(row: any): SettlementProposal {
  return {
    dealId: row.deal_id,
    decision: row.decision,
    buyerAmount: String(row.buyer_amount),
    sellerAmount: String(row.seller_amount),
    nonce: Number(row.nonce),
    deadline: row.deadline,
    arbitratorSignature: row.arbitrator_signature || undefined,
    status: row.status,
    settlementTxHash: row.settlement_tx_hash || undefined,
  };
}

export function ContractSettlementPanel({ deal }: { deal: Deal }) {
  const session = useAuthStore((state) => state.session);
  const submitContractSettlement = useDealStore(
    (state) => state.submitContractSettlement
  );
  const [proposal, setProposal] = useState<SettlementProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfiguredForClient()) return;
    setLoading(true);
    const { data, error } = await getSupabaseClient()
      .from("settlement_proposals")
      .select("*")
      .eq("deal_id", deal.id)
      .maybeSingle();
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setProposal(data ? mapProposal(data) : null);
  }, [deal.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const address = normalizeWalletAddress(session?.address ?? "");
  const seller =
    address === normalizeWalletAddress(deal.sellerWalletAddress);
  const participant =
    address === normalizeWalletAddress(deal.buyerWalletAddress ?? "") ||
    seller;

  if (!isSmartUsdtDeal(deal)) return null;

  async function refundBuyer() {
    if (!seller || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!deal.buyerWalletAddress) {
        throw new Error("The buyer wallet is missing from this deal.");
      }
      const txHash = await refundUsdtEscrow(
        deal.id,
        deal.buyerWalletAddress,
        deal.escrowContractAddress
      );
      await submitContractSettlement(deal.id, txHash);
      setMessage("Refund submitted to Polygon. Confirmation is being verified.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not refund the buyer."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!proposal) {
    if (
      !seller ||
      !["funds_held", "delivered_by_seller"].includes(deal.status)
    ) {
      return null;
    }
    return (
      <section className="card space-y-3 px-5 py-5">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">
            Voluntary contract refund
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            As the seller, you can return the full locked USDT amount directly
            to the buyer. This action is irreversible.
          </p>
        </div>
        <button
          type="button"
          onClick={refundBuyer}
          disabled={busy}
          className="btn-secondary w-full"
        >
          {busy ? (
            <SkeletonDots label="Refunding buyer" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {busy ? "Opening wallet..." : "Refund buyer from contract"}
        </button>
        {message ? (
          <p className="text-[12.5px] text-muted" role="status">{message}</p>
        ) : null}
      </section>
    );
  }

  const ready = proposal.status === "ready" && proposal.arbitratorSignature;

  async function execute() {
    if (!participant || !ready || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!deal.buyerWalletAddress) {
        throw new Error("The buyer wallet is missing from this deal.");
      }
      const txHash = await signAndSettleUsdtEscrow(
        proposal!,
        deal.buyerWalletAddress,
        deal.escrowContractAddress
      );
      await submitContractSettlement(deal.id, txHash);
      setMessage("Settlement submitted to Polygon. Confirmation is being verified.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not execute settlement."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-jade/10 text-jade">
          <FileSignature className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-[15px] font-semibold text-ink">
            On-chain settlement
          </h3>
          <p className="text-[13px] leading-relaxed text-muted">
            The contract will send {proposal.buyerAmount} USDT to the buyer and{" "}
            {proposal.sellerAmount} USDT to the seller. XcrowHub cannot execute
            this alone; one deal participant must approve the same outcome.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-edge bg-bg p-3">
        <div>
          <p className="field-label">Buyer</p>
          <p className="mt-1 font-semibold tabular-nums text-ink">
            {proposal.buyerAmount} USDT
          </p>
        </div>
        <div>
          <p className="field-label">Seller</p>
          <p className="mt-1 font-semibold tabular-nums text-ink">
            {proposal.sellerAmount} USDT
          </p>
        </div>
      </div>

      {participant && ready ? (
        <button
          type="button"
          onClick={execute}
          disabled={busy}
          className="btn-primary w-full"
        >
          {busy ? (
            <SkeletonDots label="Executing settlement" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {busy ? "Opening wallet..." : "Approve and execute settlement"}
        </button>
      ) : (
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn-secondary w-full"
        >
          {loading ? (
            <SkeletonDots label="Refreshing settlement" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {loading ? "Refreshing..." : "Refresh settlement"}
        </button>
      )}

      {proposal.status === "awaiting_signature" ? (
        <p className="text-[12.5px] leading-relaxed text-muted">
          XcrowHub is preparing its arbitrator signature. The settlement cannot
          move funds until a buyer or seller also signs.
        </p>
      ) : null}
      {message ? (
        <p className="text-[12.5px] leading-relaxed text-muted" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
