import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FilePlus, Loader2 } from "lucide-react";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ProofUpload, type ProofDraft } from "@/components/ProofUpload";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { FileQuestion } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { resolveDealRole } from "@/lib/dealRole";

const emptyDraft: ProofDraft = {
  explanation: "",
  txHash: "",
  attachments: [],
};

export default function SubmitProof() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { deal, loading } = useDealWithRemoteLoad(id);
  const session = useAuthStore((s) => s.session);
  const submitProof = useDealStore((s) => s.submitProof);
  const resolveAfterDeadline = useDealStore(
    (s) => s.resolveAfterProofDeadline
  );
  const [draft, setDraft] = useState<ProofDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  if (!deal) {
    if (loading) return <DealLoader title="Opening proof" />;
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Proof" title="Submit" />
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
        <PageHeader eyebrow="Proof" title="Submit proof" />
        <section className="card px-5 py-4 text-[13px] text-muted">
          Only the buyer or seller on this deal can submit proof.
        </section>
        <Link to={`/deal/${deal.id}/status`} className="btn-secondary w-full">
          Back to deal
        </Link>
      </div>
    );
  }
  const actorRole: "buyer" | "seller" = role;

  const open = deal.status === "proof_window";
  const youSubmitted =
    actorRole === "buyer"
      ? deal.buyerProofStatus === "submitted"
      : deal.sellerProofStatus === "submitted";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || submitting) return;
    if (!draft.explanation.trim()) {
      setError("Add a short explanation.");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await Promise.resolve(submitProof({
        dealId: deal!.id,
        submittedBy: actorRole,
        explanation: draft.explanation,
        txHash: draft.txHash || undefined,
        attachmentUrls: draft.attachments,
      }));
      navigate(`/deal/${deal!.id}/status`);
    } catch (err: any) {
      setError(err.message ?? "Could not submit proof.");
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={actorRole === "buyer" ? "Buyer proof" : "Seller proof"}
        title="Submit proof"
        right={<StatusPill status={deal.status} />}
      />

      {open ? (
        <CountdownTimer
          deadline={deal.proofDeadlineAt}
          onExpire={() => resolveAfterDeadline(deal.id)}
        />
      ) : null}

      {!open ? (
        <section className="card px-5 py-4 text-[13px] text-muted">
          The proof window is not currently open on this deal.
        </section>
      ) : youSubmitted ? (
        <section className="card space-y-3 px-5 py-5">
          <h3 className="text-[15px] font-semibold text-ink">
            Your proof is in
          </h3>
          <p className="text-[13.5px] leading-relaxed text-muted">
            We're waiting on the other side. If they don't submit within 24
            hours, the decision favors you.
          </p>
          <Link
            to={`/deal/${deal.id}/status`}
            className="btn-secondary w-full"
          >
            View status
          </Link>
        </section>
      ) : (
        <form onSubmit={submit} className="card space-y-4 px-5 py-5">
          <ProofUpload role={actorRole} value={draft} onChange={setDraft} />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus className="h-4 w-4" />
            )}
            {submitting ? "Submitting..." : "Submit proof"}
          </button>
        </form>
      )}
    </div>
  );
}
