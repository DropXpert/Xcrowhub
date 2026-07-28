import { useEffect, useState } from "react";
import { Check, Copy, Gift, Share2, Users } from "lucide-react";
import { useReferralStore } from "@/store/referralStore";
import { useAuthStore } from "@/store/authStore";
import { buildReferralLink } from "@/lib/referral";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonBlock } from "@/components/LoadingStates";

export default function Referral() {
  const session = useAuthStore((s) => s.session);
  const summary = useReferralStore((s) => s.summary);
  const loading = useReferralStore((s) => s.loading);
  const error = useReferralStore((s) => s.error);
  const load = useReferralStore((s) => s.load);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (session?.token) void load();
  }, [session?.token, load]);

  const link = summary ? buildReferralLink(summary.code) : "";

  function copy(kind: "code" | "link", value: string) {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  async function share() {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "XcrowHub",
          text: "Join XcrowHub through my referral link.",
          url: link,
        });
      } else {
        copy("link", link);
      }
    } catch {
      // The user cancelled the share sheet.
    }
  }

  if (!session) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Rewards" title="Refer and earn" />
        <EmptyState
          icon={<Gift className="h-5 w-5" />}
          title="Connect your wallet"
          description="Connect to get your XcrowHub referral link."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-4xl">
      <PageHeader eyebrow="Rewards" title="Refer and earn" />

      <section className="card flex gap-3 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Gift className="h-[18px] w-[18px]" />
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink">
          Share your personal XcrowHub link. Sign-ups and completed deals made
          through it are recorded automatically for eligible referral campaigns.
        </p>
      </section>

      <section className="card flex items-center justify-between gap-4 px-5 py-5" aria-label="Referral count">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent-soft text-accent">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="field-label">Total referrals</p>
            <p className="mt-1 text-[12.5px] text-muted">
              People who joined using your link
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {loading && !summary ? (
            <SkeletonBlock className="h-9 w-12" />
          ) : (
            <p className="text-[30px] font-bold leading-none tabular-nums text-ink">
              {summary?.referralCount ?? "—"}
            </p>
          )}
          {error && !summary && (
            <button type="button" onClick={() => void load()} className="mt-1 text-[11px] font-semibold text-danger">
              Retry
            </button>
          )}
        </div>
      </section>

      <section className="card space-y-4 px-5 py-5">
        <div className="space-y-1.5">
          <p className="field-label">Your XcrowHub referral code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-edge bg-bg px-3 py-2.5 font-mono text-[17px] font-semibold tracking-[0.2em] text-ink">
              {summary?.code ?? (loading ? <SkeletonBlock className="h-6 w-28" /> : "-")}
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
    </div>
  );
}
