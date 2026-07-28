import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Inbox, MessageCircle } from "lucide-react";
import { useDealStore } from "@/store/dealStore";
import { PageHeader } from "@/components/PageHeader";
import { DealCard } from "@/components/DealCard";
import { EmptyState } from "@/components/EmptyState";

export default function AdminDashboard() {
  const dealsMap = useDealStore((s) => s.deals);
  const deals = useMemo(
    () =>
      Object.values(dealsMap)
        .filter(
          (d) =>
            d.status === "under_admin_review" || d.status === "proof_window"
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [dealsMap]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin"
        title="Disputes & proof reviews"
        back={false}
      />

      <Link
        to="/admin/support"
        className="card flex items-center gap-3 px-4 py-3.5 hover:shadow-lift transition"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft">
          <MessageCircle className="h-4 w-4 text-accent" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink">Support inbox</p>
          <p className="text-[12.5px] text-muted">Reply to user deal queries</p>
        </div>
        <span className="text-muted text-[13px]">›</span>
      </Link>

      <section className="rounded-card border border-edge bg-accent-soft/40 px-4 py-3.5">
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>
            Deals in the proof window or awaiting an admin decision show up
            here. Decide release, refund, or partial split.
          </span>
        </p>
      </section>

      {deals.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No open disputes"
          description="Anything that lands in proof review or admin review will show up here."
          action={
            <Link to="/" className="btn-secondary">
              Back to home
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {deals.map((d) => (
            <li key={d.id}>
              <DealCard deal={d} to={`/admin/deal/${d.id}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
