import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";

export type CashbackPayoutStatus = "not_applicable" | "pending" | "paid";

export interface CashbackReward {
  id: string;
  dealId: string;
  dealTitle?: string;
  amountNim: number;
  revealedAt: string;
  payoutStatus: CashbackPayoutStatus;
  payoutTxHash: string | null;
  paidAt: string | null;
}

export interface UnclaimedCashback {
  dealId: string;
  dealTitle: string;
  releasedAt: string;
}

export interface DealCashbackStatus {
  eligible: boolean;
  revealed: boolean;
  reason: string | null;
  reward: CashbackReward | null;
}

interface RevealResult {
  reward: CashbackReward;
  newlyRevealed: boolean;
}

interface CashbackState {
  byDeal: Record<string, DealCashbackStatus>;
  loadingByDeal: Record<string, boolean>;
  historyLoading: boolean;
  rewards: CashbackReward[];
  unclaimed: UnclaimedCashback[];
  totalEarnedNim: number;
  totalPaidNim: number;
  totalPendingNim: number;
  error: string | null;
  loadDeal: (dealId: string) => Promise<DealCashbackStatus | null>;
  revealDeal: (dealId: string) => Promise<RevealResult | null>;
  retryPayout: (rewardId: string, dealId?: string) => Promise<boolean>;
  loadHistory: () => Promise<void>;
}

function mapReward(raw: Record<string, unknown> | null | undefined): CashbackReward | null {
  if (!raw || !raw.id || !raw.deal_id) return null;
  const payoutStatus: CashbackPayoutStatus =
    raw.payout_status === "paid"
      ? "paid"
      : raw.payout_status === "not_applicable"
        ? "not_applicable"
        : "pending";
  return {
    id: String(raw.id),
    dealId: String(raw.deal_id),
    dealTitle: typeof raw.deal_title === "string" ? raw.deal_title : undefined,
    amountNim: Number(raw.amount_nim ?? 0),
    revealedAt: String(raw.revealed_at ?? new Date().toISOString()),
    payoutStatus,
    payoutTxHash: typeof raw.payout_tx_hash === "string" ? raw.payout_tx_hash : null,
    paidAt: typeof raw.paid_at === "string" ? raw.paid_at : null,
  };
}

async function sendRewardPayout(rewardId: string) {
  return getSupabaseClient().functions.invoke("payout", {
    body: { kind: "deal_cashback", deal_cashback_reward_id: rewardId },
  });
}

export const useCashbackStore = create<CashbackState>((set, get) => ({
  byDeal: {},
  loadingByDeal: {},
  historyLoading: false,
  rewards: [],
  unclaimed: [],
  totalEarnedNim: 0,
  totalPaidNim: 0,
  totalPendingNim: 0,
  error: null,

  loadDeal: async (dealId) => {
    if (!isSupabaseConfiguredForClient()) return null;
    set((state) => ({
      loadingByDeal: { ...state.loadingByDeal, [dealId]: true },
      error: null,
    }));
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "get_deal_marketplace_cashback",
        { p_deal_id: dealId },
      );
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      const status: DealCashbackStatus = {
        eligible: raw.eligible === true,
        revealed: raw.revealed === true,
        reason: typeof raw.reason === "string" ? raw.reason : null,
        reward: mapReward(raw.reward as Record<string, unknown> | null),
      };
      set((state) => ({
        byDeal: { ...state.byDeal, [dealId]: status },
        loadingByDeal: { ...state.loadingByDeal, [dealId]: false },
      }));
      return status;
    } catch (error) {
      set((state) => ({
        loadingByDeal: { ...state.loadingByDeal, [dealId]: false },
        error: error instanceof Error ? error.message : "Could not load cashback",
      }));
      return null;
    }
  },

  revealDeal: async (dealId) => {
    if (!isSupabaseConfiguredForClient()) return null;
    set((state) => ({
      loadingByDeal: { ...state.loadingByDeal, [dealId]: true },
      error: null,
    }));
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "reveal_deal_marketplace_cashback",
        { p_deal_id: dealId },
      );
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      if (raw.eligible !== true) {
        const status: DealCashbackStatus = {
          eligible: false,
          revealed: false,
          reason: typeof raw.reason === "string" ? raw.reason : "unavailable",
          reward: null,
        };
        set((state) => ({
          byDeal: { ...state.byDeal, [dealId]: status },
          loadingByDeal: { ...state.loadingByDeal, [dealId]: false },
        }));
        return null;
      }

      const reward = mapReward(raw.reward as Record<string, unknown> | null);
      if (!reward) throw new Error("Reward response was incomplete");
      const status: DealCashbackStatus = {
        eligible: true,
        revealed: true,
        reason: null,
        reward,
      };
      set((state) => ({
        byDeal: { ...state.byDeal, [dealId]: status },
        loadingByDeal: { ...state.loadingByDeal, [dealId]: false },
        rewards: [reward, ...state.rewards.filter((item) => item.id !== reward.id)],
      }));
      void get().loadHistory();

      if (reward.amountNim > 0 && reward.payoutStatus === "pending") {
        void get().retryPayout(reward.id, dealId);
      }
      return { reward, newlyRevealed: raw.already_revealed !== true };
    } catch (error) {
      set((state) => ({
        loadingByDeal: { ...state.loadingByDeal, [dealId]: false },
        error: error instanceof Error ? error.message : "Could not reveal cashback",
      }));
      return null;
    }
  },

  retryPayout: async (rewardId, dealId) => {
    try {
      const { data, error } = await sendRewardPayout(rewardId);
      if (error) throw error;
      if (!data?.success || !data?.txHash) return false;

      const patch = (reward: CashbackReward): CashbackReward =>
        reward.id === rewardId
          ? {
              ...reward,
              payoutStatus: "paid",
              payoutTxHash: String(data.txHash),
              paidAt: reward.paidAt ?? new Date().toISOString(),
            }
          : reward;
      set((state) => ({
        rewards: state.rewards.map(patch),
        byDeal: dealId && state.byDeal[dealId]
          ? {
              ...state.byDeal,
              [dealId]: {
                ...state.byDeal[dealId],
                reward: state.byDeal[dealId].reward
                  ? patch(state.byDeal[dealId].reward as CashbackReward)
                  : null,
              },
            }
          : state.byDeal,
      }));
      void get().loadHistory();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Cashback payout is pending" });
      return false;
    }
  },

  loadHistory: async () => {
    if (!isSupabaseConfiguredForClient()) return;
    set({ historyLoading: true, error: null });
    try {
      const { data, error } = await getSupabaseClient().rpc("get_my_marketplace_cashback");
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      const rewards = Array.isArray(raw.rewards)
        ? raw.rewards
            .map((item) => mapReward(item as Record<string, unknown>))
            .filter((item): item is CashbackReward => Boolean(item))
        : [];
      const unclaimed = Array.isArray(raw.unclaimed)
        ? raw.unclaimed.map((item) => {
            const row = item as Record<string, unknown>;
            return {
              dealId: String(row.deal_id ?? ""),
              dealTitle: String(row.deal_title ?? "Marketplace purchase"),
              releasedAt: String(row.released_at ?? ""),
            };
          }).filter((item) => item.dealId)
        : [];
      set({
        historyLoading: false,
        rewards,
        unclaimed,
        totalEarnedNim: Number(raw.total_earned_nim ?? 0),
        totalPaidNim: Number(raw.total_paid_nim ?? 0),
        totalPendingNim: Number(raw.total_pending_nim ?? 0),
      });
    } catch (error) {
      set({
        historyLoading: false,
        error: error instanceof Error ? error.message : "Could not load cashback history",
      });
    }
  },
}));
