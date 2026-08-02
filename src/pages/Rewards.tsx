import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Gift, RefreshCw, Sparkles, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TxHashLink } from "@/components/TxHashLink";
import { useCashbackStore } from "@/store/cashbackStore";
import { useIsAdmin } from "@/store/authStore";
import { CashbackScratchCard } from "@/components/CashbackScratchCard";

type RewardsTab = "available" | "paid" | "all";

function formatDate(value: string | null | undefined) {
  if (!value) return "Recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function Rewards() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<RewardsTab>("available");
  const historyLoading = useCashbackStore((state) => state.historyLoading);
  const rewards = useCashbackStore((state) => state.rewards);
  const unclaimed = useCashbackStore((state) => state.unclaimed);
  const totalEarnedNim = useCashbackStore((state) => state.totalEarnedNim);
  const totalPaidNim = useCashbackStore((state) => state.totalPaidNim);
  const totalPendingNim = useCashbackStore((state) => state.totalPendingNim);
  const loadHistory = useCashbackStore((state) => state.loadHistory);
  const retryPayout = useCashbackStore((state) => state.retryPayout);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const visibleRewards = useMemo(
    () => (tab === "paid" ? rewards.filter((reward) => reward.payoutStatus === "paid") : rewards),
    [rewards, tab],
  );

  return (
    <div className="space-y-4 lg:mx-auto lg:max-w-4xl">
      <PageHeader
        eyebrow="Rewards"
        title="Cashback history"
        right={
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
            className="grid h-9 w-9 place-items-center rounded-lg border border-edge bg-surface text-muted transition hover:text-accent disabled:opacity-50"
            aria-label="Refresh cashback history"
          >
            <RefreshCw className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`} />
          </button>
        }
      />

      {isAdmin ? <CashbackScratchCard dealId="admin-preview" previewRewardNim={25} /> : null}

      <section className="cashback-card px-5 py-5">
        <div className="cashback-card-glow" aria-hidden="true" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#91d9bd]">Marketplace cashback</p>
            <p className="mt-2 text-[34px] font-black leading-none tracking-tight text-white tabular-nums">
              {totalEarnedNim.toLocaleString()} <span className="text-[17px] text-[#f3c969]">NIM</span>
            </p>
            <p className="mt-2 text-[12px] text-white/60">Total revealed across completed purchases</p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#f3c969]">
            <WalletCards className="h-5 w-5" />
          </span>
        </div>
        <div className="relative z-10 mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/10 py-3">
          <div className="px-2 text-center">
            <p className="text-[16px] font-bold text-white tabular-nums">{unclaimed.length}</p>
            <p className="mt-1 text-[9.5px] uppercase tracking-wider text-white/45">Ready</p>
          </div>
          <div className="px-2 text-center">
            <p className="text-[16px] font-bold text-white tabular-nums">{totalPaidNim.toLocaleString()}</p>
            <p className="mt-1 text-[9.5px] uppercase tracking-wider text-white/45">Paid NIM</p>
          </div>
          <div className="px-2 text-center">
            <p className="text-[16px] font-bold text-white tabular-nums">{totalPendingNim.toLocaleString()}</p>
            <p className="mt-1 text-[9.5px] uppercase tracking-wider text-white/45">Pending</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-accent/20 bg-accent-soft/45 px-4 py-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[12.5px] leading-relaxed text-muted">
            Buyers receive one scratch card after an eligible NIM marketplace purchase is released. Results are fixed on the server and positive rewards are sent to the connected Nimiq wallet.
          </p>
        </div>
      </section>

      <div className="form-tabs" role="tablist" aria-label="Cashback history filters">
        {([
          ["available", `Available${unclaimed.length ? ` (${unclaimed.length})` : ""}`],
          ["paid", "Paid"],
          ["all", "All activity"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className="form-tab"
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "available" ? (
        unclaimed.length ? (
          <ul className="space-y-2.5">
            {unclaimed.map((item) => (
              <li key={item.dealId}>
                <Link
                  to={`/deal/${item.dealId}/status`}
                  className="card group flex items-center gap-3 px-4 py-3.5 transition hover:border-accent/30 hover:shadow-lift"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
                    <Gift className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{item.dealTitle}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">Completed {formatDate(item.releasedAt)}</p>
                  </div>
                  <span className="shrink-0 text-[11.5px] font-semibold text-warning">Scratch card ready</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRewards title="No cards waiting" detail="New cards appear here after eligible marketplace purchases are completed." />
        )
      ) : visibleRewards.length ? (
        <ul className="space-y-2.5">
          {visibleRewards.map((reward) => (
            <li key={reward.id} className="card px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${reward.amountNim > 0 ? "bg-accent-soft text-accent" : "bg-bg text-muted"}`}>
                  {reward.payoutStatus === "paid" ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <Clock3 className="h-[18px] w-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/deal/${reward.dealId}/status`} className="block truncate text-[13.5px] font-semibold text-ink hover:text-accent">
                    {reward.dealTitle || reward.dealId}
                  </Link>
                  <p className="mt-0.5 text-[11.5px] text-muted">Revealed {formatDate(reward.revealedAt)}</p>
                  {reward.payoutTxHash ? <div className="mt-2"><TxHashLink hash={reward.payoutTxHash} label="reward tx" /></div> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-[15px] font-bold tabular-nums ${reward.amountNim > 0 ? "text-accent" : "text-muted"}`}>
                    {reward.amountNim > 0 ? `+${reward.amountNim.toLocaleString()} NIM` : "No reward"}
                  </p>
                  {reward.payoutStatus === "pending" ? (
                    <button
                      type="button"
                      onClick={() => void retryPayout(reward.id, reward.dealId)}
                      className="mt-1 text-[11px] font-semibold text-warning"
                    >
                      Retry payout
                    </button>
                  ) : reward.payoutStatus === "paid" ? (
                    <p className="mt-1 text-[10.5px] text-muted">Paid</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRewards title={tab === "paid" ? "No paid rewards yet" : "No reward activity yet"} detail="Your revealed cashback cards will appear here." />
      )}
    </div>
  );
}

function EmptyRewards({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="card px-5 py-8 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
        <Gift className="h-5 w-5" />
      </span>
      <h2 className="mt-3 text-[14px] font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">{detail}</p>
    </section>
  );
}
