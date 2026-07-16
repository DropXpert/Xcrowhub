import { Link, Navigate, useParams } from "react-router-dom";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptSummary } from "@/components/ReceiptSummary";
import { PaymentBox } from "@/components/PaymentBox";
import { StatusPill } from "@/components/StatusPill";
import { WhatHappensNext } from "@/components/WhatHappensNext";
import { StarRating } from "@/components/StarRating";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { dealStatusPath } from "@/lib/dealLinks";
import { FileQuestion } from "lucide-react";

export default function PayDeal() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const getFeedbacksForAddress = useDealStore((s) => s.getFeedbacksForAddress);
  const sellerFeedbacks = deal ? getFeedbacksForAddress(deal.sellerWalletAddress) : [];
  const sellerAvg = sellerFeedbacks.length
    ? sellerFeedbacks.reduce((s, f) => s + f.rating, 0) / sellerFeedbacks.length
    : 0;

  if (!deal) {
    if (loading) return <DealLoader title="Opening payment" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Deal" title="Pay" />
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Deal not found"
          description="The link may be wrong or the deal may have been removed."
          action={
            <Link to="/" className="btn-secondary">
              Back to home
            </Link>
          }
        />
      </div>
    );
  }

  // Nothing to pay here once the deal has left awaiting_payment (already paid,
  // in progress, or closed). Send the buyer straight to the timeline rather
  // than a dead-end "preview" with no action.
  if (deal.status !== "awaiting_payment") {
    return <Navigate to={dealStatusPath(deal.id)} replace />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Buyer view"
        title="Pay protected deal"
        right={<StatusPill status={deal.status} />}
      />

      <WhatHappensNext status={deal.status} />

      <div className="card flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="space-y-0.5">
          <p className="field-label">Seller reputation</p>
          {sellerFeedbacks.length > 0 ? (
            <div className="flex items-center gap-2">
              <StarRating value={Math.round(sellerAvg)} size="sm" />
              <span className="text-[13px] font-medium text-ink">
                {sellerAvg.toFixed(1)}
              </span>
              <span className="text-[12.5px] text-muted">
                ({sellerFeedbacks.length} review{sellerFeedbacks.length > 1 ? "s" : ""})
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-muted">No reviews yet</p>
          )}
        </div>
        <Link
          to={`/profile/${encodeURIComponent(deal.sellerWalletAddress)}`}
          className="pill border-edge bg-bg text-muted transition hover:text-ink text-[12.5px]"
        >
          View profile
        </Link>
      </div>

      <ReceiptSummary deal={deal} />

      <PaymentBox deal={deal} />

      <Link to={`/deal/${deal.id}/status`} className="btn-ghost w-full">
        View timeline
      </Link>
    </div>
  );
}
