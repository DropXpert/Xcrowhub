import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ShieldAlert, FileQuestion } from "lucide-react";
import { SkeletonDots } from "@/components/LoadingStates";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptSummary } from "@/components/ReceiptSummary";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { AlertDialog } from "@/components/AlertDialog";
import { isCustodyAddress } from "@/lib/config";

export default function BuyerConfirm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const confirmReceipt = useDealStore((s) => s.confirmReceipt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const confirmLock = useRef(false);

  if (!deal) {
    if (loading) return <DealLoader title="Opening confirmation" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Buyer" title="Confirm" />
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

  // Fail-closed: a misconfigured deal whose seller wallet is the platform
  // custody address would release funds back into custody instead of to a real
  // seller. Block confirmation entirely rather than lose the buyer's money.
  const sellerIsCustody = isCustodyAddress(
    deal.priceCurrency,
    deal.sellerWalletAddress
  );

  async function confirm() {
    if (confirmLock.current) return;
    if (sellerIsCustody) {
      setDialogOpen(false);
      setError(
        "This deal's seller wallet is misconfigured (it points to XcrowHub custody). Releasing would not reach the seller. Contact support before confirming."
      );
      return;
    }
    confirmLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await Promise.resolve(confirmReceipt(deal!.id));
      navigate(`/deal/${deal!.id}/status`);
    } catch (err: any) {
      setError(err.message ?? "Could not confirm receipt.");
      setBusy(false);
      confirmLock.current = false;
    }
  }

  const canConfirm = deal.status === "delivered_by_seller" && !sellerIsCustody;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Buyer view"
        title="Confirm receipt"
        right={<StatusPill status={deal.status} />}
      />

      <ReceiptSummary deal={deal} />

      {deal.deliveryNote ? (
        <section className="card space-y-2 px-5 py-4">
          <p className="field-label">Seller's delivery note</p>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
            {deal.deliveryNote}
          </p>
        </section>
      ) : null}

      {canConfirm ? (
        <section className="card space-y-4 px-5 py-5">
          <p className="text-[14px] leading-relaxed text-ink">
            Only confirm if you received what was promised. Funds go to the seller immediately.
          </p>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? (
                <SkeletonDots label="Confirming delivery" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {busy ? "Confirming..." : "Confirm & release funds"}
            </button>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <Link
              to={`/deal/${deal.id}/query`}
              className="btn-secondary w-full"
            >
              <ShieldAlert className="h-4 w-4" />
              Raise a dispute
            </Link>
          </div>
        </section>
      ) : sellerIsCustody && deal.status === "delivered_by_seller" ? (
        <section className="card space-y-2 border-danger/30 px-5 py-4">
          <div className="flex items-center gap-2 text-danger">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <p className="text-[14px] font-semibold">Don't confirm this deal</p>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            The seller wallet on this deal is the XcrowHub custody address, so
            releasing funds would not reach a real seller. This is a
            configuration error — please contact support or raise a dispute
            instead of confirming.
          </p>
          <Link to={`/deal/${deal.id}/query`} className="btn-secondary w-full">
            <ShieldAlert className="h-4 w-4" />
            Raise a dispute
          </Link>
        </section>
      ) : (
        <section className="card px-5 py-4 text-[13px] text-muted">
          Not waiting on confirmation right now.
        </section>
      )}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Release funds to seller?"
        description="Confirm you received what was promised. Funds release immediately and the deal closes."
        actionLabel="Release funds"
        cancelLabel="Cancel"
        busy={busy}
        onAction={confirm}
      />
    </div>
  );
}
