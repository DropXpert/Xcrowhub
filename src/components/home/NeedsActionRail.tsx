import { Link } from "react-router-dom";
import { Zap, ArrowRight } from "lucide-react";
import type { Deal } from "@/types/deal";
import { StatusPill } from "@/components/StatusPill";

export interface ActionItem {
  deal: Deal;
  verb: string;
  to: string;
}

/**
 * Horizontal rail of the deals waiting on the connected user, each surfacing
 * the one next action (Confirm / Deliver / Add proof …). Rendered only when
 * there is at least one item.
 */
export function NeedsActionRail({ items }: { items: ActionItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Zap className="h-4 w-4 text-warning" />
        <h2 className="text-[15px] font-semibold text-ink">Needs your action</h2>
        <span className="text-[13px] text-muted">({items.length})</span>
      </div>

      <div className="-mx-5 flex gap-2.5 overflow-x-auto scrollbar-hide px-5 pb-0.5 snap-x">
        {items.map(({ deal, verb, to }) => (
          <Link
            key={deal.id}
            to={to}
            className="snap-start flex w-[170px] shrink-0 flex-col gap-2 rounded-card border border-warning/30 bg-surface px-3.5 py-3 shadow-receipt transition hover:shadow-lift active:scale-[0.99]"
          >
            <p className="truncate text-[13.5px] font-semibold text-ink">
              {deal.title || "Untitled deal"}
            </p>
            <StatusPill status={deal.status} compact />
            <span className="mt-auto inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-warning">
              {verb}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
