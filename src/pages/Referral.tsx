import { useEffect, useState } from "react";
import { Gift, Copy, Check, Users, Coins, Share2, Info } from "lucide-react";
import { useReferralStore } from "@/store/referralStore";
import { useAuthStore } from "@/store/authStore";
import { buildReferralLink } from "@/lib/referral";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function Referral() {
  const session = useAuthStore((s) => s.session);
  const summary = useReferralStore((s) => s.summary);
  const loading = useReferralStore((s) => s.loading);
  const claiming = useReferralStore((s) => s.claiming);
  const error = useReferralStore((s) => s.error);
  const load = useReferralStore((s) => s.load);
  const claim = useReferralStore((s) => s.claim);

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [claimedMsg, setClaimedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session?.token) load();
  }, [session?.token, load]);

  const link = summary ? buildReferralLink(summary.code) : "";

  function copy(kind: "code" | "link", value: string) {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  async function share() {
    if (!link) return;
    const data = {
      title: "XcrowHub",
      text: "Trade safely on XcrowHub — protected crypto deals, zero buyer fees.",
      url: link,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else copy("link", link);
    } catch {
      // user cancelled share sheet
    }
  }

  async function onClaim(currency: "NIM" | "USDT") {
    const res = await claim(currency);
    if (res) {
      setClaimedMsg(`Claim submitted for ${res.amount} ${currency}. It will be paid to your wallet shortly.`);
      setTimeout(() => setClaimedMsg(null), 6000);
    }
  }

  if (!session) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Rewards" title="Refer & earn" />
        <EmptyState
          icon={<Gift className="h-5 w-5" />}
          title="Connect your wallet"
          description="Connect to get your referral link and track earnings."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Rewards" title="Refer & earn" />

      {/* How it works */}
      <section className="card px-5 py-4 flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Gift className="h-[18px] w-[18px]" />
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink">
          Share your link. When someone you refer completes a sale on the
          marketplace, you earn{" "}
          <span className="font-semibold">10% of the platform fee</span> on it —
          credited to your claimable balance.
        </p>
      </section>

      {/* Code + link */}
      <section className="card px-5 py-5 space-y-4">
        <div className="space-y-1.5">
          <p className="field-label">Your referral code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-edge bg-bg px-3 py-2.5 font-mono text-[17px] font-semibold tracking-[0.2em] text-ink">
              {summary?.code ?? (loading ? "······" : "—")}
            </code>
            <button
              type="button"
              onClick={() => summary && copy("code", summary.code)}
              disabled={!summary}
              className="btn-secondary shrink-0 px-3"
              title="Copy code"
            >
              {copied === "code" ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="field-label">Share link</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              className="input flex-1 text-[13px] text-muted"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => link && copy("link", link)}
              disabled={!link}
              className="btn-secondary shrink-0 px-3"
              title="Copy link"
            >
              {copied === "link" ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button type="button" onClick={share} disabled={!link} className="btn-primary w-full">
            <Share2 className="h-4 w-4" />
            Share link
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="card px-5 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-bg text-muted">
              <Users className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-[19px] font-semibold tabular-nums leading-none text-ink">
                {summary?.referralCount ?? 0}
              </p>
              <p className="field-label mt-1">Referrals</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-bg text-muted">
              <Coins className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-[19px] font-semibold tabular-nums leading-none text-ink">
                {summary && summary.lifetime.length > 0
                  ? summary.lifetime.map((l) => `${l.total} ${l.currency}`).join(" · ")
                  : "0"}
              </p>
              <p className="field-label mt-1">Lifetime earned</p>
            </div>
          </div>
        </div>
      </section>

      {/* Claimable balance */}
      <section className="card px-5 py-5 space-y-3">
        <h3 className="text-[15px] font-semibold text-ink">Claimable balance</h3>
        {claimedMsg && (
          <p className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
            {claimedMsg}
          </p>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {!summary || summary.balances.length === 0 ? (
          <p className="text-[13px] text-muted">
            No balance yet. Earnings appear here when your referrals complete sales.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {summary.balances.map((b) => (
              <li
                key={b.currency}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-bg px-3.5 py-3"
              >
                <span className="text-[15px] font-semibold tabular-nums text-ink">
                  {b.accrued} <span className="text-muted">{b.currency}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onClaim(b.currency)}
                  disabled={claiming === b.currency || Number(b.accrued) <= 0}
                  className="btn-primary px-4 py-2 text-[13px]"
                >
                  {claiming === b.currency ? "Claiming…" : "Claim"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Claims are paid to the wallet you refer from. Payout is processed
          automatically once submitted.
        </p>
      </section>
    </div>
  );
}
