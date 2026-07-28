// Detect whether the app is running inside the Nimiq Pay host (which injects
// window.nimiq / window.nimiqPay). Outside the host there's no wallet runtime,
// Normal browsers use Nimiq Hub instead of an injected provider.

export function isNimiqPayHost(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { nimiq?: unknown; nimiqPay?: unknown };
  return Boolean(w.nimiq || w.nimiqPay);
}

// The canonical mini-app URL — always app.xcrowhub.com in production.
export const APP_URL = "https://app.xcrowhub.com";
export const NIMIQ_WEB_WALLET_URL = "https://wallet.nimiq.com";

// Read a pending referral code without importing the referral module (keeps this
// lightweight file dependency-free and avoids pulling Supabase into the landing
// bundle). Must match REF_STORAGE_KEY in lib/referral.ts.
function pendingRefCode(): string | null {
  try {
    return localStorage.getItem("xcrowhub.ref");
  } catch {
    return null;
  }
}

function withRef(url: string): string {
  const ref = pendingRefCode();
  if (!ref) return url;
  return url + (url.includes("?") ? "&" : "?") + "ref=" + encodeURIComponent(ref);
}

// Deep link that opens the mini app inside Nimiq Pay. Any pending referral code
// is forwarded on the inner app URL so attribution survives the www → app hop.
// An optional in-app path (e.g. "/deal/PH-1234/status") deep-links to that route.
export function nimiqPayDeeplink(path = ""): string {
  const root = import.meta.env.PROD
    ? APP_URL
    : typeof window !== "undefined"
    ? window.location.origin
    : APP_URL;
  const target = path ? root.replace(/\/$/, "") + path : root;
  return `nimiqpay://miniapp?url=${encodeURIComponent(withRef(target))}`;
}

// Bot handle for the Telegram notification link (t.me/<handle>).
export const TELEGRAM_BOT = "xcrowhub_bot";

// Official Nimiq Pay download links (verified).
export const NIMIQ_PAY_IOS = "https://apps.apple.com/us/app/nimiq-pay/id6471844738";
export const NIMIQ_PAY_ANDROID = "https://play.google.com/store/apps/details?id=com.nimiq.pay";
export const NIMIQ_PAY_SITE = "https://www.nimiq.com/nimiq-pay/";

// Pick the right store for the visitor's platform. Desktop / unknown → the
// Nimiq Pay marketing site (has both store buttons + web wallet).
export function nimiqPayStoreUrl(): string {
  if (typeof navigator === "undefined") return NIMIQ_PAY_SITE;
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return NIMIQ_PAY_ANDROID;
  if (/iphone|ipad|ipod/i.test(ua)) return NIMIQ_PAY_IOS;
  return NIMIQ_PAY_SITE;
}

// Click handler for a Nimiq Pay deeplink CTA that gracefully falls back to the
// app store when the deeplink silently fails (i.e. the app isn't installed).
// Approach: navigate to the deeplink, then in 1500ms if the tab is still
// visible we assume no handler picked it up and redirect to the store.
// The visibility check matters — if the OS handed control to the app, the tab
// gets hidden and we skip the store fallback.
export function openNimiqPayOrStore(deeplinkUrl: string) {
  return (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const start = Date.now();
    // Fire the deeplink. Assigning window.location keeps the current tab so
    // the visibility check below still applies to it.
    window.location.href = deeplinkUrl;
    setTimeout(() => {
      // If the app opened, the page will have been backgrounded and this
      // callback either won't fire at all (mobile Safari suspends timers) or
      // will fire while document.hidden is true.
      const stillHere = !document.hidden && Date.now() - start < 2500;
      if (stillHere) {
        window.location.href = nimiqPayStoreUrl();
      }
    }, 1500);
  };
}
