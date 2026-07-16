import { ChevronRight, Check, Loader2 } from "lucide-react";
import { useTelegramLink } from "@/lib/useTelegramLink";

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function TelegramConnectCard() {
  const { state, username, busy, error, connect, disconnect } = useTelegramLink();

  if (state === "linked") {
    return (
      <div className="card flex items-center gap-3 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <TelegramIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            Telegram connected <Check className="h-3.5 w-3.5 text-accent" />
          </p>
          <p className="truncate text-[13px] text-muted">
            {username ? `@${username} · ` : ""}Alerts for deals, offers &amp; disputes are on.
          </p>
        </div>
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="shrink-0 text-[13px] font-medium text-muted transition hover:text-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlink"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={connect}
        disabled={busy || state === "loading"}
        className="card flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-bg disabled:opacity-60"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <TelegramIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">Connect Telegram</p>
          <p className="text-[13px] text-muted">
            Get notified when a deal, offer or dispute needs you — even when the app is closed.
          </p>
        </div>
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        )}
      </button>
      {error && (
        <p className="px-1 text-[12.5px] text-rose-600" role="alert">
          {error} — try again.
        </p>
      )}
    </div>
  );
}
