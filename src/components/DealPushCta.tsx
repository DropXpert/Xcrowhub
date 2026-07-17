import { useEffect, useState } from "react";
import { Bell, ArrowRight, X } from "lucide-react";
import { SkeletonDots } from "@/components/LoadingStates";
import { useTelegramLink } from "@/lib/useTelegramLink";

/* Inline Telegram-push CTA shown on the Deal Status / Timeline page for
   participants who haven't linked yet. Once linked (or dismissed for this
   session), the banner disappears. */

const DISMISS_KEY = "xcrowhub.dealPushCta.dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function DealPushCta() {
  const { state, busy, error, connect } = useTelegramLink();
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  useEffect(() => {
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* sessionStorage blocked — dismiss is in-memory only */
      }
    }
  }, [dismissed]);

  if (dismissed || state !== "unlinked") return null;

  return (
    <div className="relative flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-3 pr-9">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-white">
        <Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">
          Get push notifications on Telegram
        </p>
        <p className="text-[12.5px] leading-snug text-muted">
          Ping you when the other side moves — payment, delivery, disputes.
        </p>
        {error && (
          <p className="mt-1 text-[12px] leading-snug text-rose-600" role="alert">
            {error} — tap Connect to retry.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className="shrink-0 inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? (
          <SkeletonDots label="Connecting Telegram" />
        ) : (
          <>
            Connect
            <ArrowRight className="h-3 w-3" />
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1 text-muted transition hover:bg-black/5 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
