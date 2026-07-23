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
    <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-[#2F6F5E] to-[#173D33] p-5 text-white shadow-lift ring-1 ring-inset ring-white/10 lg:min-h-[306px] lg:rounded-[28px] lg:bg-[linear-gradient(120deg,#245f50_0%,#164438_38%,#102f28_100%)] lg:p-10">
      {/* paper-grain wash + floating shield accent */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      <span className="pointer-events-none absolute -right-24 -top-36 hidden h-[420px] w-[420px] rounded-full border border-white/10 bg-white/[0.025] lg:block" />
      <span className="pointer-events-none absolute -bottom-48 right-40 hidden h-[360px] w-[360px] rounded-full border border-white/[0.07] lg:block" />
      <ShieldCheck className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-white/15 animate-float-y lg:right-8 lg:top-7 lg:h-32 lg:w-32 lg:text-white/10" />

      <div className="relative h-full">
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
    <Link
      to="/create"
      className="block transition active:scale-[0.99] lg:flex lg:min-h-[226px] lg:items-center lg:justify-between lg:gap-10"
    >
      <div>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/75">
        <Lock className="h-3 w-3" />
        In escrow now
      </span>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[26px] font-bold leading-[1.1] tracking-tight tabular-nums lg:mt-5 lg:text-[42px]">
        {amounts.map((a, i) => (
          <span key={a} className="inline-flex items-baseline">
            {a}
            {i < amounts.length - 1 && (
              <span className="mx-2 text-white/40">·</span>
            )}
          </span>
        ))}
      </p>

      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/85 lg:mt-4 lg:text-[15px]">
        <span>{activeCount} active</span>
        {actionCount > 0 && (
          <>
            <span className="text-white/40">·</span>
            <span className="font-semibold text-white">{actionCount} need you</span>
          </>
        )}
        <ArrowRight className="ml-auto h-4 w-4 text-white/70 lg:hidden" />
      </p>
      </div>

      <span className="hidden h-12 items-center gap-2 rounded-pill border border-white/20 bg-white/10 px-6 text-[14px] font-semibold text-white backdrop-blur-sm lg:inline-flex">
        Open your deals
        <ArrowRight className="h-4 w-4" />
      </span>
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
    <div className="lg:grid lg:min-h-[226px] lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:items-center lg:gap-12">
      <div>
        <span className="mb-4 hidden w-fit items-center gap-2 rounded-pill border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75 lg:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" />
          Payment protection
        </span>
      <h1 className="text-[24px] font-bold leading-[1.15] tracking-tight lg:max-w-[520px] lg:text-[44px] lg:leading-[1.05]">
        Get paid safely.
        <br />
        Or get it all back.
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/80 lg:mt-4 lg:max-w-[500px] lg:text-[15px]">
        Funds lock on-chain until the buyer confirms delivery.
      </p>
      </div>

      <div className="lg:rounded-[22px] lg:border lg:border-white/15 lg:bg-white/[0.07] lg:p-5 lg:shadow-[0_18px_60px_rgba(0,0,0,0.14)] lg:backdrop-blur-md">
      <p className="hidden text-[12px] font-medium text-white/65 lg:block">Choose an action</p>
      <div className="lg:mt-3 lg:space-y-3">
      {connected ? (
        <Link
          to="/create/new"
          className="relative mt-4 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-pill bg-white text-[14px] font-semibold text-[#1F4A3F] shadow-receipt transition active:scale-[0.98] lg:mt-0"
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
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-white text-[14px] font-semibold text-[#1F4A3F] shadow-receipt transition active:scale-[0.98] disabled:opacity-70 lg:mt-0"
        >
          {connecting ? <SkeletonDots label="Connecting wallet" /> : <FilePlus2 className="h-4 w-4" />}
          {connecting ? "Connecting…" : "Create a deal"}
          {!connecting && <ArrowRight className="h-4 w-4 opacity-70" />}
        </button>
      )}

      <Link
        to="/scan"
        className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-pill border border-white/25 bg-white/10 text-[14px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-[0.98] lg:mt-0 lg:h-12"
      >
        <QrCode className="h-4 w-4" />
        Scan to pay
      </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/80 lg:mt-4 lg:justify-center">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" /> Funds held on-chain
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Released on confirm
        </span>
      </div>
      </div>
    </div>
  );
}
