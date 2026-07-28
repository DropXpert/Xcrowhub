import { Wallet, Lock } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { isSupabaseConfiguredForClient } from "@/lib/supabase";
import { PageLoader } from "@/components/PageLoader";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const connect = useAuthStore((s) => s.connect);
  const supConfigured = isSupabaseConfiguredForClient();

  if (session) return <>{children}</>;
  if (loading) {
    return (
      <PageLoader
        eyebrow="Wallet"
        title="Opening account"
        detail="Restoring your wallet session."
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft">
        <Lock className="h-7 w-7 text-accent" />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-[17px] font-semibold text-ink">Connect your wallet</h2>
        <p className="text-[13px] text-muted max-w-[240px] leading-relaxed">
          You need to connect your Nimiq wallet to access this page.
        </p>
      </div>
      {supConfigured && (
        <button
          type="button"
          onClick={() => connect()}
          disabled={loading}
          className="btn-primary px-6"
        >
          <Wallet className="h-4 w-4" />
          {loading ? "Connecting…" : "Connect wallet"}
        </button>
      )}
    </div>
  );
}
