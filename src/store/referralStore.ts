import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import type { Currency } from "@/types/deal";

export interface ReferralBalance {
  currency: Currency;
  accrued: string;
}

export interface ReferralSummary {
  code: string;
  referralCount: number;
  balances: ReferralBalance[];
  lifetime: { currency: Currency; total: string }[];
}

interface ReferralState {
  summary: ReferralSummary | null;
  loading: boolean;
  claiming: Currency | null;
  error: string | null;

  load: () => Promise<void>;
  claim: (currency: Currency) => Promise<{ amount: string } | null>;
}

export const useReferralStore = create<ReferralState>((set, get) => ({
  summary: null,
  loading: false,
  claiming: null,
  error: null,

  load: async () => {
    if (!isSupabaseConfiguredForClient()) return;
    set({ loading: true, error: null });
    try {
      const { data, error } = await getSupabaseClient().rpc("get_referral_summary");
      if (error) throw error;
      const raw = data as any;
      set({
        loading: false,
        summary: {
          code: raw.code,
          referralCount: Number(raw.referralCount ?? 0),
          balances: (raw.balances ?? []).map((b: any) => ({
            currency: b.currency,
            accrued: String(b.accrued),
          })),
          lifetime: (raw.lifetime ?? []).map((l: any) => ({
            currency: l.currency,
            total: String(l.total),
          })),
        },
      });
    } catch (err: any) {
      set({ loading: false, error: err.message || "Could not load referrals" });
    }
  },

  claim: async (currency) => {
    if (!isSupabaseConfiguredForClient()) return null;
    set({ claiming: currency, error: null });
    try {
      const { data, error } = await getSupabaseClient().rpc("claim_referral_earnings", {
        p_currency: currency,
      });
      if (error) throw error;
      set({ claiming: null });
      await get().load();
      return { amount: String((data as any)?.amount ?? "0") };
    } catch (err: any) {
      set({ claiming: null, error: err.message || "Claim failed" });
      return null;
    }
  },
}));
