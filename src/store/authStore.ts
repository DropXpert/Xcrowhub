import { create } from "zustand";
import {
  loginWithWallet,
  applyStoredSession,
  clearSession,
  type AuthSession,
} from "@/lib/auth";
import { clearSupabaseAccessToken } from "@/lib/supabase";
import { applyPendingReferral } from "@/lib/referral";
import type { Currency } from "@/types/deal";
import { prepareWalletSwitch } from "@/wallet";

interface AuthState {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;

  connect: (currency?: Currency) => Promise<void>;
  switchWallet: () => Promise<void>;
  disconnect: () => void;
  restoreSession: () => void;
}

let connectInFlight = false;
let restoreInFlight = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  loading: true,
  error: null,

  connect: async (currency = "NIM") => {
    if (connectInFlight) return;
    const current = get().session;
    if (current?.currency === currency) {
      set({ loading: false, error: null });
      return;
    }
    connectInFlight = true;
    set({ loading: true, error: null });
    try {
      const session = await loginWithWallet(currency);
      set({ session, loading: false });
      // Bind a pending referral now that the wallet JWT is active.
      if (session?.token) void applyPendingReferral();
    } catch (err: any) {
      set({ loading: false, error: err.message || "Connection failed" });
    } finally {
      connectInFlight = false;
    }
  },

  switchWallet: async () => {
    if (connectInFlight) return;
    const current = get().session;
    if (!current) return;
    connectInFlight = true;
    set({ loading: true, error: null });
    try {
      await prepareWalletSwitch(current.currency);
      const session = await loginWithWallet(current.currency);
      if (session) {
        set({ session, loading: false });
        if (session.token) void applyPendingReferral();
      } else {
        set({ loading: false });
      }
    } catch (err: any) {
      // Keep the current authenticated session if the wallet selector is
      // cancelled or the replacement account cannot be authenticated.
      set({ session: current, loading: false, error: err.message || "Wallet switch failed" });
    } finally {
      connectInFlight = false;
    }
  },

  disconnect: () => {
    clearSession();
    clearSupabaseAccessToken();
    set({ session: null, error: null });
  },

  restoreSession: async () => {
    if (restoreInFlight) return;
    restoreInFlight = true;
    set({ loading: true, error: null });
    try {
      const session = await applyStoredSession();
      set({ session, loading: false });
      // Retry binding a pending referral on a restored session.
      if (session?.token) void applyPendingReferral();
    } catch (err: any) {
      set({ loading: false, error: err.message || "Session restore failed" });
    } finally {
      restoreInFlight = false;
    }
  },
}));

export const useIsAdmin = () =>
  useAuthStore((s) => s.session?.role === "admin");
