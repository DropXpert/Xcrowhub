import { Link } from "react-router-dom";
import {
  ShieldCheck, FilePlus2, ArrowRight, Lock, CheckCircle2, QrCode,
} from "lucide-react";
import type { Currency } from "@/types/deal";
import { SkeletonDots } from "@/components/LoadingStates";

type Snapshot = Record<Currency, number>;

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * The signature jade gradient banner, icon-accent style (a floating ShieldCheck
 * bleeding off the corner). Content adapts:
 *  - connected with funds locked  → live "in escrow now" snapshot
 *  - otherwise (disconnected / no locked funds) → value-prop + primary CTA
 */
export function EscrowHero({
  connected,
  connecting,
  onConnect,
  snapshot,
  activeCount,
  actionCount,
}: {
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  snapshot: Snapshot;
  activeCount: number;
  actionCount: number;
}) {
  const hasEscrow = connected && (snapshot.USDT > 0 || snapshot.NIM > 0);

  return (
    <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-[#2F6F5E] to-[#173D33] p-5 text-white shadow-lift ring-1 ring-inset ring-white/10">
      {/* paper-grain wash + floating shield accent */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      <ShieldCheck className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-white/15 animate-float-y" />

      <div className="relative">
        {hasEscrow ? (
          <EscrowSnapshot
            snapshot={snapshot}
            activeCount={activeCount}
            actionCount={actionCount}
          />
        ) : (
          <ValueProp
            connected={connected}
            connecting={connecting}
            onConnect={onConnect}
          />
        )}
      </div>
    </section>
  );
}

function EscrowSnapshot({
  snapshot,
  activeCount,
  actionCount,
}: {
  snapshot: Snapshot;
  activeCount: number;
  actionCount: number;
}) {
  const amounts: string[] = [];
  if (snapshot.USDT > 0) amounts.push(`${fmt(snapshot.USDT)} USDT`);
  if (snapshot.NIM > 0) amounts.push(`${fmt(snapshot.NIM)} NIM`);

  return (
    <Link to="/create" className="block active:scale-[0.99] transition">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/75">
        <Lock className="h-3 w-3" />
        In escrow now
      </span>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[26px] font-bold leading-[1.1] tracking-tight tabular-nums">
        {amounts.map((a, i) => (
          <span key={a} className="inline-flex items-baseline">
            {a}
            {i < amounts.length - 1 && (
              <span className="mx-2 text-white/40">·</span>
            )}
          </span>
        ))}
      </p>

      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/85">
        <span>{activeCount} active</span>
        {actionCount > 0 && (
          <>
            <span className="text-white/40">·</span>
            <span className="font-semibold text-white">{actionCount} need you</span>
          </>
        )}
        <ArrowRight className="ml-auto h-4 w-4 text-white/70" />
      </p>
    </Link>
  );
}

function ValueProp({
  connected,
  connecting,
  onConnect,
}: {
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div>
      <h1 className="text-[24px] font-bold leading-[1.15] tracking-tight">
        Get paid safely.
        <br />
        Or get it all back.
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/80">
        Funds lock on-chain until the buyer confirms delivery.
      </p>

      {connected ? (
        <Link
          to="/create/new"
          className="relative mt-4 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-pill bg-white text-[14px] font-semibold text-[#1F4A3F] shadow-receipt transition active:scale-[0.98]"
        >
          <span
            className="pointer-events-none absolute inset-0 animate-shimmer"
            style={{
              background: "linear-gradient(90deg,transparent 0%,rgba(47,111,94,0.10) 50%,transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
          <FilePlus2 className="h-4 w-4" />
          Create a deal
          <ArrowRight className="h-4 w-4 opacity-70" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-white text-[14px] font-semibold text-[#1F4A3F] shadow-receipt transition active:scale-[0.98] disabled:opacity-70"
        >
          {connecting ? <SkeletonDots label="Connecting wallet" /> : <FilePlus2 className="h-4 w-4" />}
          {connecting ? "Connecting…" : "Create a deal"}
          {!connecting && <ArrowRight className="h-4 w-4 opacity-70" />}
        </button>
      )}

      <Link
        to="/scan"
        className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-pill border border-white/25 bg-white/10 text-[14px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-[0.98]"
      >
        <QrCode className="h-4 w-4" />
        Scan to pay
      </Link>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/80">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" /> Funds held on-chain
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Released on confirm
        </span>
      </div>
    </div>
  );
}
