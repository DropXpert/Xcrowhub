import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Smartphone, Wallet, Shield, Zap } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useTourStore } from "@/store/tourStore";
import {
  isNimiqPayHost,
  NIMIQ_WEB_WALLET_URL,
  nimiqPayDeeplink,
} from "@/lib/host";

/**
 * First-open welcome modal. Shown when the app boots and no wallet session
 * exists yet — prompts the user to connect before anything else. A successful
 * first connection registers the wallet for the new-user welcome and section
 * guides, then returns the user to Home.
 *
 * We deliberately do NOT persist a "seen" flag: the modal is gated purely by
 * `session == null`, so it re-appears any time the user is signed out. That
 * matches the intent: signed-out users should always see a clear connect path.
 */
export function ConnectWelcomeModal() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const connect = useAuthStore((s) => s.connect);
  const inNimiqPay = isNimiqPayHost();

  async function connectAndWelcome() {
    await connect();
    const connectedSession = useAuthStore.getState().session;
    if (!connectedSession?.address) return;
    useTourStore.getState().registerConnectedUser(connectedSession.address);
    navigate("/", { replace: true });
  }

  // Hide while auth is still restoring — otherwise the modal flashes on cold
  // load before applyStoredSession() resolves.
  if (loading || session) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9997] grid place-items-center bg-black/60 backdrop-blur-sm px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-welcome-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface shadow-lift">
        <div className="flex flex-col items-center px-6 pt-7 pb-4 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Wallet className="h-6 w-6" />
          </span>
          <h2
            id="connect-welcome-title"
            className="mt-4 text-[18px] font-bold text-ink"
          >
            Welcome to XcrowHub
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Protected escrow for crypto P2P deals. Connect with Nimiq Pay or
            your secure Nimiq browser wallet.
          </p>
        </div>

        <ul className="space-y-2.5 px-6 pb-5">
          <li className="flex items-start gap-2.5">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-[12.5px] text-muted">
              Funds stay locked until delivery is confirmed.
            </p>
          </li>
          <li className="flex items-start gap-2.5">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-[12.5px] text-muted">
              Zero fees on private deals. 1% only on marketplace listings.
            </p>
          </li>
        </ul>

        <div className="border-t border-edge px-6 py-4">
          <button
            type="button"
            onClick={connectAndWelcome}
            disabled={loading}
            className="btn-primary w-full py-2.5 text-[14px] font-semibold"
          >
            {loading ? "Opening wallet…" : "Connect Nimiq wallet"}
          </button>
          {error && (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-center text-[11.5px] leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <p className="mt-2 text-center text-[11px] text-muted">
            Your keys stay in Nimiq Pay or Nimiq Keyguard. XcrowHub never
            receives them.
          </p>
          {!inNimiqPay && (
            <div className="mt-4 grid gap-2 border-t border-edge pt-4">
              <p className="text-center text-[11.5px] text-muted">
                Don't have a browser wallet yet?
              </p>
              <a
                href={NIMIQ_WEB_WALLET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full text-[12.5px]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Create or restore wallet
              </a>
              <a
                href={nimiqPayDeeplink()}
                className="inline-flex items-center justify-center gap-1.5 py-1 text-[11.5px] font-medium text-muted hover:text-accent"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Use Nimiq Pay instead
              </a>
              <p className="text-center text-[10.5px] leading-relaxed text-muted/80">
                After setup, return here and tap Connect again.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
