import { ExternalLink, Apple, Play } from "lucide-react";
import {
  nimiqPayDeeplink,
  NIMIQ_PAY_IOS,
  NIMIQ_PAY_ANDROID,
  NIMIQ_PAY_SITE,
} from "@/lib/host";

export function OpenInNimiqPay() {
  return (
    <div className="mx-auto flex min-h-full max-w-app flex-col items-center justify-center gap-7 px-6 py-14 text-center">
      <img src="/logo-icon.png" alt="XcrowHub" className="h-16 w-16 shrink-0 rounded-2xl" />

      <div className="space-y-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">XcrowHub</p>
        <h1 className="text-[20px] font-bold leading-snug tracking-tight text-ink">
          Open inside Nimiq Pay
        </h1>
        <p className="text-[14px] leading-relaxed text-muted">
          XcrowHub is a Nimiq Pay mini app. Open it in the Nimiq Pay wallet to connect,
          pay into escrow, and manage protected deals.
        </p>
      </div>

      <a href={nimiqPayDeeplink()} className="btn-primary w-full max-w-xs">
        <ExternalLink className="h-4 w-4" />
        Open in Nimiq Pay
      </a>

      <div className="w-full max-w-xs space-y-2.5">
        <p className="text-[12px] uppercase tracking-wider text-muted">Don't have the app?</p>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={NIMIQ_PAY_IOS}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-[13px]"
          >
            <Apple className="h-4 w-4" />
            iOS
          </a>
          <a
            href={NIMIQ_PAY_ANDROID}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-[13px]"
          >
            <Play className="h-4 w-4" />
            Android
          </a>
        </div>
        <a
          href={NIMIQ_PAY_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[12.5px] text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          Learn about Nimiq Pay
        </a>
      </div>
    </div>
  );
}
