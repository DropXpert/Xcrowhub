import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Deal } from "@/types/deal";
import { StatusPill } from "./StatusPill";
import { CategoryTag } from "./CategoryTag";
import { formatRelative } from "@/lib/time";
import { isTerminal } from "@/lib/stateMachine";
import { escrowMeta } from "./EscrowProgress";
import { Progress, ProgressTrack } from "@/components/ui/progress";

export function DealCard({
  deal,
  to,
  showProgress = false,
}: {
  deal: Deal;
  to?: string;
  showProgress?: boolean;
}) {
  const { pct, indicator } = escrowMeta(deal.status);
  const withBar = showProgress && !isTerminal(deal.status);

  return (
    <Link
      to={to ?? `/deal/${deal.id}/status`}
      className="card block px-4 py-3.5 transition hover:border-accent/30 hover:shadow-lift"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[15px] font-medium text-ink">
              {deal.title || "Untitled deal"}
            </p>
            <p className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">
              {deal.priceAmount}{" "}
              <span className="text-muted">{deal.priceCurrency}</span>
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              <StatusPill status={deal.status} compact />
              {deal.category && deal.category !== "other" && (
                <CategoryTag category={deal.category} className="text-[12px] shrink-0" />
              )}
            </div>
            <span className="shrink-0 text-[12.5px] text-muted">
              {formatRelative(deal.updatedAt)}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      </div>

      {withBar && (
        <Progress value={pct} className="mt-3" aria-label="Deal progress">
          <ProgressTrack className="h-1.5" indicatorClassName={indicator} />
        </Progress>
      )}
    </Link>
  );
}
