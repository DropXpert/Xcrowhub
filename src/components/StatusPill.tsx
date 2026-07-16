import { statusLabel, statusTone } from "@/lib/stateMachine";
import type { DealStatus } from "@/types/deal";
import { cn } from "@/lib/cn";

const compactLabel: Record<string, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting pay",
  funds_held: "Held",
  delivered_by_seller: "Delivered",
  received_by_buyer: "Confirmed",
  released: "Released",
  query_open: "Query",
  proof_window: "Proof",
  under_admin_review: "Review",
  refunded: "Refunded",
  partially_refunded: "Part. refund",
  cancelled: "Cancelled",
  expired: "Expired",
};

// Status reads as a small colour dot + label (no chip) — calm and professional,
// and more compact than a pill at mini-app width.
const dotClasses: Record<string, string> = {
  neutral: "bg-muted",
  info: "bg-accent",
  warn: "bg-warning",
  success: "bg-accent",
  danger: "bg-danger",
};

const textClasses: Record<string, string> = {
  neutral: "text-muted",
  info: "text-ink",
  warn: "text-warning",
  success: "text-accent-ink",
  danger: "text-danger",
};

export function StatusPill({
  status,
  className,
  compact = false,
}: {
  status: DealStatus;
  className?: string;
  compact?: boolean;
}) {
  const tone = statusTone[status];
  const text = compact ? compactLabel[status] : statusLabel[status];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium",
        textClasses[tone],
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone])} />
      <span className="truncate">{text}</span>
    </span>
  );
}
