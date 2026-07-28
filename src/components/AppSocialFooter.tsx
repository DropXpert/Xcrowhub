import { Send } from "lucide-react";

const socialLinkClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-edge bg-surface px-4 py-2.5 text-[12.5px] font-semibold text-muted shadow-sm transition hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function AppSocialFooter() {
  return (
    <footer className="mt-10 border-t border-edge/80 pb-2 pt-6">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Follow XcrowHub
        </p>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <a
            href="https://x.com/xcrowhub"
            target="_blank"
            rel="noopener noreferrer"
            className={socialLinkClass}
            aria-label="Follow XcrowHub on X"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
            </svg>
            X
          </a>
          <a
            href="https://t.me/xcrowhubtelegram"
            target="_blank"
            rel="noopener noreferrer"
            className={socialLinkClass}
            aria-label="Join XcrowHub on Telegram"
          >
            <Send className="h-3.5 w-3.5" />
            Telegram
          </a>
        </div>
      </div>
    </footer>
  );
}
