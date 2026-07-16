import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Star, CheckCircle2 } from "lucide-react";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { StarRating } from "@/components/StarRating";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { FileQuestion } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { resolveDealRole } from "@/lib/dealRole";

export default function LeaveFeedback() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const session = useAuthStore((s) => s.session);
  const submitFeedback = useDealStore((s) => s.submitFeedback);
  const feedbacks = useDealStore((s) => (id ? s.getFeedbacks(id) : []));

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);

  if (!deal) {
    if (loading) return <DealLoader title="Opening feedback" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Feedback" title="Leave feedback" />
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Deal not found"
          action={<Link to="/" className="btn-secondary">Back to home</Link>}
        />
      </div>
    );
  }

  const finalized = ["released", "refunded", "partially_refunded"].includes(deal.status);
  if (!finalized) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow={`Deal · ${deal.id}`} title="Leave feedback" />
        <div className="card px-5 py-4 text-[13.5px] text-muted">
          Feedback can only be left after the deal is finalized (released or refunded).
        </div>
        <Link to={`/deal/${deal.id}/status`} className="btn-secondary w-full">
          Back to deal
        </Link>
      </div>
    );
  }

  const role = resolveDealRole(deal, session);
  if (role !== "buyer" && role !== "seller") {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow={`Deal · ${deal.id}`} title="Leave feedback" />
        <div className="card px-5 py-4 text-[13.5px] text-muted">
          Only the buyer or seller on this deal can leave feedback.
        </div>
        <Link to={`/deal/${deal.id}/status`} className="btn-secondary w-full">
          Back to deal
        </Link>
      </div>
    );
  }
  const myRole: "buyer" | "seller" = role;
  const alreadyLeft = feedbacks.some((f) => f.fromRole === myRole);

  if (alreadyLeft || done) {
    const recipientRole = myRole === "buyer" ? "seller" : "buyer";
    const recipientAddr = myRole === "buyer"
      ? deal.sellerWalletAddress
      : (deal.buyerWalletAddress ?? "");
    return (
      <div className="space-y-5">
        <PageHeader eyebrow={`Deal · ${deal.id}`} title="Feedback sent" />
        <div className="card flex flex-col items-center gap-3 px-5 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-accent" />
          <p className="text-[15px] font-medium text-ink">Feedback submitted!</p>
          <p className="text-[13px] text-muted">
            Your rating for this {recipientRole} has been recorded.
          </p>
          {recipientAddr ? (
            <Link
              to={`/profile/${encodeURIComponent(recipientAddr)}`}
              className="btn-secondary mt-2"
            >
              View {recipientRole} profile
            </Link>
          ) : null}
        </div>
        <Link to={`/deal/${deal.id}/status`} className="btn-ghost w-full">
          Back to deal
        </Link>
      </div>
    );
  }

  const recipientAddr = myRole === "buyer"
    ? deal.sellerWalletAddress
    : (deal.buyerWalletAddress ?? "");
  const fromAddr = session?.address
    ?? (myRole === "buyer" ? (deal.buyerWalletAddress ?? "") : deal.sellerWalletAddress);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || busy) return;
    if (rating === 0) return setError("Please select a star rating.");
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await submitFeedback({
        dealId: deal!.id,
        fromAddr,
        toAddr: recipientAddr,
        fromRole: myRole,
        rating,
        comment,
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit feedback.");
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`Deal · ${deal.id}`} title="Leave feedback" />

      <div className="card px-5 py-4 space-y-1">
        <p className="field-label">Deal</p>
        <p className="text-[15px] font-medium text-ink">{deal.title}</p>
        <p className="text-[13px] text-muted">
          Rate your experience as {myRole === "buyer" ? "a buyer" : "a seller"} on this deal.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card px-5 py-5 space-y-4">
          <Field label="Your rating" required>
            <div className="pt-1">
              <StarRating value={rating} onChange={setRating} size="lg" />
              {rating > 0 && (
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {["", "Poor", "Fair", "Good", "Great", "Exceptional"][rating]}
                </p>
              )}
            </div>
          </Field>

          <Field
            label="Comment"
            hint="Optional. Describe your experience."
          >
            <textarea
              className="textarea"
              placeholder="Great seller, delivered exactly as described and on time."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={400}
            />
          </Field>
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">{error}</p>
        ) : null}

        <button type="submit" disabled={busy || rating === 0} className="btn-primary w-full">
          <Star className="h-4 w-4" />
          {busy ? "Submitting…" : "Submit feedback"}
        </button>
      </form>

      <Link to={`/deal/${deal.id}/status`} className="btn-ghost w-full">
        Skip for now
      </Link>
    </div>
  );
}
