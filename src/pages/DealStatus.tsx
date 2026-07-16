import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FilePlus,
  FileQuestion,
  ShieldAlert,
  XCircle,
  Trash2,
  Star,
  RefreshCw,
} from "lucide-react";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { ReceiptSummary } from "@/components/ReceiptSummary";
import { DealTimeline } from "@/components/DealTimeline";
import { WhatHappensNext } from "@/components/WhatHappensNext";
import { CountdownTimer } from "@/components/CountdownTimer";
import { EscrowProgress } from "@/components/EscrowProgress";
import { ActionPanel } from "@/components/ActionPanel";
import { AlertDialog } from "@/components/AlertDialog";
import { TxHashLink } from "@/components/TxHashLink";
import { EmptyState } from "@/components/EmptyState";
import { isTerminal } from "@/lib/stateMachine";
import { DealChat } from "@/components/DealChat";
import { DealPushCta } from "@/components/DealPushCta";
import { DisputeBanner } from "@/components/DisputeBanner";
import { DealLoader } from "@/components/PageLoader";
import { useAuthStore } from "@/store/authStore";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { resolveDealRole, type DealRole } from "@/lib/dealRole";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import type { Deal } from "@/types/deal";

export default function DealStatus() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const events = useDealStore((s) => (id ? s.getTimeline(id) : []));
  const proofs = useDealStore((s) => (id ? s.getProofs(id) : []));
  const resolveAfterDeadline = useDealStore(
    (s) => s.resolveAfterProofDeadline
  );
  const expireDeal = useDealStore((s) => s.expireDeal);
  const autoReleaseDeal = useDealStore((s) => s.autoReleaseDeal);
  const reconcileDeadlines = useDealStore((s) => s.reconcileDeadlines);
  const loadFromSupabase = useDealStore((s) => s.loadFromSupabase);
  const session = useAuthStore((s) => s.session);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const refreshLock = useRef(false);

  if (!deal) {
    if (loading) return <DealLoader title="Opening status" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Deal" title="Status" />
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Deal not found"
          action={
            <Link to="/" className="btn-secondary">
              Back to home
            </Link>
          }
        />
      </div>
    );
  }

  const role = resolveDealRole(deal, session);
  const youProofSubmitted =
    role === "seller"
      ? deal.sellerProofStatus === "submitted"
      : deal.buyerProofStatus === "submitted";

  async function updateStatus() {
    if (refreshLock.current || refreshing) return;
    const currentDeal = deal;
    if (!currentDeal) return;
    refreshLock.current = true;
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      if (isSupabaseConfiguredForClient()) {
        if (
          (currentDeal.status === "awaiting_payment" || currentDeal.status === "expired") &&
          currentDeal.paymentTxHash
        ) {
          const { error } = await getSupabaseClient().functions.invoke("verify-payment", {
            body: { deal_id: currentDeal.id },
          });
          if (error) console.warn("[XcrowHub] verify-payment refresh failed:", error);
        }
        await loadFromSupabase({ force: true });
      } else {
        reconcileDeadlines();
      }
      setRefreshMessage("Status updated.");
    } catch (err) {
      console.error("[XcrowHub] status refresh failed:", err);
      setRefreshMessage("Could not update status. Try again.");
    } finally {
      setRefreshing(false);
      refreshLock.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Deal · ${deal.id}`}
        title="Status & timeline"
        right={<StatusPill status={deal.status} />}
      />

      <DisputeBanner deal={deal} />

      {(role === "buyer" || role === "seller") && !isTerminal(deal.status) && (
        <DealPushCta />
      )}

      <EscrowProgress status={deal.status} />

      <WhatHappensNext status={deal.status} />

      <section className="card flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[13px] font-semibold text-ink">Need latest status?</p>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Use this after payment, delivery, or confirmation.
          </p>
          {refreshMessage ? (
            <p className="text-[12.5px] text-muted" role="status">
              {refreshMessage}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={updateStatus}
          disabled={refreshing}
          className="btn-secondary shrink-0 px-3 py-2 text-[13px]"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Update status
        </button>
      </section>

      {deal.status === "proof_window" ? (
        <CountdownTimer
          deadline={deal.proofDeadlineAt}
          onExpire={() => resolveAfterDeadline(deal.id)}
        />
      ) : null}

      {deal.status === "awaiting_payment" && deal.paymentDeadlineAt ? (
        <CountdownTimer
          deadline={deal.paymentDeadlineAt}
          label="Payment window"
          onExpire={() => expireDeal(deal.id)}
        />
      ) : null}

      {deal.status === "delivered_by_seller" && deal.confirmationDeadlineAt ? (
        <div className="rounded-xl border border-warning/40 bg-warning/8 px-4 py-3.5 space-y-2">
          <CountdownTimer
            deadline={deal.confirmationDeadlineAt}
            label="Auto-release timer"
            onExpire={() => autoReleaseDeal(deal.id)}
          />
          <p className="text-[12.5px] text-muted leading-relaxed">
            {role === "seller"
              ? "Funds will auto-release to you when this timer expires if the buyer does not respond."
              : "If the buyer doesn't confirm or raise a query before this timer expires, funds release automatically to the seller."}
          </p>
        </div>
      ) : null}

      <RoleActions deal={deal} role={role} youProofSubmitted={youProofSubmitted} />

      <ReceiptSummary deal={deal} />

      <section className="card space-y-4 px-5 py-5">
        <header className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">Timeline</h3>
          <span className="text-[12.5px] text-muted">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </header>
        <DealTimeline events={events} />
        {deal.paymentTxHash ? (
          <div className="border-t border-edge pt-3">
            <p className="field-label mb-1">Payment tx</p>
            <TxHashLink hash={deal.paymentTxHash} />
          </div>
        ) : null}
      </section>

      {proofs.length > 0 ? (
        <section className="card space-y-4 px-5 py-5">
          <header className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-ink">
              Submitted proofs
            </h3>
            <span className="text-[12.5px] text-muted">{proofs.length}</span>
          </header>
          <ul className="space-y-3">
            {proofs.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-edge bg-bg px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="pill border-edge bg-surface text-muted">
                    {p.submittedBy === "buyer" ? "Buyer proof" : "Seller proof"}
                  </span>
                  {p.txHash ? (
                    <TxHashLink hash={p.txHash} label="ref" />
                  ) : null}
                </div>
                <p className="mt-2 text-[13.5px] text-ink">
                  {p.explanation}
                </p>
                {p.attachmentUrls.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {p.attachmentUrls.map((url, i) => (
                      <li
                        key={i}
                        className="truncate font-mono text-[12.5px] text-muted"
                      >
                        {url}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Floating chat — only participants of an active deal */}
      {!isTerminal(deal.status) && deal.buyerWalletAddress &&
        (role === "buyer" || role === "seller") && (
        <DealChat deal={deal} viewerRole={role} />
      )}
    </div>
  );
}

function RoleActions({
  deal,
  role,
  youProofSubmitted,
}: {
  deal: Deal;
  role: DealRole;
  youProofSubmitted: boolean;
}) {
  const cancelDeal = useDealStore((s) => s.cancelDeal);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const cancelLock = useRef(false);

  async function confirmCancel() {
    if (cancelLock.current || canceling) return;
    cancelLock.current = true;
    setCanceling(true);
    try {
      await Promise.resolve(cancelDeal(deal.id));
      setConfirmingCancel(false);
    } finally {
      setCanceling(false);
      cancelLock.current = false;
    }
  }

  if (isTerminal(deal.status)) {
    const canLeaveFeedback = ["released", "refunded", "partially_refunded"].includes(deal.status);
    return (
      <div className="space-y-3">
        <section className="card flex items-center gap-3 px-5 py-4">
          {deal.status === "released" ? (
            <CheckCircle2 className="h-5 w-5 text-accent" />
          ) : (
            <XCircle className="h-5 w-5 text-muted" />
          )}
          <p className="text-[14px] text-ink">
            {deal.status === "released" &&
              "Funds were released to the seller. This deal is complete."}
            {deal.status === "refunded" &&
              "The buyer was refunded. This deal is closed."}
            {deal.status === "partially_refunded" &&
              "Funds were split between buyer and seller."}
            {deal.status === "cancelled" && "This deal was cancelled."}
            {deal.status === "expired" && "This deal expired."}
          </p>
        </section>
        {deal.status === "released" && deal.feeAmount && Number(deal.feeAmount) > 0 && (
          <section className="card space-y-2.5 px-5 py-4">
            <p className="field-label">Payout breakdown</p>
            <div className="flex items-center justify-between text-[14px] text-ink">
              <span className="text-muted">Sale price</span>
              <span className="tabular-nums">{deal.priceAmount} {deal.priceCurrency}</span>
            </div>
            <div className="flex items-center justify-between text-[14px] text-ink">
              <span className="text-muted">
                Platform fee ({(deal.feeBps ?? 0) / 100}%)
              </span>
              <span className="tabular-nums">−{deal.feeAmount} {deal.priceCurrency}</span>
            </div>
            <div className="divider-dashed" />
            <div className="flex items-center justify-between text-[15px] font-semibold text-ink">
              <span>Seller received</span>
              <span className="tabular-nums">
                {(Number(deal.priceAmount) - Number(deal.feeAmount)).toLocaleString(undefined, {
                  maximumFractionDigits: deal.priceCurrency === "NIM" ? 5 : 6,
                })}{" "}
                {deal.priceCurrency}
              </span>
            </div>
          </section>
        )}
        {canLeaveFeedback && (
          <Link
            to={`/deal/${deal.id}/feedback`}
            className="btn-secondary w-full"
          >
            <Star className="h-4 w-4" />
            Leave feedback
          </Link>
        )}
      </div>
    );
  }

  // Observers (and admins, who act via /admin) can view but not act here.
  if (role !== "buyer" && role !== "seller") {
    return (
      <ActionPanel heading="You're viewing this deal">
        <p className="text-[13px] text-muted">
          Only the buyer and seller can act on this deal.
        </p>
      </ActionPanel>
    );
  }

  // Awaiting payment
  if (deal.status === "awaiting_payment") {
    return (
      <ActionPanel
        heading={
          role === "buyer"
            ? "Pay into protected hold"
            : "Waiting for buyer to pay"
        }
        description={
          role === "buyer"
            ? "Review the deal below, then pay. Funds will be held safely."
            : "Share the payment link with your buyer. Funds will be held when they pay."
        }
      >
        {role === "buyer" ? (
          <Link
            to={`/deal/${deal.id}/pay`}
            className="btn-primary w-full"
          >
            Pay now
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link to={`/deal/${deal.id}`} className="btn-secondary w-full">
            Open share link
          </Link>
        )}
        {role === "seller" ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="btn-ghost w-full text-danger"
            >
              <Trash2 className="h-4 w-4" />
              Cancel deal
            </button>
            <AlertDialog
              open={confirmingCancel}
              onOpenChange={setConfirmingCancel}
              title="Cancel this deal?"
              description="The payment link stops working and the buyer can no longer pay. This can't be undone."
              cancelLabel="Keep deal"
              actionLabel={canceling ? "Cancelling…" : "Cancel deal"}
              onAction={confirmCancel}
              destructive
              busy={canceling}
            />
          </>
        ) : null}
      </ActionPanel>
    );
  }

  // Funds held — seller can deliver, both can raise query
  if (deal.status === "funds_held") {
    return (
      <ActionPanel
        heading={
          role === "seller"
            ? "Funds are held. Deliver the work."
            : "Funds are held. Waiting on the seller."
        }
        description={
          role === "seller"
            ? "Deliver the product or service, then mark this deal as delivered with a short note."
            : "The seller has been notified. You'll see a confirmation request when they deliver."
        }
      >
        {role === "seller" ? (
          <Link
            to={`/deal/${deal.id}/seller`}
            className="btn-primary w-full"
          >
            Mark as delivered
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
        <Link
          to={`/deal/${deal.id}/query`}
          className="btn-ghost w-full"
        >
          <ShieldAlert className="h-4 w-4" />
          Raise a query
        </Link>
      </ActionPanel>
    );
  }

  // Delivered — buyer confirms or queries
  if (deal.status === "delivered_by_seller") {
    return (
      <ActionPanel
        heading={
          role === "buyer"
            ? "Seller marked this as delivered."
            : "Awaiting buyer confirmation."
        }
        description={
          role === "buyer"
            ? "Confirm only if you received what was promised."
            : "The buyer has been notified to confirm receipt."
        }
      >
        {role === "buyer" ? (
          <Link
            to={`/deal/${deal.id}/confirm`}
            className="btn-primary w-full"
          >
            Confirm receipt
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
        <Link
          to={`/deal/${deal.id}/query`}
          className="btn-ghost w-full"
        >
          <ShieldAlert className="h-4 w-4" />
          Raise a query
        </Link>
      </ActionPanel>
    );
  }

  // Proof window
  if (deal.status === "proof_window") {
    return (
      <ActionPanel
        heading={
          youProofSubmitted
            ? "Your proof is submitted"
            : "Submit your proof"
        }
        description={
          youProofSubmitted
            ? "Waiting on the other side. If they don't submit within 24 hours, the decision favors you."
            : "Both sides have 24 hours. If only one side submits, that side wins."
        }
      >
        {!youProofSubmitted ? (
          <Link
            to={`/deal/${deal.id}/proof`}
            className="btn-primary w-full"
          >
            <FilePlus className="h-4 w-4" />
            Submit proof
          </Link>
        ) : null}
      </ActionPanel>
    );
  }

  // Under admin review
  if (deal.status === "under_admin_review") {
    return (
      <ActionPanel heading="Under admin review">
        <p className="text-[13px] text-muted">
          Both sides submitted proof, or the deadline passed without proof.
          An admin will release, refund, or split the funds.
        </p>
      </ActionPanel>
    );
  }

  return null;
}
