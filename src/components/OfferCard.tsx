import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Reply, CreditCard, Clock } from "lucide-react";
import { SkeletonDots } from "@/components/LoadingStates";
import { cn } from "@/lib/cn";
import { formatCountdown, msUntil } from "@/lib/time";
import { WalletAddressBadge } from "@/components/WalletAddressBadge";
import { isExpiredOffer, type Offer, type OfferStatus } from "@/store/offerStore";

const MAX_AMOUNT = 1e9;

const STATUS_DOT: Record<OfferStatus, string> = {
  pending: "bg-warning",
  countered: "bg-accent",
  accepted: "bg-accent",
  declined: "bg-muted",
  withdrawn: "bg-muted",
  expired: "bg-muted",
};

const STATUS_TEXT: Record<OfferStatus, string> = {
  pending: "text-warning",
  countered: "text-ink",
  accepted: "text-accent-ink",
  declined: "text-muted",
  withdrawn: "text-muted",
  expired: "text-muted",
};

const STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Pending",
  countered: "Countered",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export function OfferCard({
  offer,
  viewer,
  busy = false,
  onAccept,
  onDecline,
  onCounter,
  onWithdraw,
}: {
  offer: Offer;
  viewer: "buyer" | "seller";
  busy?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: (amount: string) => void;
  onWithdraw?: () => void;
}) {
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState(offer.currentAmount);

  // Past-expiry offers render as terminal regardless of stored status.
  const displayStatus: OfferStatus = isExpiredOffer(offer) ? "expired" : offer.status;
  const isActive = displayStatus === "pending" || displayStatus === "countered";
  const wasCountered = offer.currentAmount !== offer.originalAmount;

  const numeric = Number(counterAmount);
  const counterValid = Number.isFinite(numeric) && numeric > 0 && numeric <= MAX_AMOUNT;

  // Whose turn is it? pending → seller acts; countered → buyer acts.
  const sellerActs = displayStatus === "pending" && viewer === "seller";
  const buyerActs = displayStatus === "countered" && viewer === "buyer";

  function submitCounter() {
    if (!counterValid) return;
    onCounter?.(String(numeric));
    setCountering(false);
  }

  return (
    <div className="rounded-xl border border-edge bg-surface px-4 py-3.5 space-y-3">
      {/* Header: amount + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold tabular-nums text-ink leading-none">
              {offer.currentAmount}
            </span>
            <span className="text-[12.5px] font-medium text-muted">{offer.currency}</span>
            {wasCountered && (
              <span className="text-[12.5px] text-muted line-through tabular-nums">
                {offer.originalAmount}
              </span>
            )}
          </div>
          {viewer === "seller" && (
            <div className="mt-1.5">
              <WalletAddressBadge address={offer.buyerAddr} label="from" />
            </div>
          )}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium",
            STATUS_TEXT[displayStatus]
          )}
        >
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[displayStatus])} />
          {STATUS_LABELS[displayStatus]}
        </span>
      </div>

      {/* Buyer's message */}
      {offer.message && (
        <p className="rounded-lg bg-bg px-3 py-2 text-[13px] leading-relaxed text-ink">
          {offer.message}
        </p>
      )}

      {/* Expiry countdown for active offers */}
      {isActive && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <Clock className="h-3 w-3" />
          Expires in{" "}
          <span className="font-mono tabular-nums">{formatCountdown(msUntil(offer.expiresAt))}</span>
        </p>
      )}

      {/* Accepted → pay CTA / status */}
      {displayStatus === "accepted" &&
        (viewer === "buyer" && offer.dealId ? (
          <Link to={`/deal/${offer.dealId}/pay`} className="btn-primary w-full text-[13px]">
            <CreditCard className="h-4 w-4" />
            Pay now: {offer.currentAmount} {offer.currency}
          </Link>
        ) : (
          <p className="text-[13px] text-accent-ink">
            Accepted at {offer.currentAmount} {offer.currency}
            {viewer === "seller" ? " Buyer has been asked to pay." : "."}
          </p>
        ))}

      {/* Seller actions on a pending offer */}
      {sellerActs && !countering && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onAccept} disabled={busy} className="btn-primary text-[13px]">
            {busy ? <SkeletonDots label="Accepting offer" /> : <Check className="h-4 w-4" />}
            Accept
          </button>
          <button
            type="button"
            onClick={() => setCountering(true)}
            disabled={busy}
            className="btn-secondary text-[13px]"
          >
            <Reply className="h-4 w-4" />
            Counter
          </button>
          <button type="button" onClick={onDecline} disabled={busy} className="btn-danger text-[13px]">
            <X className="h-4 w-4" />
            Decline
          </button>
        </div>
      )}

      {/* Seller counter input */}
      {sellerActs && countering && (
        <div className="space-y-2">
          <div className="relative">
            <input
              autoFocus
              inputMode="decimal"
              className="input pr-14 text-[15px]"
              value={counterAmount}
              maxLength={16}
              onChange={(e) => setCounterAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 16))}
              placeholder="Counter price"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] font-medium text-muted">
              {offer.currency}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={submitCounter}
              disabled={busy || !counterValid}
              className="btn-primary text-[13px]"
            >
              {busy ? <SkeletonDots label="Sending counter offer" /> : <Reply className="h-4 w-4" />}
              Send counter
            </button>
            <button
              type="button"
              onClick={() => setCountering(false)}
              disabled={busy}
              className="btn-secondary text-[13px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Buyer actions on a seller counter */}
      {buyerActs && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onAccept} disabled={busy} className="btn-primary text-[13px]">
            {busy ? <SkeletonDots label="Accepting counter offer" /> : <Check className="h-4 w-4" />}
            Accept counter
          </button>
          <button type="button" onClick={onDecline} disabled={busy} className="btn-danger text-[13px]">
            <X className="h-4 w-4" />
            Decline
          </button>
        </div>
      )}

      {/* Buyer can withdraw their own still-pending offer */}
      {viewer === "buyer" && displayStatus === "pending" && (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy}
          className="btn-ghost w-full text-[13px] text-muted"
        >
          Withdraw offer
        </button>
      )}
    </div>
  );
}
