import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Package, Palette, FileText, Code2, MessageSquare, Gamepad2, Tag, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DealCategory } from "@/types/deal";
import { CATEGORY_LABELS } from "@/types/deal";
import { useListingStore } from "@/store/listingStore";
import type { Listing } from "@/store/listingStore";

const ICON_MAP: Record<DealCategory, LucideIcon> = {
  digital_goods: Package,
  design: Palette,
  content: FileText,
  software: Code2,
  consulting: MessageSquare,
  gaming: Gamepad2,
  other: Tag,
};

/**
 * Orders-ranked marketplace rail. `listings` come back ordered by orders_count
 * desc from the store, so the top slice IS the real "popular" set — no invented
 * ranking or ratings. The whole section hides when there are no listings.
 */
export function PopularServices() {
  const listings = useListingStore((s) => s.popular);
  const loading = useListingStore((s) => s.popularLoading);
  const fetchPopular = useListingStore((s) => s.fetchPopular);

  useEffect(() => {
    fetchPopular();
  }, [fetchPopular]);

  // Nothing to show and nothing loading → hide entirely (no faked density).
  if (!loading && listings.length === 0) return null;

  const top = listings.slice(0, 8);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Popular services</h2>
        <Link
          to="/listings"
          className="inline-flex items-center gap-0.5 text-[12px] font-medium text-accent"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="-mx-5 flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-1 snap-x">
        {loading && listings.length === 0
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[132px] w-[190px] shrink-0 animate-pulse rounded-card bg-edge/25"
              />
            ))
          : top.map((l) => <ServiceCard key={l.id} listing={l} />)}
      </div>
    </section>
  );
}

function ServiceCard({ listing }: { listing: Listing }) {
  const Icon = ICON_MAP[listing.category] ?? Tag;
  return (
    <Link
      to={`/listings/${listing.id}`}
      className="snap-start flex w-[190px] shrink-0 flex-col gap-2.5 rounded-card border border-edge bg-surface p-4 shadow-receipt transition hover:border-accent/30 hover:shadow-lift active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[11px] text-muted">
          {CATEGORY_LABELS[listing.category]}
        </span>
      </div>

      <p className="line-clamp-2 min-h-[36px] text-[14px] font-semibold leading-snug text-ink">
        {listing.title}
      </p>

      <p className="text-[15px] font-bold tabular-nums text-accent-ink">
        {listing.priceAmount}
        <span className="ml-1 text-[12px] font-medium text-muted">
          {listing.priceCurrency}
        </span>
      </p>

      <div className="mt-auto flex items-center gap-2 text-[11px] text-muted">
        {listing.ordersCount > 0 && (
          <>
            <span>{listing.ordersCount} orders</span>
            <span className="text-edge">·</span>
          </>
        )}
        <span>{listing.deliveryHours}h delivery</span>
      </div>
    </Link>
  );
}
