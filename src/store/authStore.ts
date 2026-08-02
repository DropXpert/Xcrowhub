import { create } from "zustand";
import {
  loginWithWallet,
  linkPaymentWallet,
  applyStoredSession,
  clearSession,
  type AuthSession,
} from "@/lib/auth";
import { clearSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";
import { applyPendingReferral } from "@/lib/referral";
import type { Currency } from "@/types/deal";
import { prepareWalletSwitch } from "@/wallet";

interface AuthState {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  linkedWallets: Partial<Record<Currency, string>>;

  connect: (currency?: Currency) => Promise<void>;
  switchWallet: (currency?: Currency) => Promise<void>;
  loadLinkedWallets: () => Promise<void>;
  disconnect: () => void;
  restoreSession: () => void;
}

let connectInFlight = false;
let restoreInFlight = false;

async function readLinkedUsdtWallet(): Promise<string | undefined> {
  const { data, error } = await getSupabaseClient().rpc("get_my_linked_wallet", {
    p_network: "evm",
  });
  if (error) throw error;
  return typeof data === "string" && data ? data : undefined;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  loading: true,
  error: null,
  linkedWallets: {},

  connect: async (currency = "NIM") => {
    if (connectInFlight) return;
    const current = get().session;
    if (current?.currency === currency) {
      set({ loading: false, error: null });
      return;
    }
    if (current?.currency === "NIM" && currency === "USDT") {
      await get().switchWallet("USDT");
      return;
    }
    connectInFlight = true;
    set({ loading: true, error: null });
    try {
      const session = await loginWithWallet(currency);
      set({ session, loading: false });
      if (session?.currency === "NIM") void get().loadLinkedWallets();
      // Bind a pending referral now that the wallet JWT is active.
      if (session?.token) void applyPendingReferral();
    } catch (err: any) {
      set({ loading: false, error: err.message || "Connection failed" });
    } finally {
      connectInFlight = false;
    }
  },

  switchWallet: async (currency) => {
    if (connectInFlight) return;
    const current = get().session;
    if (!current) return;
    const targetCurrency = currency ?? current.currency;
    connectInFlight = true;
    set({ loading: true, error: null });
    try {
      if (current.currency === "NIM" && targetCurrency === "USDT") {
        const linkedAddress = await linkPaymentWallet(current, "USDT");
        set((state) => ({
          linkedWallets: { ...state.linkedWallets, USDT: linkedAddress },
          loading: false,
        }));
      } else {
        await prepareWalletSwitch(targetCurrency);
        const session = await loginWithWallet(targetCurrency);
        if (session) {
          set({ session, loading: false, linkedWallets: {} });
          if (session.currency === "NIM") void get().loadLinkedWallets();
          if (session.token) void applyPendingReferral();
        } else {
          set({ loading: false });
        }
      }
    } catch (err: any) {
      // Keep the current authenticated session if the wallet selector is
      // cancelled or the replacement account cannot be authenticated.
      set({ session: current, loading: false, error: err.message || "Wallet switch failed" });
    } finally {
      connectInFlight = false;
    }
  },

  loadLinkedWallets: async () => {
    const current = get().session;
    if (!current?.token || current.currency !== "NIM") {
      set({ linkedWallets: {} });
      return;
    }
    try {
      const usdt = await readLinkedUsdtWallet();
      set({ linkedWallets: usdt ? { USDT: usdt } : {} });
    } catch (err) {
      console.warn("[XcrowHub] Could not load linked payment wallets:", err);
    }
  },

  disconnect: () => {
    clearSession();
    clearSupabaseAccessToken();
    set({ session: null, error: null, linkedWallets: {} });
  },

  restoreSession: async () => {
    if (restoreInFlight) return;
    restoreInFlight = true;
    set({ loading: true, error: null });
    try {
      const session = await applyStoredSession();
      set({ session, loading: false });
      if (session?.currency === "NIM") void get().loadLinkedWallets();
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
