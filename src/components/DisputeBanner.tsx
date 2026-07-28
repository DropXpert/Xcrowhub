import { Link } from "react-router-dom";
import { AlertTriangle, Scale, ShieldCheck } from "lucide-react";
import type { Deal } from "@/types/deal";
import { useAuthStore } from "@/store/authStore";
import { resolveDealRole } from "@/lib/dealRole";

function timeLeft(iso?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  return h >= 1 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Prominent, can't-miss banner shown while a deal is in dispute. Because Nimiq
 * Pay has no reliable push, this is what the counterparty sees the instant they
 * open the app — their cue to submit proof before the window closes.
 */
export function DisputeBanner({ deal }: { deal: Deal }) {
  const session = useAuthStore((s) => s.session);
  if (deal.status !== "proof_window" && deal.status !== "under_admin_review") return null;

  const role = resolveDealRole(deal, session);
  const isParty = role === "buyer" || role === "seller";

  // Already with an admin → calm, informational.
  if (deal.status === "under_admin_review") {
    return (
      <Note
        icon={<Scale className="h-[18px] w-[18px]" />}
        title="Dispute under review"
        body="An admin is reviewing the evidence from both sides and will decide the outcome. No action is needed from you right now."
      />
    );
  }

  const submitted =
    role === "seller"
      ? deal.sellerProofStatus === "submitted"
      : role === "buyer"
        ? deal.buyerProofStatus === "submitted"
        : false;
  const left = timeLeft(deal.proofDeadlineAt);

  // Party who hasn't submitted yet → urgent call to action.
  if (isParty && !submitted) {
    return (
      <section className="rounded-card border border-[#E0A23C]/45 bg-[#FBF1DC] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E0A23C]/20 text-[#A56A09]">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[14px] font-semibold text-ink">Action needed — a dispute is open</p>
            <p className="text-[13px] leading-relaxed text-muted">
              Submit your proof{left ? <> within <span className="font-semibold text-ink">{left}</span></> : " before the window closes"}.
              Disputes are decided on evidence — without it, the deal goes to an admin to review.
            </p>
          </div>
        </div>
        <Link to={`/deal/${deal.id}/proof`} className="btn-primary mt-3 w-full">
          <ShieldCheck className="h-4 w-4" />
          Submit your proof
        </Link>
      </section>
    );
  }

  // Submitted, or a non-party viewer → status note.
  return (
    <Note
      icon={<Scale className="h-[18px] w-[18px]" />}
      title={submitted ? "Your proof is in" : "Dispute open — proof window"}
      body={
        submitted
          ? `Proof recorded. When the window closes${left ? ` (in ${left})` : ""}, an admin reviews the dispute and decides the outcome.`
          : `Both sides have until the deadline${left ? ` (${left} left)` : ""} to submit proof. The dispute is then reviewed by an admin.`
      }
    />
  );
}

function Note({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <section className="rounded-card border border-edge bg-surface px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          {icon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[14px] font-semibold text-ink">{title}</p>
          <p className="text-[13px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>
    </section>
  );
}
