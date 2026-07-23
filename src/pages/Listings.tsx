import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, Package, Star, ShieldCheck, Tag, Clock } from "lucide-react";
import { listingStockLabel, useListingStore } from "@/store/listingStore";
import { useAuthStore } from "@/store/authStore";
import { CategoryTag } from "@/components/CategoryTag";
import type { DealCategory } from "@/types/deal";
import { DEAL_CATEGORIES, CATEGORY_LABELS } from "@/types/deal";
import { CATEGORY_ICON } from "@/lib/categoryIcons";
import { ListingCardSkeleton } from "@/components/LoadingStates";
import { ListingImage } from "@/components/ListingImage";

export default function Listings() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const category: DealCategory | "all" = (() => {
    const c = params.get("category");
    return c && DEAL_CATEGORIES.includes(c as DealCategory) ? (c as DealCategory) : "all";
  })();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const listings = useListingStore((s) => s.listings);
  const loading = useListingStore((s) => s.loading);
  const fetchAll = useListingStore((s) => s.fetchAll);
  const session = useAuthStore((s) => s.session);
  const myAddr = session?.address.toLowerCase();

  // The URL is the source of truth for filters, so Home's search bar and
  // category tiles can deep-link straight into a filtered marketplace.
  useEffect(() => {
    setSearch(params.get("q") ?? "");
    fetchAll({
      category: category === "all" ? undefined : category,
      search: params.get("q") ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    const q = search.trim();
    if (q) next.set("q", q);
    else next.delete("q");
    setParams(next, { replace: true });
  }

  function selectCategory(c: DealCategory | "all") {
    const next = new URLSearchParams(params);
    if (c === "all") next.delete("category");
    else next.set("category", c);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-1" data-tour="market-header">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted">Marketplace</p>
          <h1 className="text-[20px] font-bold tracking-tight text-ink leading-tight">Browse listings</h1>
        </div>
        {session && (
          <Link to="/listings/new" className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-[13px]">
            <Plus className="h-4 w-4" />
            Sell
          </Link>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative" data-tour="market-search">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
        <input
          className="input pl-8 pr-20 text-[14px]"
          placeholder="Search services..."
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white">
          Search
        </button>
      </form>

      {/* Category filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1" data-tour="market-categories">
        <button
          type="button"
          onClick={() => selectCategory("all")}
          className={`pill shrink-0 transition ${category === "all" ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-edge bg-bg text-muted hover:text-ink"}`}
        >
          All
        </button>
        {DEAL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => selectCategory(c)}
            className={`pill shrink-0 transition ${category === c ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-edge bg-bg text-muted hover:text-ink"}`}
          >
            {(() => { const I = CATEGORY_ICON[c]; return <I className="h-3 w-3" />; })()}
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Results — 2-up on every viewport so the mini-app (≤480px) uses the
          full horizontal budget instead of dropping to a single tall column. */}
      <div data-tour="market-results">
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="card px-5 py-10 flex flex-col items-center gap-4 text-center">
          <Package className="h-8 w-8 text-muted/40" />
          <div className="space-y-1">
            <p className="text-[14px] font-semibold text-ink">No listings yet</p>
            <p className="text-[12.5px] text-muted">Be the first to list your service.</p>
          </div>
          {session && (
            <Link to="/listings/new" className="btn-primary">
              <Plus className="h-4 w-4" />
              Create listing
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4">
          {listings.map((l) => {
            // Card owner check drives whether the quick-action buttons render.
            // Compare identity (seller_addr) not payout — a seller who listed
            // in USDT from a NIM login still owns the listing on their NIM
            // wallet.
            const isOwner = !!myAddr && myAddr === l.sellerAddr.toLowerCase();
            const canAct = !!session && !isOwner && l.status === "active" && l.quantityAvailable > 0;
            return (
              <div key={l.id} className="marketplace-card flex min-w-0 flex-col">
                <Link
                  to={`/listings/${l.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-3 lg:gap-2 lg:px-4 lg:py-4"
                >
                  <ListingImage
                    imagePath={l.imagePath}
                    title={l.title}
                    className="mb-1 aspect-[16/9] w-full rounded-lg border border-edge/60"
                  />
                  {/* Title stays on its own row so long titles don't fight the
                      price for width in the 2-col mobile layout (~220px). */}
                  <p className="text-[12.5px] font-semibold leading-snug text-ink line-clamp-2 break-words lg:text-[14px]">
                    {l.title}
                  </p>

                  {/* Price row — tabular-nums keeps the digits aligned; the
                      currency suffix truncates rather than wrapping when the
                      tile is unusually narrow. */}
                  <p className="flex min-w-0 items-baseline gap-1 tabular-nums">
                    <span className="truncate text-[14px] font-bold text-ink lg:text-[16px]">
                      {l.priceAmount}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-muted">
                      {l.priceCurrency}
                    </span>
                  </p>

                  {l.description && (
                    <p className="text-[11.5px] leading-relaxed text-muted line-clamp-2 lg:text-[12.5px]">
                      {l.description}
                    </p>
                  )}

                  {/* Meta row wraps at narrow widths so the timing and
                      inventory labels remain inside the card. */}
                  <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 pt-1">
                    <CategoryTag category={l.category} className="max-w-full min-w-0 shrink truncate text-[10px] [&>svg]:h-2.5 [&>svg]:w-2.5" />
                    <span className="inline-flex min-w-0 max-w-full items-center gap-0.5 text-[10.5px] leading-tight text-muted">
                      <Clock className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{l.deliveryHours}h</span>
                    </span>
                    <span className="min-w-0 max-w-full truncate text-[10.5px] leading-tight text-muted">
                      {listingStockLabel(l)}
                    </span>
                    {l.ordersCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted">
                        <Star className="h-2.5 w-2.5" />
                        {l.ordersCount}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Quick-action rail — kept OUTSIDE the <Link> so we don't nest
                    interactive elements inside an anchor. Both buttons route
                    to the detail page with an ?action= flag; ListingDetail
                    auto-triggers the corresponding flow so the tap really does
                    feel one-shot. Hidden for owners and disconnected users
                    (nothing to buy on your own listing). */}
                {canAct && (
                  <div className="flex gap-1 border-t border-edge/60 px-3 py-1.5 lg:gap-2 lg:px-4 lg:py-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/listings/${l.id}?action=buy`)}
                      className="flex flex-1 items-center justify-center gap-0.5 rounded-md bg-accent px-1.5 py-1 text-[10.5px] font-semibold leading-none text-white transition active:scale-[0.98] lg:py-2 lg:text-[12px]"
                    >
                      <ShieldCheck className="h-2.5 w-2.5" />
                      Buy now
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/listings/${l.id}?action=offer`)}
                      className="flex flex-1 items-center justify-center gap-0.5 rounded-md border border-edge bg-bg px-1.5 py-1 text-[10.5px] font-semibold leading-none text-ink transition active:scale-[0.98] lg:py-2 lg:text-[12px]"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      Make offer
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
