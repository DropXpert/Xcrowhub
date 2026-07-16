// Referral capture + attribution.
//
// A referral code rides into the app this way:
//   1. Someone opens the share link (app.xcrowhub.com/?ref=CODE). In a browser
//      this hits the Nimiq Pay gate; host.ts forwards the code on the deep link
//      so it lands in the app URL the in-app webview loads.
//   2. Inside Nimiq Pay the webview loads app.xcrowhub.com/?ref=CODE and the
//      code is captured from the URL (the in-app webview has its own storage,
//      so the code must travel in the URL, not via browser localStorage).
//
// captureRefFromUrl() persists the code for the current origin; once the wallet
// authenticates, applyPendingReferral() binds the relationship server-side.

import { getSupabaseClient, isSupabaseConfiguredForClient } from "./supabase";
import { APP_URL } from "./host";

export const REF_STORAGE_KEY = "xcrowhub.ref";
const CODE_RE = /^[A-Za-z0-9]{4,12}$/;

export function captureRefFromUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && CODE_RE.test(code) && !getPendingRef()) {
      localStorage.setItem(REF_STORAGE_KEY, code.toUpperCase());
    }
  } catch {
    // ignore (no window / storage blocked)
  }
}

export function getPendingRef(): string | null {
  try {
    return localStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRef(): void {
  try {
    localStorage.removeItem(REF_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Bind the connected wallet to its referrer. Safe to call repeatedly: the RPC is
// first-touch (ignores wallets that are already referred) and we only clear the
// pending code once the call succeeds, so a transient failure is retried later.
export async function applyPendingReferral(): Promise<void> {
  const code = getPendingRef();
  if (!code || !isSupabaseConfiguredForClient()) return;
  try {
    const { error } = await getSupabaseClient().rpc("attach_referral", { p_code: code });
    if (!error) clearPendingRef();
  } catch {
    // keep the code for the next authenticated load
  }
}

// Shareable mini-app link. Points at the app URL (app.xcrowhub.com), which gates
// into Nimiq Pay and forwards the code on the deep link so it reaches the in-app
// webview — where it's actually captured and bound on login.
export function buildReferralLink(code: string): string {
  return `${APP_URL}/?ref=${encodeURIComponent(code)}`;
}
