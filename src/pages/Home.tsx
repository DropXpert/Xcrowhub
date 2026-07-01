import { Link } from "react-router-dom";
import {
  FilePlus2, Search, ShieldCheck, MessageCircle, Store,
  Zap, ChevronRight, QrCode, ArrowRight, CheckCircle2,
} from "lucide-react";
import { useMemo } from "react";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { resolveDealRole, isParticipant, dealNeedsAction } from "@/lib/dealRole";

const HOW_IT_WORKS = [
  { icon: FilePlus2,    step: "1", label: "Seller creates a deal", detail: "Set price, deadline & delivery proof requirements." },
  { icon: ShieldCheck,  step: "2", label: "Buyer pays into escrow", detail: "Funds are locked on-chain until conditions are met." },
  { icon: CheckCircle2, step: "3", label: "Funds released on delivery", detail: "Buyer confirms receipt and funds go to seller instantly." },
];

const QUICK_LINKS = [
  { to: "/create",   icon: FilePlus2,    label: "Your deals",  accent: "bg-accent-soft text-accent" },
  { to: "/listings", icon: Store,        label: "Marketplace", accent: "bg-warning/10 text-warning" },
  { to: "/find",     icon: Search,       label: "Find a deal", accent: "bg-accent-soft text-accent" },
  { to: "/support",  icon: MessageCircle,label: "Support",     accent: "bg-edge/60 text-muted" },
];

export default function Home() {
  const dealsMap = useDealStore((s) => s.deals);
  const session  = useAuthStore((s) => s.session);

  const allDeals = useMemo(() => Object.values(dealsMap), [dealsMap]);

  const actionCount = useMemo(() => {
    const addr = session?.address;
    if (!addr) return 0;
    return allDeals.filter(
      (d) => isParticipant(d, addr) && dealNeedsAction(d, resolveDealRole(d, session))
    ).length;
  }, [allDeals, session]);

  return (
    <div className="space-y-5">

      {/* ── Hero card ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent-soft/70 via-surface to-bg px-5 py-5 shadow-receipt">
        {/* Decorative blurred orb */}
        <div className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full bg-accent/12 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-20 rounded-full bg-gold/8 blur-2xl" />

        {/* Icon + label row */}
        <div className="relative mb-3.5 flex items-center gap-2">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-receipt">
            <ShieldCheck className="h-4.5 w-4.5 h-[18px] w-[18px]" />
            <span className="absolute inset-0 animate-pulse-ring rounded-xl border-2 border-accent/40" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">
              XcrowHub
            </p>
            <p className="text-[9px] text-muted">Crypto escrow for digital deals</p>
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-[22px] font-bold leading-[1.18] tracking-tight text-ink">
          Trade crypto safely.<br />
          <span className="text-gradient">Funds held</span> until delivery.
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Buyer pays to escrow. Seller delivers. Funds release on confirmation — with on-chain dispute protection if needed.
        </p>

        {/* Trust pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["NIM + USDT", "Trustless", "On-chain verified", "Dispute protection"].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-accent/20 bg-white/60 px-2 py-[3px] text-[9px] font-medium tracking-wide text-accent-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* ── CTAs ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Link
          to="/create/new"
          className="relative flex w-full items-center gap-2 overflow-hidden rounded-xl bg-accent px-4 py-3.5 text-[13px] font-semibold text-white shadow-lift transition hover:bg-accent-ink active:scale-[0.99]"
        >
          <span
            className="pointer-events-none absolute inset-0 animate-shimmer"
            style={{
              background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.10) 50%,transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
          <FilePlus2 className="h-4 w-4 shrink-0" />
          <span>Create a protected deal</span>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
        </Link>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/find"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-edge bg-surface py-3 text-[11px] font-medium text-ink shadow-receipt transition hover:border-accent/30 hover:bg-accent-soft/30 active:scale-[0.99]"
          >
            <Search className="h-3.5 w-3.5 text-muted" />
            Open deal
          </Link>
          <Link
            to="/scan"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-edge bg-surface py-3 text-[11px] font-medium text-ink shadow-receipt transition hover:border-accent/30 hover:bg-accent-soft/30 active:scale-[0.99]"
          >
            <QrCode className="h-3.5 w-3.5 text-muted" />
            Scan to pay
          </Link>
        </div>
      </section>

      {/* ── Action nudge ────────────────────────────────────────── */}
      {actionCount > 0 && (
        <Link
          to="/create"
          className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/8 px-4 py-3 transition hover:bg-warning/12 active:scale-[0.99]"
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-warning/15">
            <Zap className="h-4 w-4 text-warning" />
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-warning/40" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold text-ink">
              {actionCount} deal{actionCount > 1 ? "s" : ""} need{actionCount === 1 ? "s" : ""} your attention
            </p>
            <p className="text-[10px] text-muted">Go to Your deals</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      )}

      {/* ── How it works — vertical timeline ────────────────────── */}
      <section className="space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">How it works</p>
        <div className="rounded-xl border border-edge bg-surface shadow-receipt">
          {HOW_IT_WORKS.map(({ icon: Icon, step, label, detail }, i) => (
            <div
              key={step}
              className={`flex items-start gap-3 px-4 py-3.5 ${i < HOW_IT_WORKS.length - 1 ? "border-b border-edge/60" : ""}`}
            >
              {/* Step bubble */}
              <div className="relative shrink-0">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft">
                  <Icon className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-white shadow-receipt">
                  {step}
                </span>
              </div>
              {/* Text */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[11.5px] font-semibold text-ink">{label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quick access ────────────────────────────────────────── */}
      <section className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Quick access</p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_LINKS.map(({ to, icon: Icon, label, accent }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-2.5 rounded-xl border border-edge bg-surface px-3.5 py-3 shadow-receipt transition hover:border-accent/30 hover:shadow-lift active:scale-[0.99]"
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${accent}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-medium text-ink">{label}</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-edge transition group-hover:text-muted" />
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
