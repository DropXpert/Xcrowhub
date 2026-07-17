import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Clock, Star, Pause, Play, Trash2, Tag, Inbox } from "lucide-react";
import { useListingStore } from "@/store/listingStore";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore, useIsAdmin } from "@/store/authStore";
import { useOfferStore, isActiveOffer, isExpiredOffer, type Offer, type OfferStatus } from "@/store/offerStore";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { CategoryTag } from "@/components/CategoryTag";
import { WalletAddressBadge } from "@/components/WalletAddressBadge";
import { MakeOfferForm } from "@/components/MakeOfferForm";
import { OfferCard } from "@/components/OfferCard";
import { AlertDialog } from "@/components/AlertDialog";
import { SkeletonDots } from "@/components/LoadingStates";
import {
  ACTIVE_DEAL_LIMIT,
  ACTIVE_DEAL_LIMIT_MESSAGE,
  countActiveSellerDeals,
} from "@/lib/dealLimits";

// Seller inbox ordering: things that need action first, resolved last.
const STATUS_RANK: Record<OfferStatus, number> = {
  pending: 0,
  countered: 1,
  accepted: 2,
  declined: 3,
  withdrawn: 4,
  expired: 5,
};

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const getListing = useListingStore((s) => s.getListing);
  const fetchAll = useListingStore((s) => s.fetchAll);
  const toggleStatus = useListingStore((s) => s.toggleStatus);
  const deleteListing = useListingStore((s) => s.deleteListing);
  const applyInventoryReservation = useListingStore((s) => s.applyInventoryReservation);
  const createDeal = useDealStore((s) => s.createDeal);
  const loadDealById = useDealStore((s) => s.loadDealById);
  const dealsMap = useDealStore((s) => s.deals);
  const session = useAuthStore((s) => s.session);

  const offers = useOfferStore((s) => (id ? s.byListing[id] : undefined));
  const fetchForListing = useOfferStore((s) => s.fetchForListing);
  const subscribeForListing = useOfferStore((s) => s.subscribeForListing);
  const placeOffer = useOfferStore((s) => s.placeOffer);
  const withdrawOffer = useOfferStore((s) => s.withdraw);
  const declineOffer = useOfferStore((s) => s.decline);
  const counterOffer = useOfferStore((s) => s.counter);
  const markAccepted = useOfferStore((s) => s.markAccepted);

  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Buy-now and accept-offer both fund a deal; both flow through this
  // confirm dialog. `pendingAcceptOffer` holds the Offer being accepted
  // (null = plain "buy now for list price").
  const [confirmingBuy, setConfirmingBuy] = useState(false);
  const [pendingAcceptOffer, setPendingAcceptOffer] = useState<Offer | null>(null);
  const buyLock = useRef(false);
  const offerSubmitLock = useRef(false);
  const offerActionLock = useRef<string | null>(null);
  const manageActionLock = useRef(false);
  // Guards the ?action=buy|offer marketplace-card quick-action: fires exactly
  // once per mount so a re-render (or a slow listing fetch) never re-triggers
  // the flow.
  const autoActionFiredRef = useRef(false);

  useEffect(() => {
    if (!getListing(id ?? "")) fetchAll();
  }, [id]);

  // Load offers + subscribe to live changes for this listing.
  useEffect(() => {
    if (!id) return;
    fetchForListing(id);
    const unsub = subscribeForListing(id, () => {});
    return unsub;
  }, [id, fetchForListing, subscribeForListing]);

  const listing = getListing(id ?? "");
  const myAddr = session?.address.toLowerCase();
  const isOwner = !!myAddr && myAddr === listing?.sellerAddr.toLowerCase();
  const isAdmin = useIsAdmin();

  const allOffers = useMemo(() => offers ?? [], [offers]);

  // Seller's incoming offers, action-needed first.
  const incoming = useMemo(() => {
    return [...allOffers].sort((a, b) => {
      const ra = isExpiredOffer(a) ? STATUS_RANK.expired : STATUS_RANK[a.status];
      const rb = isExpiredOffer(b) ? STATUS_RANK.expired : STATUS_RANK[b.status];
      return ra !== rb ? ra - rb : b.createdAt.localeCompare(a.createdAt);
    });
  }, [allOffers]);

  // Buyer's own current offer on this listing (active or accepted).
  const myOffer = useMemo(() => {
    if (!myAddr) return null;
    const mine = allOffers
      .filter((o) => o.buyerAddr.toLowerCase() === myAddr)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mine.find((o) => isActiveOffer(o) || o.status === "accepted") ?? null;
  }, [allOffers, myAddr]);

  // Cap on active deals is enforced against the payout wallet server-side
  // (create_deal groups by seller_wallet_address). Count locally the same
  // way so the buyer sees an accurate "seller busy" preview.
  const activeSellerDeals = useMemo(
    () => (listing ? countActiveSellerDeals(Object.values(dealsMap), listing.payoutAddr) : 0),
    [dealsMap, listing]
  );
  const sellerDealLimitReached = activeSellerDeals >= ACTIVE_DEAL_LIMIT;

  if (!listing) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Listing" title="Not found" back="/listings" />
        <div className="card px-5 py-10 text-center text-[13px] text-muted">
          This listing doesn't exist or was removed.
        </div>
      </div>
    );
  }

  const l = listing;

  async function handleBuy() {
    if (buyLock.current || buying) return;
    buyLock.current = true;
    setBuying(true);
    setBuyError(null);
    try {
      if (sellerDealLimitReached) {
        throw new Error(ACTIVE_DEAL_LIMIT_MESSAGE);
      }
      let dealId: string;
      if (isSupabaseConfiguredForClient()) {
        // Locks and reserves one unit before creating the escrow deal, so two
        // buyers can never pay for the final item at the same time.
        const { data, error } = await getSupabaseClient().rpc("buy_marketplace_listing", {
          p_listing_id: l.id,
        });
        if (error || !data) throw new Error(error?.message ?? "Could not create the deal.");
        dealId = data;
        await loadDealById(dealId);
        applyInventoryReservation(l.id);
      } else {
        const deal = await createDeal({
          title: l.title,
          description: l.description,
          priceAmount: l.priceAmount,
          priceCurrency: l.priceCurrency,
          category: l.category,
          sellerWalletAddress: l.payoutAddr,
          deliveryDeadlineHours: l.deliveryHours,
          confirmationWindowHours: l.confirmationHours,
          requiredDeliveryProof: l.requiredDeliveryProof,
          refundTerms: l.refundTerms,
          listingId: l.id,
        });
        dealId = deal.id;
      }
      // Order count is credited on release (see dealStore.creditOrderOnRelease),
      // not here — abandoned/unpaid deals must not inflate a seller's record.
      navigate(`/deal/${dealId}/pay`);
    } catch (err: any) {
      setBuyError(err.message ?? "Failed to create deal.");
      // Close the confirm dialog on error so the error line under the CTA
      // is visible; on success we've already navigated away.
      setConfirmingBuy(false);
      setPendingAcceptOffer(null);
    } finally {
      setBuying(false);
      buyLock.current = false;
    }
  }

  async function handlePlaceOffer(amount: string, message: string) {
    if (!session || isOwner) return;
    if (offerSubmitLock.current || offerSubmitting) return;
    offerSubmitLock.current = true;
    setOfferSubmitting(true);
    setOfferError(null);
    try {
      await placeOffer({
        listingId: l.id,
        buyerAddr: session.address,
        sellerAddr: l.sellerAddr,
        currency: l.priceCurrency,
        amount,
        message,
      });
      setShowOfferForm(false);
    } catch (err: any) {
      setOfferError(err.message ?? "Failed to send offer.");
    } finally {
      setOfferSubmitting(false);
      offerSubmitLock.current = false;
    }
  }

  // Shared accept path for both seller (accepts buyer offer) and buyer
  // (accepts seller counter): create the escrow deal at the agreed price, then
  // link it to the offer. Cross-party notification is delivered via realtime.
  async function handleAcceptOffer(offer: Offer) {
    if (offerActionLock.current) return;
    if (isExpiredOffer(offer)) {
      setOfferError("This offer has expired.");
      return;
    }
    offerActionLock.current = offer.id;
    setBusyOfferId(offer.id);
    setOfferError(null);
    try {
      if (sellerDealLimitReached) {
        throw new Error(ACTIVE_DEAL_LIMIT_MESSAGE);
      }
      let dealId: string;
      if (isSupabaseConfiguredForClient()) {
        // The RPC locks the offer, validates whose turn it is, creates the
        // deal from server-side listing data, and binds this offer's buyer.
        const { data, error } = await getSupabaseClient().rpc("accept_marketplace_offer", {
          p_offer_id: offer.id,
        });
        if (error || !data) throw new Error(error?.message ?? "Could not create the deal.");
        dealId = data;
        await loadDealById(dealId);
        await fetchForListing(l.id);
        applyInventoryReservation(l.id);
      } else {
        const deal = await createDeal({
          title: l.title,
          description: l.description,
          priceAmount: offer.currentAmount,
          priceCurrency: offer.currency,
          category: l.category,
          sellerWalletAddress: l.payoutAddr,
          deliveryDeadlineHours: l.deliveryHours,
          confirmationWindowHours: l.confirmationHours,
          requiredDeliveryProof: l.requiredDeliveryProof,
          refundTerms: l.refundTerms,
          listingId: l.id,
        });
        if (!deal?.id) throw new Error("Could not create the deal.");
        dealId = deal.id;
        await markAccepted(offer.id, dealId);
      }

      // The buyer pays. If the buyer accepted the counter, take them straight there.
      if (myAddr === offer.buyerAddr.toLowerCase()) {
        navigate(`/deal/${dealId}/pay`);
      }
      // Success -- close the confirm dialog (seller stays on this page,
      // buyer navigates to pay).
      setConfirmingBuy(false);
      setPendingAcceptOffer(null);
    } catch (err: any) {
      setOfferError(err.message ?? "Failed to accept offer.");
      setConfirmingBuy(false);
      setPendingAcceptOffer(null);
    } finally {
      setBusyOfferId(null);
      offerActionLock.current = null;
    }
  }

  async function runOfferAction(offerId: string, fn: () => Promise<void>) {
    if (offerActionLock.current) return;
    offerActionLock.current = offerId;
    setBusyOfferId(offerId);
    setOfferError(null);
    try {
      await fn();
    } catch (err: any) {
      setOfferError(err.message ?? "Action failed.");
    } finally {
      setBusyOfferId(null);
      offerActionLock.current = null;
    }
  }

  async function handleDelete() {
    if (manageActionLock.current) return;
    manageActionLock.current = true;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteListing(l.id);
      setConfirmingDelete(false);
      navigate("/listings");
    } catch (err: any) {
      // Keep the dialog closed so the inline error is visible on the page,
      // and surface the reason so an RLS block doesn't look like a no-op.
      setConfirmingDelete(false);
      setDeleteError(err?.message ?? "Delete failed. Please try again.");
    } finally {
      manageActionLock.current = false;
      setDeleting(false);
    }
  }

  async function handleToggleStatus() {
    if (manageActionLock.current) return;
    manageActionLock.current = true;
    try {
      await toggleStatus(l.id, l.status === "active" ? "paused" : "active");
    } finally {
      manageActionLock.current = false;
    }
  }

  // Marketplace card quick-actions: /listings/:id?action=buy|offer.
  // Fires once when everything the flow needs is ready (listing loaded,
  // session present, viewer isn't the owner, listing is active). The URL
  // param is cleared with replace: true so a refresh or back-nav won't
  // re-trigger, and so ?action=buy is scrubbed BEFORE the buy flow
  // navigates the user away to /deal/:id/pay.
  useEffect(() => {
    if (autoActionFiredRef.current) return;
    const action = searchParams.get("action");
    if (action !== "buy" && action !== "offer") return;
    if (!listing || listing.status !== "active") return;
    if (!session || isOwner) return;

    autoActionFiredRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("action");
    setSearchParams(next, { replace: true });

    if (action === "buy") {
      // Route through the confirm dialog rather than firing handleBuy
      // silently -- the marketplace-card "Buy now" is a high-attention
      // action and should read the same as tapping "Buy now" on this page.
      setBuyError(null);
      setPendingAcceptOffer(null);
      setConfirmingBuy(true);
    } else {
      setOfferError(null);
      setShowOfferForm(true);
    }
  }, [listing, session, isOwner, searchParams, setSearchParams]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Listing" title="" back="/listings" />

      {/* Main card */}
      <section className="card px-5 py-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words [overflow-wrap:anywhere] text-[18px] font-bold leading-snug text-ink flex-1">{l.title}</h1>
          <div className="shrink-0 text-right">
            <p className="text-[20px] font-bold tabular-nums text-ink leading-none">{l.priceAmount}</p>
            <p className="text-[12.5px] text-muted mt-0.5">{l.priceCurrency}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CategoryTag category={l.category} />
          {l.tags.map((t) => (
            <span key={t} className="pill border-edge bg-bg text-muted text-[12px]">#{t}</span>
          ))}
        </div>

        {l.description && (
          <p className="break-words [overflow-wrap:anywhere] text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">{l.description}</p>
        )}

        <div className="grid min-w-0 grid-cols-2 gap-3 rounded-xl border border-edge bg-bg px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            <p className="field-label">Delivery</p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] font-medium text-ink">
              <Clock className="h-3.5 w-3.5 text-muted" />
              <span className="break-words">{l.deliveryHours}h deadline</span>
            </div>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="field-label">Escrow</p>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Protected
            </div>
          </div>
          {l.ordersCount > 0 && (
            <div className="min-w-0 space-y-0.5">
              <p className="field-label">Orders</p>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                <Star className="h-3.5 w-3.5 text-warning" />
                {l.ordersCount} completed
              </div>
            </div>
          )}
          <div className="min-w-0 space-y-0.5">
            <p className="field-label">Availability</p>
            <p className="text-[13px] font-medium text-ink">
              {l.quantityAvailable > 0 ? `${l.quantityAvailable} of ${l.quantityTotal} left` : "Sold out"}
            </p>
          </div>
        </div>
      </section>

      {/* Seller info */}
      <section className="card px-5 py-4 flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="field-label">Seller</p>
          <WalletAddressBadge address={l.sellerAddr} />
        </div>
        <Link to={`/profile/${encodeURIComponent(l.sellerAddr)}`} className="btn-secondary text-[12.5px] px-3 py-2 shrink-0">
          View profile
        </Link>
      </section>

      {/* Delivery proof terms */}
      <section className="card px-5 py-4 space-y-2">
        <p className="text-[13px] font-semibold text-ink">What counts as delivery</p>
        <p className="break-words [overflow-wrap:anywhere] text-[13px] text-muted leading-relaxed">{l.requiredDeliveryProof}</p>
      </section>

      <section className="card px-5 py-4 space-y-2">
        <p className="text-[13px] font-semibold text-ink">Refund terms</p>
        <p className="break-words [overflow-wrap:anywhere] text-[13px] text-muted leading-relaxed">{l.refundTerms}</p>
      </section>

      {/* ── Buyer view ───────────────────────────────────────────────────── */}
      {!isOwner && (
        <div className="space-y-3">
          {/* The buyer's own active/accepted offer, if any */}
          {myOffer && (
            <OfferCard
              offer={myOffer}
              viewer="buyer"
              busy={busyOfferId === myOffer.id}
              onAccept={() => {
                setBuyError(null);
                setPendingAcceptOffer(myOffer);
                setConfirmingBuy(true);
              }}
              onDecline={() => runOfferAction(myOffer.id, () => declineOffer(myOffer.id))}
              onWithdraw={() => runOfferAction(myOffer.id, () => withdrawOffer(myOffer.id))}
            />
          )}

          {offerError && <p className="text-[12.5px] text-danger">{offerError}</p>}

          {/* Make-an-offer form */}
          {!myOffer && showOfferForm && session && (
            <MakeOfferForm
              listPrice={l.priceAmount}
              currency={l.priceCurrency}
              submitting={offerSubmitting}
              error={offerError}
              onSubmit={handlePlaceOffer}
              onCancel={() => setShowOfferForm(false)}
            />
          )}

          {/* Buy / Make offer CTAs (hidden once an offer is accepted) */}
          {(!myOffer || myOffer.status !== "accepted") && !showOfferForm && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setBuyError(null);
                  setPendingAcceptOffer(null);
                  setConfirmingBuy(true);
                }}
                disabled={buying || l.status !== "active" || l.quantityAvailable <= 0 || sellerDealLimitReached}
                className="btn-primary w-full"
              >
                {buying ? <SkeletonDots label="Creating marketplace deal" /> : <ShieldCheck className="h-4 w-4" />}
                {buying
                  ? "Creating deal..."
                  : l.status !== "active"
                  ? l.status === "sold_out" ? "Sold out" : "Listing paused"
                  : l.quantityAvailable <= 0
                  ? "Sold out"
                  : sellerDealLimitReached
                  ? "Seller is at deal limit"
                  : `Buy now for ${l.priceAmount} ${l.priceCurrency}`}
              </button>

              {!myOffer && session && l.status === "active" && (
                <button
                  type="button"
                  onClick={() => { setShowOfferForm(true); setOfferError(null); }}
                  className="btn-secondary w-full"
                >
                  <Tag className="h-4 w-4" />
                  Make an offer
                </button>
              )}

              {buyError && <p className="text-[12.5px] text-danger">{buyError}</p>}
              {!session && (
                <p className="text-center text-[12.5px] text-muted">Connect your wallet to buy or make an offer.</p>
              )}
              {session && (
                <p className={`text-center text-[12.5px] ${sellerDealLimitReached ? "text-danger" : "text-muted"}`}>
                  {sellerDealLimitReached
                    ? ACTIVE_DEAL_LIMIT_MESSAGE
                    : "Funds held in escrow. Released only on delivery."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Seller view ──────────────────────────────────────────────────── */}
      {isOwner && (
        <>
          {/* Incoming offers */}
          <section className="card px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-ink">Offers</h3>
              {incoming.length > 0 && (
                <span className="pill border-edge bg-bg text-[12px] text-muted">{incoming.length}</span>
              )}
            </div>

            {offerError && <p className="text-[12.5px] text-danger">{offerError}</p>}

            {incoming.length === 0 ? (
              <p className="text-[13px] text-muted">No offers yet. They'll appear here in real time.</p>
            ) : (
              <ul className="space-y-2.5">
                {incoming.map((o) => (
                  <li key={o.id}>
                    <OfferCard
                      offer={o}
                      viewer="seller"
                      busy={busyOfferId === o.id}
                      onAccept={() => {
                        setOfferError(null);
                        setPendingAcceptOffer(o);
                        setConfirmingBuy(true);
                      }}
                      onDecline={() => runOfferAction(o.id, () => declineOffer(o.id))}
                      onCounter={(amount) => runOfferAction(o.id, () => counterOffer(o.id, amount))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

        </>
      )}

      {/* Manage listing — owner sees Pause + Delete; admins (non-owner) see
          Delete only so they can take down policy-violating listings. RLS
          allows both paths (owner via addr_eq, admin via is_admin()). */}
      {(isOwner || isAdmin) && (
        <section className="card px-5 py-4 space-y-3">
          <p className="text-[13px] font-semibold text-ink">
            {isOwner ? "Manage listing" : "Admin actions"}
          </p>
          <div className={`grid gap-2 ${isOwner ? "grid-cols-2" : "grid-cols-1"}`}>
            {isOwner && (
              <button
                type="button"
                onClick={handleToggleStatus}
                className="btn-secondary w-full text-[13px]"
              >
                {l.status === "active"
                  ? <><Pause className="h-4 w-4" />Pause</>
                  : <><Play className="h-4 w-4" />Activate</>}
              </button>
            )}

            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="btn-danger w-full text-[13px]"
            >
              <Trash2 className="h-4 w-4" />
              {isOwner ? "Delete" : "Delete listing (admin)"}
            </button>
          </div>
          <AlertDialog
            open={confirmingDelete}
            onOpenChange={(open) => {
              if (!open && deleting) return;
              setConfirmingDelete(open);
            }}
            title={isOwner ? "Delete this listing?" : "Delete this listing as admin?"}
            description={
              isOwner
                ? "Buyers will no longer be able to find or purchase it. This can't be undone."
                : "The seller will lose this listing. Only use this for policy violations. This can't be undone."
            }
            cancelLabel="Keep listing"
            actionLabel={deleting ? "Deleting…" : "Delete listing"}
            onAction={handleDelete}
            busy={deleting}
            destructive
          />
          {deleteError && (
            <p className="text-[12.5px] text-danger" role="alert">
              {deleteError}
            </p>
          )}
          {isOwner && (
            <div className={`rounded-lg px-3 py-2 text-[12.5px] text-center ${l.status === "active" ? "bg-accent-soft text-accent-ink" : "bg-warning/10 text-warning"}`}>
              {l.status === "active" ? "Live, buyers can purchase" : "Paused, hidden from browse"}
            </div>
          )}
        </section>
      )}

      {/* Shared confirm dialog for both "Buy now" and "Accept offer". The
          pending offer (if any) drives the shown amount and the underlying
          action -- accept-offer creates the deal at the agreed price and
          links it, plain buy-now just uses the list price. */}
      <AlertDialog
        open={confirmingBuy}
        onOpenChange={(open) => {
          if (!open && (buying || !!busyOfferId)) return;
          setConfirmingBuy(open);
          if (!open) setPendingAcceptOffer(null);
        }}
        title={
          pendingAcceptOffer
            ? `Accept offer at ${pendingAcceptOffer.currentAmount} ${pendingAcceptOffer.currency}?`
            : `Buy for ${l.priceAmount} ${l.priceCurrency}?`
        }
        description={
          pendingAcceptOffer
            ? `A deal will be created at ${pendingAcceptOffer.currentAmount} ${pendingAcceptOffer.currency}. Funds are held in escrow until the seller delivers and the buyer confirms.`
            : `A deal will be created and funds go into XcrowHub custody. The seller has ${l.deliveryHours}h to deliver, then you have ${l.confirmationHours}h to confirm.`
        }
        cancelLabel="Not yet"
        actionLabel={
          buying || !!busyOfferId
            ? "Creating deal…"
            : pendingAcceptOffer
            ? "Accept & fund"
            : "Buy now"
        }
        onAction={() => {
          if (pendingAcceptOffer) {
            handleAcceptOffer(pendingAcceptOffer);
          } else {
            handleBuy();
          }
        }}
        busy={buying || !!busyOfferId}
      />
    </div>
  );
}
