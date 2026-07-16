import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { FileQuestion } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { resolveDealRole } from "@/lib/dealRole";
import type { QueryReason } from "@/types/deal";

const buyerReasons: { value: QueryReason; label: string }[] = [
  { value: "product_not_received", label: "Product not received" },
  { value: "wrong_product", label: "Wrong product" },
  { value: "broken_link", label: "Link / file does not work" },
  { value: "incomplete_delivery", label: "Delivery incomplete" },
  { value: "other", label: "Other" },
];

const sellerReasons: { value: QueryReason; label: string }[] = [
  { value: "buyer_not_confirming", label: "Buyer received but did not confirm" },
  { value: "false_claim", label: "Buyer is making a false claim" },
  { value: "no_response", label: "Buyer is not responding" },
  { value: "other", label: "Other" },
];

export default function RaiseQuery() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const session = useAuthStore((s) => s.session);
  const raiseQuery = useDealStore((s) => s.raiseQuery);

  // "other" exists in both reason lists, so it's a safe role-independent default.
  const [reason, setReason] = useState<QueryReason>("other");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  if (!deal) {
    if (loading) return <DealLoader title="Opening query" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Query" title="Raise" />
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Deal not found"
          action={
            <Link to="/" className="btn-secondary">
              Back to home
            </Link>
          }
        />
      </div>
    );
  }

  const role = resolveDealRole(deal, session);
  if (role !== "buyer" && role !== "seller") {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Query" title="Raise a query" />
        <section className="card px-5 py-4 text-[13px] text-muted">
          Only the buyer or seller on this deal can raise a query.
        </section>
        <Link to={`/deal/${deal.id}/status`} className="btn-secondary w-full">
          Back to deal
        </Link>
      </div>
    );
  }
  const actorRole: "buyer" | "seller" = role;
  const reasons = role === "buyer" ? buyerReasons : sellerReasons;

  const canRaise =
    deal.status === "funds_held" || deal.status === "delivered_by_seller";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || submitting) return;
    if (!details.trim()) {
      setError("Add a short explanation of the issue.");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await Promise.resolve(raiseQuery({
        dealId: deal!.id,
        raisedBy: actorRole,
        reason,
        details,
      }));
      navigate(`/deal/${deal!.id}/proof`);
    } catch (err: any) {
      setError(err.message ?? "Could not open the proof window.");
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Query"
        title="Raise a query"
        right={<StatusPill status={deal.status} />}
      />

      <section className="rounded-card border border-warning/30 bg-warning/5 px-4 py-3.5">
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Raising a query opens a 24-hour proof window. Both sides will be
            asked to submit proof. If only one side submits, the decision
            favors that side.
          </span>
        </p>
      </section>

      {canRaise ? (
        <form onSubmit={submit} className="card space-y-4 px-5 py-5">
          <Field label="Reason" required>
            <select
              className="select"
              value={reason}
              onChange={(e) => setReason(e.target.value as QueryReason)}
            >
              {reasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Short explanation" required>
            <textarea
              className="textarea"
              placeholder="Describe the issue in plain language."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={600}
              autoFocus
            />
          </Field>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Opening..." : "Open proof window"}
          </button>
        </form>
      ) : (
        <section className="card px-5 py-4 text-[13px] text-muted">
          A query can't be raised at this stage of the deal.
        </section>
      )}
    </div>
  );
}
