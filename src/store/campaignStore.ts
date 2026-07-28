import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";

interface CouponResult {
  amount: string;
  alreadyClaimed: boolean;
  code: string;
  claimId: string;
  payoutStatus: "pending" | "paid";
  payoutTxHash: string | null;
}

interface CampaignState {
  claimingCoupon: boolean;
  couponResult: CouponResult | null;
  couponError: string | null;
  claimCoupon: (code: string) => Promise<CouponResult | null>;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  claimingCoupon: false,
  couponResult: null,
  couponError: null,

  claimCoupon: async (code) => {
    if (!isSupabaseConfiguredForClient()) {
      set({ couponError: "Supabase is not configured", couponResult: null });
      return null;
    }
    set({ claimingCoupon: true, couponError: null, couponResult: null });
    try {
      const { data, error } = await getSupabaseClient().rpc("claim_campaign_coupon", {
        p_code: code.trim(),
      });
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      const result: CouponResult = {
        amount: String(raw.reward_nim ?? "0"),
        alreadyClaimed: raw.already_claimed === true,
        code: String(raw.code ?? code.trim().toUpperCase()),
        claimId: String(raw.claim_id ?? ""),
        payoutStatus: raw.payout_status === "paid" ? "paid" : "pending",
        payoutTxHash: typeof raw.payout_tx_hash === "string" ? raw.payout_tx_hash : null,
      };

      // The claim is recorded atomically first. The payout function then uses
      // the same claim id to lease and broadcast exactly one 500 NIM transfer.
      if (result.claimId && result.payoutStatus !== "paid") {
        const { data: payoutData, error: payoutError } = await getSupabaseClient().functions.invoke(
          "payout",
          { body: { kind: "campaign_coupon", campaign_coupon_claim_id: result.claimId } },
        );
        if (!payoutError && payoutData?.success && payoutData?.txHash) {
          result.payoutStatus = "paid";
          result.payoutTxHash = String(payoutData.txHash);
        } else if (payoutError) {
          // The claim itself succeeded. Keep the result as the single source
          // of truth for the pending state; putting the same message in
          // couponError makes Profile render it twice.
          set({
            claimingCoupon: false,
            couponResult: result,
            couponError: null,
          });
          return result;
        }
      }

      set({ claimingCoupon: false, couponResult: result, couponError: null });
      return result;
    } catch (err: any) {
      set({
        claimingCoupon: false,
        couponResult: null,
        couponError: err?.message || "Could not claim this coupon",
      });
      return null;
    }
  },
}));
