import { Progress, ProgressTrack } from "@/components/ui/progress";
import type { DealStatus } from "@/types/deal";

/** Position of a deal along the escrow lifecycle, plus a caption + bar tone. */
export function escrowMeta(status: DealStatus): {
  pct: number;
  caption: string;
  indicator: string;
} {
  switch (status) {
    case "draft":
    case "awaiting_payment":
      return { pct: 12, caption: "Awaiting payment", indicator: "bg-accent" };
    case "funds_held":
      return { pct: 40, caption: "Funds in escrow", indicator: "bg-accent" };
    case "delivered_by_seller":
      return {
        pct: 68,
        caption: "Delivered — awaiting buyer",
        indicator: "bg-accent",
      };
    case "received_by_buyer":
      return { pct: 88, caption: "Confirmed — releasing", indicator: "bg-accent" };
    case "released":
      return { pct: 100, caption: "Funds released", indicator: "bg-accent" };
    case "query_open":
      return { pct: 50, caption: "Query raised", indicator: "bg-warning" };
    case "proof_window":
      return { pct: 62, caption: "Proof window open", indicator: "bg-warning" };
    case "under_admin_review":
      return { pct: 78, caption: "Under review", indicator: "bg-warning" };
    case "refunded":
      return { pct: 100, caption: "Refunded", indicator: "bg-danger" };
    case "partially_refunded":
      return { pct: 100, caption: "Partially refunded", indicator: "bg-danger" };
    case "cancelled":
      return { pct: 100, caption: "Cancelled", indicator: "bg-muted" };
    case "expired":
      return { pct: 100, caption: "Expired", indicator: "bg-muted" };
    default:
      return { pct: 0, caption: "", indicator: "bg-accent" };
  }
}

export function EscrowProgress({ status }: { status: DealStatus }) {
  const { pct, caption, indicator } = escrowMeta(status);

  return (
    <section className="card space-y-2.5 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">Escrow progress</p>
        {caption && <span className="text-[12px] text-muted">{caption}</span>}
      </div>
      <Progress value={pct} aria-label="Escrow progress">
        <ProgressTrack indicatorClassName={indicator} />
      </Progress>
    </section>
  );
}
