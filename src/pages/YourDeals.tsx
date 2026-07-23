import { Link } from "react-router-dom";
import { FilePlus2, Receipt, Search, Zap, Tag, CreditCard, ChevronRight, QrCode, HelpCircle, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { useOfferStore, isActiveOffer } from "@/store/offerStore";
import { resolveDealRole, isParticipant, dealNeedsAction } from "@/lib/dealRole";
import { DealCard } from "@/components/DealCard";
import { EmptyState } from "@/components/EmptyState";
import { HowItWorksCarousel } from "@/components/HowItWorksCarousel";
import type { DealCategory } from "@/types/deal";
import { DEAL_CATEGORIES, CATEGORY_LABELS } from "@/types/deal";
import { CATEGORY_ICON } from "@/lib/categoryIcons";

export default function YourDeals() {
  const dealsMap = useDealStore((s) => s.deals);

  const session = useAuthStore((s) => s.session);
  const myOffers = useOfferStore((s) => s.myOffers);
  const fetchAsBuyer = useOfferStore((s) => s.fetchAsBuyer);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DealCategory | "all">("all");

  useEffect(() => {
    if (session?.address) fetchAsBuyer(session.address);
  }, [session?.address, fetchAsBuyer]);

  // A buyer's offers still in play: awaiting the seller, countered, or accepted
  // and waiting to be paid. Actions live on the listing page.
  const liveOffers = useMemo(
    () =>
      myOffers
        .filter((o) => isActiveOffer(o) || o.status === "accepted")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [myOffers]
  );

  // Only the deals this wallet participates in (created as seller or paid as buyer).
  const myDeals = useMemo(
    () =>
      Object.values(dealsMap)
        .filter((d) => isParticipant(d, session?.address))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [dealsMap, session?.address]
  );

  const actionDeals = useMemo(
    () => myDeals.filter((d) => dealNeedsAction(d, resolveDealRole(d, session))),
    [myDeals, session]
  );

  const filteredDeals = useMemo(() => {
    let list = myDeals;
    if (categoryFilter !== "all") list = list.filter((d) => d.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) => d.title.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [myDeals, categoryFilter, search]);

  const hasDeals = myDeals.length > 0;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 pt-1" data-tour="deals-actions">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted">Your activity</p>
          <h1 className="text-[20px] font-bold tracking-tight text-ink leading-tight">Your deals</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/find"
            className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-[13px]"
            title="Open a deal by ID or QR"
          >
            <QrCode className="h-4 w-4" />
            Find
          </Link>
          <Link
            to="/create/new"
            className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-[13px]"
          >
            <FilePlus2 className="h-4 w-4" />
            New deal
          </Link>
        </div>
      </div>

      {/* Your offers (buyer) */}
      {liveOffers.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-accent" />
            <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">Your offers</p>
            <span className="pill border-accent/40 bg-accent-soft text-[12px] text-accent-ink">
              {liveOffers.length}
            </span>
          </div>
          <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {liveOffers.map((o) => {
              const accepted = o.status === "accepted";
              const to = accepted && o.dealId ? `/deal/${o.dealId}/pay` : `/listings/${o.listingId}`;
              const statusLabel =
                o.status === "accepted" ? "Accepted, pay now"
                : o.status === "countered" ? "Seller countered"
                : "Awaiting seller";
              return (
                <li key={o.id}>
                  <Link
                    to={to}
                    className="card flex items-center gap-3 px-4 py-3 hover:shadow-lift transition"
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                        accepted ? "bg-accent text-white" : "bg-accent-soft text-accent"
                      }`}
                    >
                      {accepted ? <CreditCard className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold tabular-nums text-ink">
                        {o.currentAmount} {o.currency}
                      </p>
                      <p className="text-[12px] text-muted">{statusLabel}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Needs action */}
      {actionDeals.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-warning" />
            <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">Needs action</p>
            <span className="pill border-warning/40 bg-warning/10 text-[12px] text-warning">
              {actionDeals.length}
            </span>
          </div>
          <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {actionDeals.map((d) => (
              <li key={d.id}><DealCard deal={d} /></li>
            ))}
          </ul>
        </section>
      )}

      {/* All deals */}
      {hasDeals && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
            <input
              className="input pl-8 text-[14px]"
              placeholder="Search by title or deal ID"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`pill shrink-0 transition ${
                categoryFilter === "all"
                  ? "border-accent/40 bg-accent-soft text-accent-ink"
                  : "border-edge bg-bg text-muted hover:text-ink"
              }`}
            >
              All
            </button>
            {DEAL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`pill shrink-0 transition ${
                  categoryFilter === c
                    ? "border-accent/40 bg-accent-soft text-accent-ink"
                    : "border-edge bg-bg text-muted hover:text-ink"
                }`}
              >
                {(() => { const I = CATEGORY_ICON[c]; return <I className="h-3 w-3" />; })()}
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div data-tour="deals-library">
        {!hasDeals ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No deals yet"
            description="Create your first protected deal to get started."
            action={
              <Link to="/create/new" className="btn-primary">
                <FilePlus2 className="h-4 w-4" />
                Create a deal
              </Link>
            }
          />
        ) : filteredDeals.length === 0 ? (
          <div className="card px-5 py-6 text-center text-[13px] text-muted">
            No deals match your search.
          </div>
        ) : (
          <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {filteredDeals.map((d) => (
              <li key={d.id}><DealCard deal={d} /></li>
            ))}
          </ul>
        )}
      </div>

      {/* How escrow works — always visible so newcomers can learn the flow,
          and returning users can jog their memory. Slides advance every 30s. */}
      <section className="space-y-3 pt-2" data-tour="deals-guide">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-3.5 w-3.5 text-accent" />
            <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">
              How escrow works
            </p>
          </div>
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
          >
            Full guide
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <HowItWorksCarousel />
      </section>
    </div>
  );
}
