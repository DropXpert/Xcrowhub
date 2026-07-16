import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Scale, Undo2, FileQuestion } from "lucide-react";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptSummary } from "@/components/ReceiptSummary";
import { StatusPill } from "@/components/StatusPill";
import { DealTimeline } from "@/components/DealTimeline";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Field } from "@/components/Field";
import { TxHashLink } from "@/components/TxHashLink";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { cn } from "@/lib/cn";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import type { AdminDecisionType, Proof } from "@/types/deal";

type ChoiceState =
  | { kind: "none" }
  | { kind: "decision"; type: AdminDecisionType };

export default function AdminReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const proofs = useDealStore((s) => (id ? s.getProofs(id) : []));
  const queries = useDealStore((s) => (id ? s.getQueries(id) : []));
  const events = useDealStore((s) => (id ? s.getTimeline(id) : []));
  const resolveAfterDeadline = useDealStore(
    (s) => s.resolveAfterProofDeadline
  );
  const applyDecision = useDealStore((s) => s.applyAdminDecision);

  const [choice, setChoice] = useState<ChoiceState>({ kind: "none" });
  const [reason, setReason] = useState("");
  const [buyerAmount, setBuyerAmount] = useState("");
  const [sellerAmount, setSellerAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  if (!deal) {
    if (loading) return <DealLoader eyebrow="Admin" title="Opening review" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Admin" title="Review" />
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Deal not found"
          description="The deal may have been removed or the ID is wrong."
          action={
            <Link to="/admin" className="btn-secondary">
              Back to admin
            </Link>
          }
        />
      </div>
    );
  }

  const isProofWindow = deal.status === "proof_window";
  const canDecide =
    deal.status === "under_admin_review" || deal.status === "proof_window";

  const buyerProofs = proofs.filter((p) => p.submittedBy === "buyer");
  const sellerProofs = proofs.filter((p) => p.submittedBy === "seller");
  const query = queries[queries.length - 1];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || submitting) return;
    if (choice.kind !== "decision") {
      setError("Pick a decision first.");
      return;
    }
    if (!reason.trim()) {
      setError("A short reason is required for the decision log.");
      return;
    }
    if (choice.type === "partial_refund") {
      const ba = Number(buyerAmount);
      const sa = Number(sellerAmount);
      if (!isFinite(ba) || !isFinite(sa) || ba < 0 || sa < 0) {
        setError("Enter valid non-negative amounts.");
        return;
      }
      const total = Number(deal!.priceAmount);
      if (Math.abs(ba + sa - total) > 1e-9) {
        setError(
          `Split must add up to the deal total (${deal!.priceAmount} ${deal!.priceCurrency}).`
        );
        return;
      }
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await Promise.resolve(applyDecision({
        dealId: deal!.id,
        decision: choice.type,
        buyerAmount:
          choice.type === "partial_refund" ? String(Number(buyerAmount)) : undefined,
        sellerAmount:
          choice.type === "partial_refund" ? String(Number(sellerAmount)) : undefined,
        reason,
        decidedBy: "admin",
      }));
      navigate(`/deal/${deal!.id}/status`);
    } catch (err: any) {
      setError(err.message ?? "Could not apply decision.");
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Admin: ${deal.id}`}
        title="Review dispute"
        right={<StatusPill status={deal.status} />}
      />

      {isProofWindow ? (
        <CountdownTimer
          deadline={deal.proofDeadlineAt}
          label="Proof window"
          onExpire={() => resolveAfterDeadline(deal.id)}
        />
      ) : null}

      {query ? (
        <section className="card space-y-2 px-5 py-4">
          <p className="field-label">Query</p>
          <p className="text-[13px] text-muted">
            Raised by {query.raisedBy === "buyer" ? "buyer" : "seller"}
          </p>
          <p className="text-[14px] leading-relaxed text-ink">
            {query.details}
          </p>
        </section>
      ) : null}

      <ReceiptSummary deal={deal} />

      <section className="grid gap-4 md:grid-cols-2">
        <ProofColumn
          title="Buyer proof"
          tone="buyer"
          proofs={buyerProofs}
          submitted={deal.buyerProofStatus === "submitted"}
        />
        <ProofColumn
          title="Seller proof"
          tone="seller"
          proofs={sellerProofs}
          submitted={deal.sellerProofStatus === "submitted"}
        />
      </section>

      {canDecide ? (
        <form onSubmit={submit} className="card space-y-4 px-5 py-5 border-2 border-accent/40">
          <h3 className="text-[15px] font-semibold text-ink">Decision</h3>
          {isProofWindow ? (
            <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[13px] leading-relaxed text-ink">
              Deciding before the proof window closes overrides the auto-rule.
              Use this only when you have enough proof to act now.
            </p>
          ) : null}
          <div className="grid gap-2">
            <DecisionChoice
              icon={<CheckCircle2 className="h-4 w-4 text-accent" />}
              label="Release to seller"
              description="Seller delivered. Buyer keeps nothing back."
              selected={
                choice.kind === "decision" &&
                choice.type === "release_to_seller"
              }
              onClick={() =>
                setChoice({ kind: "decision", type: "release_to_seller" })
              }
            />
            <DecisionChoice
              icon={<Undo2 className="h-4 w-4 text-danger" />}
              label="Refund buyer"
              description="Delivery failed. Full refund returns to buyer."
              selected={
                choice.kind === "decision" &&
                choice.type === "refund_to_buyer"
              }
              onClick={() =>
                setChoice({ kind: "decision", type: "refund_to_buyer" })
              }
            />
            <DecisionChoice
              icon={<Scale className="h-4 w-4 text-warning" />}
              label="Partial refund"
              description="Split funds between buyer and seller."
              selected={
                choice.kind === "decision" &&
                choice.type === "partial_refund"
              }
              onClick={() =>
                setChoice({ kind: "decision", type: "partial_refund" })
              }
            />
          </div>

          {choice.kind === "decision" && choice.type === "partial_refund" ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-edge bg-bg p-3">
              <Field label={`Buyer (${deal.priceCurrency})`} required>
                <input
                  className="input tabular-nums"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={buyerAmount}
                  onChange={(e) => setBuyerAmount(e.target.value)}
                />
              </Field>
              <Field label={`Seller (${deal.priceCurrency})`} required>
                <input
                  className="input tabular-nums"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={sellerAmount}
                  onChange={(e) => setSellerAmount(e.target.value)}
                />
              </Field>
              <p className="col-span-2 text-[12.5px] text-muted">
                Must add up to {deal.priceAmount} {deal.priceCurrency}.
              </p>
            </div>
          ) : null}

          <Field
            label="Reason"
            required
            hint="Logged with the decision for both parties."
          >
            <textarea
              className="textarea"
              placeholder="What's the basis for this decision?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={600}
            />
          </Field>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Applying..." : "Apply decision"}
          </button>
        </form>
      ) : (
        <section className="card px-5 py-4 text-[13px] text-muted">
          This deal isn't open for an admin decision.
        </section>
      )}

      <section className="card space-y-3 px-5 py-5">
        <h3 className="text-[15px] font-semibold text-ink">Timeline</h3>
        <DealTimeline events={events} />
      </section>
    </div>
  );
}

function ProofColumn({
  title,
  tone,
  proofs,
  submitted,
}: {
  title: string;
  tone: "buyer" | "seller";
  proofs: Proof[];
  submitted: boolean;
}) {
  return (
    <section className="card space-y-3 px-4 py-4">
      <header className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold text-ink">{title}</h4>
        <span
          className={cn(
            "pill",
            submitted
              ? "border-accent/30 bg-accent-soft text-accent-ink"
              : "border-edge bg-bg text-muted"
          )}
        >
          {submitted ? "Submitted" : "Not submitted"}
        </span>
      </header>
      {proofs.length === 0 ? (
        <p className="text-[13px] text-muted">
          No {tone} proof yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {proofs.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-edge bg-bg px-3 py-2.5"
            >
              <p className="text-[13.5px] text-ink">{p.explanation}</p>
              {p.txHash ? (
                <div className="mt-2">
                  <TxHashLink hash={p.txHash} label="ref" />
                </div>
              ) : null}
              {p.attachmentUrls.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {p.attachmentUrls.map((url, i) => (
                    <li
                      key={i}
                      className="truncate font-mono text-[12.5px] text-muted"
                    >
                      {url}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DecisionChoice({
  icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-surface px-3.5 py-3 text-left transition",
        selected
          ? "border-accent ring-2 ring-accent/20"
          : "border-edge hover:border-muted"
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="space-y-0.5">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        <span className="block text-[13px] text-muted">{description}</span>
      </span>
    </button>
  );
}
