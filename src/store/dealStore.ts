import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AdminDecision,
  AdminDecisionType,
  Deal,
  DealCategory,
  DealQuery,
  DealStatus,
  Feedback,
  Proof,
  QueryReason,
  TimelineEvent,
} from "@/types/deal";
import { canTransition } from "@/lib/stateMachine";
import { addHoursIso, nowIso } from "@/lib/time";
import { newDealId, newId } from "@/lib/ids";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import { useListingStore } from "@/store/listingStore";
import { clampNumber, INPUT_LIMITS, limitText, VALUE_LIMITS } from "@/lib/inputLimits";
import {
  ACTIVE_DEAL_LIMIT,
  ACTIVE_DEAL_LIMIT_MESSAGE,
  cleanDealCreationError,
  countActiveSellerDeals,
} from "@/lib/dealLimits";

const PROOF_WINDOW_HOURS = 24;
// How long a buyer has to pay before the link expires. The spec leaves this
// flexible — 48h matches the default delivery deadline most sellers pick.
const PAYMENT_WINDOW_HOURS = 48;

// Stable singletons so selectors don't thrash when a deal has no records yet.
const EMPTY_PROOFS: Proof[] = [];
const EMPTY_QUERIES: DealQuery[] = [];
const EMPTY_DECISIONS: AdminDecision[] = [];
const EMPTY_TIMELINE: TimelineEvent[] = [];
const EMPTY_FEEDBACKS: Feedback[] = [];

// --- Remote (Supabase) helpers ---
function isRemoteMode(): boolean {
  return isSupabaseConfiguredForClient();
}

function assertSupabaseSuccess(
  error: { message?: string } | null | undefined,
  fallbackMessage: string
): void {
  if (error) {
    throw new Error(error.message || fallbackMessage);
  }
}

// Throttle loadFromSupabase: it re-fetches every deal + related rows, so
// rapid re-triggers (tab focus, visibility change) within this window are
// no-ops instead of duplicate full-table reads.
const LOAD_THROTTLE_MS = 15_000;
let lastLoadAt = 0;

// Map DB snake_case row (with related children) to our camelCase types
function mapDealRow(row: any): Deal {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    priceAmount: String(row.price_amount),
    priceCurrency: row.price_currency,
    sellerWalletAddress: row.seller_wallet_address,
    buyerWalletAddress: row.buyer_wallet_address || undefined,
    deliveryDeadlineHours: row.delivery_deadline_hours,
    confirmationWindowHours: row.confirmation_window_hours,
    requiredDeliveryProof: row.required_delivery_proof || "",
    refundTerms: row.refund_terms || "",
    status: row.status,
    paymentTxHash: row.payment_tx_hash || undefined,
    escrowTxHash: row.escrow_tx_hash || undefined,
    releaseTxHash: row.release_tx_hash || undefined,
    refundTxHash: row.refund_tx_hash || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at || undefined,
    deliveredAt: row.delivered_at || undefined,
    receivedAt: row.received_at || undefined,
    releasedAt: row.released_at || undefined,
    refundedAt: row.refunded_at || undefined,
    paymentDeadlineAt: row.payment_deadline_at || undefined,
    proofDeadlineAt: row.proof_deadline_at || undefined,
    confirmationDeadlineAt: row.confirmation_deadline_at || undefined,
    buyerProofStatus: row.buyer_proof_status,
    sellerProofStatus: row.seller_proof_status,
    deliveryNote: row.delivery_note || undefined,
    category: row.category || "other",
    listingId: row.listing_id || undefined,
    feeAmount: row.fee_amount != null ? String(row.fee_amount) : undefined,
    feeBps: row.fee_bps != null ? Number(row.fee_bps) : undefined,
  };
}

function mapProofRow(row: any): Proof {
  return {
    id: row.id,
    dealId: row.deal_id,
    submittedBy: row.submitted_by,
    explanation: row.explanation || "",
    txHash: row.tx_hash || undefined,
    attachmentUrls: Array.isArray(row.attachment_urls) ? row.attachment_urls : [],
    createdAt: row.created_at,
  };
}

function mapQueryRow(row: any): DealQuery {
  return {
    id: row.id,
    dealId: row.deal_id,
    raisedBy: row.raised_by,
    reason: row.reason,
    details: row.details || "",
    createdAt: row.created_at,
  };
}

function mapDecisionRow(row: any): AdminDecision {
  return {
    id: row.id,
    dealId: row.deal_id,
    decision: row.decision,
    buyerAmount: row.buyer_amount != null ? String(row.buyer_amount) : undefined,
    sellerAmount: row.seller_amount != null ? String(row.seller_amount) : undefined,
    reason: row.reason,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
  };
}

function mapFeedbackRow(row: any): Feedback {
  return {
    id: row.id,
    dealId: row.deal_id,
    fromAddr: row.from_addr,
    toAddr: row.to_addr,
    fromRole: row.from_role,
    rating: row.rating,
    comment: row.comment || "",
    createdAt: row.created_at,
  };
}

function mapTimelineRow(row: any): TimelineEvent {
  return {
    id: row.id,
    dealId: row.deal_id,
    at: row.at,
    label: row.label,
    detail: row.detail || undefined,
    kind: row.kind,
  };
}

type ActorRole = "buyer" | "seller";

interface CreateDealInput {
  title: string;
  description: string;
  priceAmount: string;
  priceCurrency: Deal["priceCurrency"];
  sellerWalletAddress: string;
  deliveryDeadlineHours: number;
  confirmationWindowHours: number;
  requiredDeliveryProof: string;
  refundTerms: string;
  category?: DealCategory;
  listingId?: string;
}

interface SubmitFeedbackInput {
  dealId: string;
  fromAddr: string;
  toAddr: string;
  fromRole: "buyer" | "seller";
  rating: number;
  comment: string;
}

interface PayInput {
  dealId: string;
  buyerWalletAddress: string;
  paymentTxHash: string;
}

interface DeliverInput {
  dealId: string;
  deliveryNote: string;
}

interface RaiseQueryInput {
  dealId: string;
  raisedBy: ActorRole;
  reason: QueryReason;
  details: string;
}

interface SubmitProofInput {
  dealId: string;
  submittedBy: ActorRole;
  explanation: string;
  txHash?: string;
  attachmentUrls?: string[];
}

interface AdminDecisionInput {
  dealId: string;
  decision: AdminDecisionType;
  buyerAmount?: string;
  sellerAmount?: string;
  reason: string;
  decidedBy: string;
}

interface DealStoreState {
  deals: Record<string, Deal>;
  proofs: Record<string, Proof[]>;
  queries: Record<string, DealQuery[]>;
  decisions: Record<string, AdminDecision[]>;
  timeline: Record<string, TimelineEvent[]>;
  feedbacks: Record<string, Feedback[]>;

  // Selectors
  getDeal: (id: string) => Deal | undefined;
  getProofs: (id: string) => Proof[];
  getQueries: (id: string) => DealQuery[];
  getDecisions: (id: string) => AdminDecision[];
  getTimeline: (id: string) => TimelineEvent[];
  getFeedbacks: (dealId: string) => Feedback[];
  getFeedbacksForAddress: (addr: string) => Feedback[];
  listDeals: () => Deal[];
  listDealsForAdmin: () => Deal[];

  // Actions (async in remote mode when talking to Supabase procedures)
  createDeal: (input: CreateDealInput) => Deal | Promise<Deal>;
  payDeal: (input: PayInput) => void;
  beginPayment: (input: Pick<PayInput, "dealId" | "buyerWalletAddress">) => Promise<void>;
  submitPayment: (input: PayInput) => Promise<void>;
  // Re-runs on-chain verification for a submitted-but-unconfirmed payment.
  // Returns true once the deal has left awaiting_payment (funds confirmed).
  verifyPaymentNow: (dealId: string) => Promise<boolean>;
  markDelivered: (input: DeliverInput) => void;
  confirmReceipt: (dealId: string) => void;
  raiseQuery: (input: RaiseQueryInput) => void;
  submitProof: (input: SubmitProofInput) => void;
  resolveAfterProofDeadline: (dealId: string) => void;
  applyAdminDecision: (input: AdminDecisionInput) => void;
  cancelDeal: (dealId: string) => void;
  expireDeal: (dealId: string) => void;
  autoReleaseDeal: (dealId: string) => void;
  submitFeedback: (input: SubmitFeedbackInput) => void | Promise<void>;
  reconcileDeadlines: () => void;
  // Dev helper
  reset: () => void;

  // Remote (Supabase) helper - populates the local cache from the real DB
  loadFromSupabase: (options?: { force?: boolean }) => Promise<void>;
  loadDealById: (id: string) => Promise<void>;
}

function appendTimeline(
  state: DealStoreState,
  dealId: string,
  event: Omit<TimelineEvent, "id" | "dealId" | "at"> & { at?: string }
): TimelineEvent[] {
  const existing = state.timeline[dealId] ?? [];
  const entry: TimelineEvent = {
    id: newId("evt"),
    dealId,
    at: event.at ?? nowIso(),
    label: event.label,
    detail: event.detail,
    kind: event.kind,
  };
  return [...existing, entry];
}

function patchDeal(deal: Deal, patch: Partial<Deal>): Deal {
  return { ...deal, ...patch, updatedAt: nowIso() };
}

async function invokeDealPayout(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: { deal_id: string; decision: string; leg?: "seller" | "buyer" }
) {
  const { error } = await supabase.functions.invoke("payout", { body });
  assertSupabaseSuccess(error, "Payout failed");
}

function shouldRetryLegacyCreateDeal(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = err?.message ?? "";
  return (
    err?.code === "PGRST202" ||
    /could not find the function|function .* does not exist|schema cache/i.test(message)
  );
}

// Credit the originating listing's order count in local/demo mode when a deal
// first reaches `released`. In remote mode incrementOrders is intentionally a
// no-op because release procedures update orders_count transactionally.
// Refunds and partial refunds do not count as completed orders.
function creditOrderOnRelease(prevStatus: DealStatus | undefined, deal: Deal | undefined) {
  if (!deal?.listingId) return;
  if (prevStatus === "released") return;
  if (deal.status !== "released") return;
  void useListingStore.getState().incrementOrders(deal.listingId);
}

function transition(
  deal: Deal,
  to: DealStatus,
  patch: Partial<Deal> = {}
): Deal {
  if (!canTransition(deal.status, to)) {
    throw new Error(
      `Illegal transition for deal ${deal.id}: ${deal.status} → ${to}`
    );
  }
  return patchDeal(deal, { ...patch, status: to });
}

export const useDealStore = create<DealStoreState>()(
  persist(
    (set, get) => ({
      deals: {},
      proofs: {},
      queries: {},
      decisions: {},
      timeline: {},
      feedbacks: {},

      getDeal: (id) => get().deals[id],
      getProofs: (id) => get().proofs[id] ?? EMPTY_PROOFS,
      getQueries: (id) => get().queries[id] ?? EMPTY_QUERIES,
      getDecisions: (id) => get().decisions[id] ?? EMPTY_DECISIONS,
      getTimeline: (id) => get().timeline[id] ?? EMPTY_TIMELINE,
      getFeedbacks: (dealId) => get().feedbacks[dealId] ?? EMPTY_FEEDBACKS,
      getFeedbacksForAddress: (addr) => {
        const lower = addr.toLowerCase();
        return Object.values(get().feedbacks).flat().filter(
          (f) => f.toAddr.toLowerCase() === lower
        );
      },

      listDeals: () =>
        Object.values(get().deals).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        ),

      listDealsForAdmin: () =>
        Object.values(get().deals)
          .filter(
            (d) =>
              d.status === "under_admin_review" || d.status === "proof_window"
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      createDeal: async (input) => {
        if (isRemoteMode()) {
          const supabase = getSupabaseClient();
          const baseArgs = {
            p_title: limitText(input.title, INPUT_LIMITS.title),
            p_description: limitText(input.description, INPUT_LIMITS.description),
            p_price_amount: clampNumber(Number(input.priceAmount), 0, VALUE_LIMITS.amount),
            p_price_currency: input.priceCurrency,
            p_seller_wallet_address: input.sellerWalletAddress,
            p_delivery_deadline_hours: clampNumber(Math.round(input.deliveryDeadlineHours), 1, VALUE_LIMITS.deadlineHours),
            p_confirmation_window_hours: clampNumber(Math.round(input.confirmationWindowHours), 1, VALUE_LIMITS.deadlineHours),
            p_required_delivery_proof: limitText(input.requiredDeliveryProof, INPUT_LIMITS.terms),
            p_refund_terms: limitText(input.refundTerms, INPUT_LIMITS.terms),
            p_category: input.category ?? "other",
          };

          // Prefer the listing_id-aware signature (migration 0013). If the DB
          // hasn't been migrated yet, that overload doesn't exist — retry with
          // the legacy args so deal creation still persists remotely.
          let res = await supabase.rpc("create_deal", { ...baseArgs, p_listing_id: input.listingId ?? null });
          if (res.error && shouldRetryLegacyCreateDeal(res.error)) {
            res = await supabase.rpc("create_deal", baseArgs);
          }
          // In remote mode, never fall back to local — that silently creates a
          // deal that vanishes on the next reload. Throw so the UI can show an error.
          if (res.error) {
            throw new Error(cleanDealCreationError(res.error.message || "Failed to create deal"));
          }

          // Fetch just the new deal — avoids racing with any in-flight
          // loadFromSupabase that was started before the RPC completed.
          await (get() as any).loadDealById(res.data as string);

          const created = get().deals[res.data as string];
          if (!created) throw new Error("Deal created but could not be loaded. Please refresh.");
          return created;
        }

        // Local (demo) path — only reached when Supabase is not configured.
        if (countActiveSellerDeals(Object.values(get().deals), input.sellerWalletAddress) >= ACTIVE_DEAL_LIMIT) {
          throw new Error(ACTIVE_DEAL_LIMIT_MESSAGE);
        }

        const id = newDealId();
        const now = nowIso();
        const deal: Deal = {
          id,
          title: limitText(input.title, INPUT_LIMITS.title),
          description: limitText(input.description, INPUT_LIMITS.description),
          priceAmount: String(clampNumber(Number(input.priceAmount), 0, VALUE_LIMITS.amount)),
          priceCurrency: input.priceCurrency,
          sellerWalletAddress: input.sellerWalletAddress,
          deliveryDeadlineHours: clampNumber(Math.round(input.deliveryDeadlineHours), 1, VALUE_LIMITS.deadlineHours),
          confirmationWindowHours: clampNumber(Math.round(input.confirmationWindowHours), 1, VALUE_LIMITS.deadlineHours),
          requiredDeliveryProof: limitText(input.requiredDeliveryProof, INPUT_LIMITS.terms),
          refundTerms: limitText(input.refundTerms, INPUT_LIMITS.terms),
          status: "awaiting_payment",
          createdAt: now,
          updatedAt: now,
          paymentDeadlineAt: addHoursIso(now, PAYMENT_WINDOW_HOURS),
          buyerProofStatus: "not_submitted",
          sellerProofStatus: "not_submitted",
          category: input.category ?? "other",
          listingId: input.listingId,
        };

        set((state) => ({
          deals: { ...state.deals, [id]: deal },
          timeline: {
            ...state.timeline,
            [id]: appendTimeline(state, id, {
              label: "Deal created",
              detail: deal.title,
              kind: "created",
            }),
          },
        }));
        return deal;
      },

      // Reserve the deal before the wallet broadcasts. This prevents seller
      // cancellation from racing the short gap before the tx hash is returned.
      beginPayment: async ({ dealId, buyerWalletAddress }) => {
        if (!isRemoteMode()) return;
        const supabase = getSupabaseClient();
        const { error } = await supabase.rpc("begin_payment", {
          p_deal_id: dealId,
          p_buyer: buyerWalletAddress,
        });
        assertSupabaseSuccess(error, "Failed to reserve the deal for payment");
      },

      // Trustless payment: record the tx hash, then verify it on-chain server-side.
      // The deal only reaches funds_held once verify-payment confirms it (or the
      // cron/watcher backstop does). No optimistic transition in remote mode.
      submitPayment: async ({ dealId, buyerWalletAddress, paymentTxHash }) => {
        if (isRemoteMode()) {
          const supabase = getSupabaseClient();
          // Records the claimed payment; does NOT change status.
          const { error: submitError } = await supabase.rpc("submit_payment", {
            p_deal_id: dealId,
            p_tx_hash: paymentTxHash,
            p_buyer: buyerWalletAddress,
          });
          assertSupabaseSuccess(submitError, "Failed to submit payment for verification");

          // Verify now for fast confirmation; the cron is the backstop if this fails.
          // `confirmed: false` is a normal pending-chain response. Only an
          // invocation error is exceptional, and it does not erase the safely
          // recorded tx hash; the watcher/cron can retry it.
          const { error: verificationError } = await supabase.functions.invoke(
            "verify-payment",
            { body: { deal_id: dealId } }
          );
          if (verificationError) {
            console.warn(
              "[XcrowHub] verify-payment invoke failed (cron will retry):",
              verificationError
            );
          }
          await (get() as any).loadFromSupabase({ force: true });
          return;
        }
        // Local/demo (no Supabase): no chain to verify — optimistic transition.
        get().payDeal({ dealId, buyerWalletAddress, paymentTxHash });
      },

      // Poll-friendly: ask the server to re-verify the on-chain payment now.
      // The Edge Function is idempotent and re-checks the chain each call, so
      // this is safe to call on an interval until the deal leaves awaiting_payment.
      verifyPaymentNow: async (dealId) => {
        if (!isRemoteMode()) {
          const deal = get().deals[dealId];
          return !!deal && deal.status !== "awaiting_payment";
        }
        const supabase = getSupabaseClient();
        const { error: verificationError } = await supabase.functions.invoke(
          "verify-payment",
          { body: { deal_id: dealId } }
        );
        if (verificationError) {
          console.warn(
            "[XcrowHub] verify-payment poll failed (will retry):",
            verificationError
          );
        }
        await (get() as any).loadFromSupabase({ force: true });
        const deal = get().deals[dealId];
        return !!deal && deal.status !== "awaiting_payment";
      },

      payDeal: async ({ dealId, buyerWalletAddress, paymentTxHash }) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("pay_deal", {
              p_deal_id: dealId,
              p_buyer_wallet_address: buyerWalletAddress,
              p_payment_tx_hash: paymentTxHash,
            });
            assertSupabaseSuccess(error, "Failed to record payment");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote payDeal failed:", err);
            throw err;
          }
        }

        const deal = get().deals[dealId];
        if (!deal) return;
        const next = transition(deal, "funds_held", {
          buyerWalletAddress,
          paymentTxHash,
          paidAt: nowIso(),
        });
        set((state) => ({
          deals: { ...state.deals, [dealId]: next },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: "Buyer paid into protected hold",
              detail: `${deal.priceAmount} ${deal.priceCurrency}`,
              kind: "paid",
            }),
          },
        }));
      },

      markDelivered: async ({ dealId, deliveryNote }) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("mark_delivered", {
              p_deal_id: dealId,
              p_delivery_note: limitText(deliveryNote, INPUT_LIMITS.description),
            });
            assertSupabaseSuccess(error, "Failed to mark the deal as delivered");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote markDelivered failed:", err);
            throw err;
          }
        }
        const deal = get().deals[dealId];
        if (!deal) return;
        const deliveredNow = nowIso();
        const next = transition(deal, "delivered_by_seller", {
          deliveryNote: limitText(deliveryNote, INPUT_LIMITS.description),
          deliveredAt: deliveredNow,
          confirmationDeadlineAt: addHoursIso(deliveredNow, deal.confirmationWindowHours),
        });
        set((state) => ({
          deals: { ...state.deals, [dealId]: next },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: "Seller marked as delivered",
              detail: limitText(deliveryNote, INPUT_LIMITS.description) || undefined,
              kind: "delivered",
            }),
          },
        }));
      },

      confirmReceipt: async (dealId) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const prevStatus = get().deals[dealId]?.status;
            const { error } = await supabase.rpc("confirm_receipt", {
              p_deal_id: dealId,
            });
            assertSupabaseSuccess(error, "Failed to confirm receipt");
            await (get() as any).loadFromSupabase({ force: true });
            const released = get().deals[dealId];
            if (released?.status === "released" && !released.releaseTxHash) {
              await invokeDealPayout(supabase, {
                deal_id: dealId,
                decision: "release_to_seller",
              });
              await (get() as any).loadFromSupabase({ force: true });
            }
            creditOrderOnRelease(prevStatus, get().deals[dealId]);
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote confirmReceipt failed:", err);
            throw err;
          }
        }

        const deal = get().deals[dealId];
        if (!deal) return;
        const confirmed = transition(deal, "received_by_buyer", {
          receivedAt: nowIso(),
        });
        // Auto-progress to released — the spec says funds release on confirm.
        const released = transition(confirmed, "released", {
          releasedAt: nowIso(),
          releaseTxHash: undefined,
        });
        set((state) => {
          let timeline = appendTimeline(state, dealId, {
            label: "Buyer confirmed receipt",
            kind: "received",
          });
          timeline = appendTimeline(
            { ...state, timeline: { ...state.timeline, [dealId]: timeline } },
            dealId,
            {
              label: "Funds released to seller",
              detail: `${deal.priceAmount} ${deal.priceCurrency}`,
              kind: "released",
            }
          );
          return {
            deals: { ...state.deals, [dealId]: released },
            timeline: { ...state.timeline, [dealId]: timeline },
          };
        });
        creditOrderOnRelease(deal.status, released);
      },

      raiseQuery: async ({ dealId, raisedBy, reason, details }) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("raise_query", {
              p_deal_id: dealId,
              p_raised_by: raisedBy,
              p_reason: reason,
              p_details: limitText(details, INPUT_LIMITS.queryDetails),
            });
            assertSupabaseSuccess(error, "Failed to raise a query");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote raiseQuery failed:", err);
            throw err;
          }
        }
        const deal = get().deals[dealId];
        if (!deal) return;
        // One active query per deal
        const existingQueries = get().queries[dealId] ?? [];
        if (deal.status === "query_open" || deal.status === "proof_window") {
          return;
        }
        // funds_held or delivered_by_seller → query_open → proof_window
        const queryOpen = transition(deal, "query_open");
        const proofWindow = transition(queryOpen, "proof_window", {
          proofDeadlineAt: addHoursIso(nowIso(), PROOF_WINDOW_HOURS),
        });

        const query: DealQuery = {
          id: newId("qry"),
          dealId,
          raisedBy,
          reason,
          details: limitText(details, INPUT_LIMITS.queryDetails),
          createdAt: nowIso(),
        };

        set((state) => {
          let timeline = appendTimeline(state, dealId, {
            label: `${raisedBy === "buyer" ? "Buyer" : "Seller"} raised a query`,
            detail: humanQueryReason(reason),
            kind: "query",
          });
          timeline = appendTimeline(
            { ...state, timeline: { ...state.timeline, [dealId]: timeline } },
            dealId,
            {
              label: "Proof window opened",
              detail: "Both sides have 24 hours to submit proof.",
              kind: "proof",
            }
          );
          return {
            deals: { ...state.deals, [dealId]: proofWindow },
            queries: {
              ...state.queries,
              [dealId]: [...existingQueries, query],
            },
            timeline: { ...state.timeline, [dealId]: timeline },
          };
        });
      },

      submitProof: async ({
        dealId,
        submittedBy,
        explanation,
        txHash,
        attachmentUrls,
      }) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("submit_proof", {
              p_deal_id: dealId,
              p_submitted_by: submittedBy,
              p_explanation: limitText(explanation, INPUT_LIMITS.proofExplanation),
              p_tx_hash: limitText(txHash, INPUT_LIMITS.reference) || null,
              p_attachment_urls: (attachmentUrls ?? []).slice(0, INPUT_LIMITS.maxAttachments).map((url) => limitText(url, INPUT_LIMITS.attachmentUrl)),
            });
            assertSupabaseSuccess(error, "Failed to submit proof");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote submitProof failed:", err);
            throw err;
          }
        }
        const deal = get().deals[dealId];
        if (!deal) return;
        if (deal.status !== "proof_window") return;

        const proof: Proof = {
          id: newId("prf"),
          dealId,
          submittedBy,
          explanation: limitText(explanation, INPUT_LIMITS.proofExplanation),
          txHash: limitText(txHash, INPUT_LIMITS.reference) || undefined,
          attachmentUrls: (attachmentUrls ?? []).slice(0, INPUT_LIMITS.maxAttachments).map((url) => limitText(url, INPUT_LIMITS.attachmentUrl)),
          createdAt: nowIso(),
        };

        const existing = get().proofs[dealId] ?? [];

        set((state) => ({
          proofs: { ...state.proofs, [dealId]: [...existing, proof] },
          deals: {
            ...state.deals,
            [dealId]: patchDeal(deal, {
              buyerProofStatus:
                submittedBy === "buyer" ? "submitted" : deal.buyerProofStatus,
              sellerProofStatus:
                submittedBy === "seller" ? "submitted" : deal.sellerProofStatus,
            }),
          },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: `${submittedBy === "buyer" ? "Buyer" : "Seller"} submitted proof`,
              detail: limitText(explanation, INPUT_LIMITS.proofExplanation) || undefined,
              kind: "proof",
            }),
          },
        }));
      },

      resolveAfterProofDeadline: async (dealId) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("resolve_after_proof_deadline", {
              p_deal_id: dealId,
            });
            assertSupabaseSuccess(error, "Failed to resolve the proof deadline");
            await (get() as any).loadFromSupabase({ force: true });
            const updated = get().deals[dealId];
            if (updated && (updated.status === "released" || updated.status === "refunded")) {
              const isRelease = updated.status === "released";
              await invokeDealPayout(supabase, {
                deal_id: dealId,
                decision: isRelease ? "release_to_seller" : "refund_to_buyer",
              });
              await (get() as any).loadFromSupabase({ force: true });
            }
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote resolveAfterProofDeadline failed:", err);
            throw err;
          }
        }

        const deal = get().deals[dealId];
        if (!deal) return;
        if (deal.status !== "proof_window") return;

        const buyerSubmitted = deal.buyerProofStatus === "submitted";
        const sellerSubmitted = deal.sellerProofStatus === "submitted";

        // Case A: only buyer → refund buyer
        if (buyerSubmitted && !sellerSubmitted) {
          const next = transition(deal, "refunded", { refundedAt: nowIso() });
          set((state) => ({
            deals: { ...state.deals, [dealId]: next },
            timeline: {
              ...state.timeline,
              [dealId]: appendTimeline(state, dealId, {
                label: "Buyer refunded",
                detail: "Seller did not submit proof within 24 hours.",
                kind: "refund",
              }),
            },
          }));
          return;
        }

        // Case B: only seller → release
        if (!buyerSubmitted && sellerSubmitted) {
          const next = transition(deal, "released", { releasedAt: nowIso() });
          set((state) => ({
            deals: { ...state.deals, [dealId]: next },
            timeline: {
              ...state.timeline,
              [dealId]: appendTimeline(state, dealId, {
                label: "Funds released to seller",
                detail: "Buyer did not submit proof within 24 hours.",
                kind: "released",
              }),
            },
          }));
          return;
        }

        // Case C & D: both, or neither → admin review
        const next = transition(deal, "under_admin_review");
        set((state) => ({
          deals: { ...state.deals, [dealId]: next },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: "Moved to admin review",
              detail: buyerSubmitted
                ? "Both sides submitted proof."
                : "Neither side submitted proof in time.",
              kind: "admin",
            }),
          },
        }));
      },

      applyAdminDecision: async ({
        dealId,
        decision,
        buyerAmount,
        sellerAmount,
        reason,
        decidedBy,
      }) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const prevStatus = get().deals[dealId]?.status;
            const { error } = await supabase.rpc("apply_admin_decision", {
              p_deal_id: dealId,
              p_decision: decision,
              p_reason: limitText(reason, INPUT_LIMITS.queryDetails),
              p_buyer_amount: buyerAmount ? clampNumber(Number(buyerAmount), 0, VALUE_LIMITS.amount) : null,
              p_seller_amount: sellerAmount ? clampNumber(Number(sellerAmount), 0, VALUE_LIMITS.amount) : null,
              p_decided_by: decidedBy || "admin",
            });
            assertSupabaseSuccess(error, "Failed to apply the admin decision");
            await (get() as any).loadFromSupabase({ force: true });
            creditOrderOnRelease(prevStatus, get().deals[dealId]);

            // Trigger the payout Edge Function. Recipient + amount are re-derived
            // server-side from the deal/decision (the function ignores client
            // values), so we only pass the deal id, decision, and partial leg.
            if (decision === "partial_refund") {
              await invokeDealPayout(supabase, { deal_id: dealId, decision, leg: "seller" });
              await invokeDealPayout(supabase, { deal_id: dealId, decision, leg: "buyer" });
            } else {
              await invokeDealPayout(supabase, { deal_id: dealId, decision });
            }
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote applyAdminDecision failed:", err);
            throw err;
          }
        }

        const deal = get().deals[dealId];
        if (!deal) return;
        if (
          deal.status !== "under_admin_review" &&
          deal.status !== "proof_window"
        )
          return;

        const target: DealStatus =
          decision === "release_to_seller"
            ? "released"
            : decision === "refund_to_buyer"
            ? "refunded"
            : "partially_refunded";

        const patch: Partial<Deal> = {};
        if (target === "released") patch.releasedAt = nowIso();
        if (target === "refunded") patch.refundedAt = nowIso();
        if (target === "partially_refunded") {
          patch.releasedAt = nowIso();
          patch.refundedAt = nowIso();
        }

        // proof_window can go directly to released/refunded per the state
        // machine, but partial_refund requires chaining through admin review.
        const intermediate =
          deal.status === "proof_window" && target === "partially_refunded"
            ? transition(deal, "under_admin_review")
            : deal;
        const next = transition(intermediate, target, patch);

        const record: AdminDecision = {
          id: newId("adm"),
          dealId,
          decision,
          buyerAmount: buyerAmount ? String(clampNumber(Number(buyerAmount), 0, VALUE_LIMITS.amount)) : undefined,
          sellerAmount: sellerAmount ? String(clampNumber(Number(sellerAmount), 0, VALUE_LIMITS.amount)) : undefined,
          reason: limitText(reason, INPUT_LIMITS.queryDetails),
          decidedBy,
          createdAt: nowIso(),
        };

        const existing = get().decisions[dealId] ?? [];

        set((state) => ({
          deals: { ...state.deals, [dealId]: next },
          decisions: {
            ...state.decisions,
            [dealId]: [...existing, record],
          },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: humanDecision(decision),
              detail: reason.trim(),
              kind:
                decision === "refund_to_buyer"
                  ? "refund"
                  : decision === "partial_refund"
                  ? "admin"
                  : "released",
            }),
          },
        }));
        creditOrderOnRelease(deal.status, next);
      },

      cancelDeal: async (dealId) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("cancel_deal", {
              p_deal_id: dealId,
            });
            assertSupabaseSuccess(error, "Failed to cancel the deal");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote cancelDeal failed:", err);
            throw err;
          }
        }
        const deal = get().deals[dealId];
        if (!deal) return;
        if (!canTransition(deal.status, "cancelled")) return;
        const next = transition(deal, "cancelled");
        set((state) => ({
          deals: { ...state.deals, [dealId]: next },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: "Deal cancelled",
              kind: "cancelled",
            }),
          },
        }));
      },

      expireDeal: async (dealId) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("expire_deal", {
              p_deal_id: dealId,
            });
            assertSupabaseSuccess(error, "Failed to expire the deal");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote expireDeal failed:", err);
            throw err;
          }
        }
        const deal = get().deals[dealId];
        if (!deal) return;
        if (deal.status !== "awaiting_payment") return;
        if (!canTransition(deal.status, "expired")) return;
        const next = transition(deal, "expired");
        set((state) => ({
          deals: { ...state.deals, [dealId]: next },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: "Deal expired",
              detail: "Buyer did not pay within the payment window.",
              kind: "expired",
            }),
          },
        }));
      },

      autoReleaseDeal: async (dealId) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const prevStatus = get().deals[dealId]?.status;
            const { error } = await supabase.rpc("auto_release_deal", {
              p_deal_id: dealId,
            });
            assertSupabaseSuccess(error, "Failed to auto-release the deal");
            await (get() as any).loadFromSupabase({ force: true });
            const released = get().deals[dealId];
            if (released?.status === "released" && !released.releaseTxHash) {
              await invokeDealPayout(supabase, {
                deal_id: dealId,
                decision: "release_to_seller",
              });
              await (get() as any).loadFromSupabase({ force: true });
            }
            creditOrderOnRelease(prevStatus, get().deals[dealId]);
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote autoReleaseDeal failed:", err);
            throw err;
          }
        }
        const deal = get().deals[dealId];
        if (!deal) return;
        if (deal.status !== "delivered_by_seller") return;
        const released = transition(deal, "released", { releasedAt: nowIso() });
        set((state) => ({
          deals: { ...state.deals, [dealId]: released },
          timeline: {
            ...state.timeline,
            [dealId]: appendTimeline(state, dealId, {
              label: "Funds auto-released to seller",
              detail: "Buyer did not confirm within the confirmation window.",
              kind: "released",
            }),
          },
        }));
        creditOrderOnRelease(deal.status, released);
      },

      submitFeedback: async ({ dealId, fromAddr, toAddr, fromRole, rating, comment }) => {
        if (isRemoteMode()) {
          try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.rpc("submit_feedback", {
              p_deal_id: dealId,
              p_from_addr: fromAddr,
              p_to_addr: toAddr,
              p_from_role: fromRole,
              p_rating: rating,
              p_comment: limitText(comment, INPUT_LIMITS.feedback),
            });
            assertSupabaseSuccess(error, "Failed to submit feedback");
            await (get() as any).loadFromSupabase({ force: true });
            return;
          } catch (err) {
            console.error("[XcrowHub] Remote submitFeedback failed:", err);
            throw err;
          }
        }

        const deal = get().deals[dealId];
        if (!deal) return;
        if (!["released", "refunded", "partially_refunded"].includes(deal.status)) return;

        const feedback: Feedback = {
          id: newId("fdb"),
          dealId,
          fromAddr: fromAddr.toLowerCase(),
          toAddr: toAddr.toLowerCase(),
          fromRole,
          rating,
          comment: limitText(comment, INPUT_LIMITS.feedback),
          createdAt: nowIso(),
        };

        const existing = get().feedbacks[dealId] ?? [];
        const alreadyLeft = existing.some((f) => f.fromRole === fromRole);
        if (alreadyLeft) return;

        set((state) => ({
          feedbacks: { ...state.feedbacks, [dealId]: [...existing, feedback] },
        }));
      },

      reconcileDeadlines: () => {
        const { deals, resolveAfterProofDeadline, expireDeal, autoReleaseDeal } = get();
        const nowTs = Date.now();
        Object.values(deals).forEach((deal) => {
          if (
            deal.status === "proof_window" &&
            deal.proofDeadlineAt &&
            new Date(deal.proofDeadlineAt).getTime() <= nowTs
          ) {
            resolveAfterProofDeadline(deal.id);
          }
          if (
            deal.status === "awaiting_payment" &&
            deal.paymentDeadlineAt &&
            new Date(deal.paymentDeadlineAt).getTime() <= nowTs
          ) {
            expireDeal(deal.id);
          }
          if (
            deal.status === "delivered_by_seller" &&
            deal.confirmationDeadlineAt &&
            new Date(deal.confirmationDeadlineAt).getTime() <= nowTs
          ) {
            autoReleaseDeal(deal.id);
          }
        });
      },

      reset: () =>
        set({
          deals: {},
          proofs: {},
          queries: {},
          decisions: {},
          timeline: {},
          feedbacks: {},
        }),

      loadFromSupabase: async (options = {}) => {
        if (!isRemoteMode()) return;
        const now = Date.now();
        if (!options.force && now - lastLoadAt < LOAD_THROTTLE_MS) return;
        lastLoadAt = now;

        const supabase = getSupabaseClient();

        try {
          // Load deals (public read is allowed by RLS for link sharing)
          const { data: dealsData, error: dealsErr } = await supabase
            .from("deals")
            .select("*")
            .order("created_at", { ascending: false });

          if (dealsErr) throw dealsErr;

          const deals: Record<string, Deal> = {};
          for (const row of dealsData || []) {
            deals[row.id] = mapDealRow(row);
          }

          // Load related records (proofs, queries, decisions, timeline)
          const dealIds = Object.keys(deals);

          let proofsMap: Record<string, Proof[]> = {};
          let queriesMap: Record<string, DealQuery[]> = {};
          let decisionsMap: Record<string, AdminDecision[]> = {};
          let timelineMap: Record<string, TimelineEvent[]> = {};
          let feedbacksMap: Record<string, Feedback[]> = {};

          if (dealIds.length > 0) {
            const [proofsRes, queriesRes, decisionsRes, timelineRes, feedbacksRes] = await Promise.all([
              supabase.from("proofs").select("*").in("deal_id", dealIds),
              supabase.from("queries").select("*").in("deal_id", dealIds),
              supabase.from("decisions").select("*").in("deal_id", dealIds),
              supabase.from("timeline").select("*").in("deal_id", dealIds).order("at", { ascending: true }),
              supabase.from("feedbacks").select("*").in("deal_id", dealIds),
            ]);

            if (proofsRes.error) throw proofsRes.error;
            if (queriesRes.error) throw queriesRes.error;
            if (decisionsRes.error) throw decisionsRes.error;
            if (timelineRes.error) throw timelineRes.error;
            if (feedbacksRes.error) throw feedbacksRes.error;

            proofsMap = (proofsRes.data || []).reduce((acc: any, row: any) => {
              const dId = row.deal_id;
              if (!acc[dId]) acc[dId] = [];
              acc[dId].push(mapProofRow(row));
              return acc;
            }, {});

            queriesMap = (queriesRes.data || []).reduce((acc: any, row: any) => {
              const dId = row.deal_id;
              if (!acc[dId]) acc[dId] = [];
              acc[dId].push(mapQueryRow(row));
              return acc;
            }, {});

            decisionsMap = (decisionsRes.data || []).reduce((acc: any, row: any) => {
              const dId = row.deal_id;
              if (!acc[dId]) acc[dId] = [];
              acc[dId].push(mapDecisionRow(row));
              return acc;
            }, {});

            timelineMap = (timelineRes.data || []).reduce((acc: any, row: any) => {
              const dId = row.deal_id;
              if (!acc[dId]) acc[dId] = [];
              acc[dId].push(mapTimelineRow(row));
              return acc;
            }, {});

            feedbacksMap = (feedbacksRes.data || []).reduce((acc: any, row: any) => {
              const dId = row.deal_id;
              if (!acc[dId]) acc[dId] = [];
              acc[dId].push(mapFeedbackRow(row));
              return acc;
            }, {});
          }

          set({
            deals,
            proofs: proofsMap,
            queries: queriesMap,
            decisions: decisionsMap,
            timeline: timelineMap,
            feedbacks: feedbacksMap,
          });
        } catch (err) {
          console.error("[XcrowHub] Failed to load from Supabase:", err);
          // Fall back to whatever local state we have (hybrid safety)
        }
      },

      loadDealById: async (id) => {
        if (!isRemoteMode()) return;
        const supabase = getSupabaseClient();
        try {
          // Shared deal links are resolved through the single-row RPC. The
          // deals table itself is now participant-scoped, so a buyer who has
          // not started payment yet would otherwise be unable to open the
          // link. Once payment binds their wallet, normal RLS reads apply.
          const { data: linkedRows } = await supabase.rpc(
            "get_deal_by_link",
            { p_deal_id: id }
          );
          const linkedRow = Array.isArray(linkedRows) ? linkedRows[0] : linkedRows;

          let row = linkedRow;
          if (!row) {
            // Backward-compatible fallback while a deployment is rolling out
            // the migration, and for participant/admin reads if the RPC is
            // temporarily unavailable.
            const { data: participantRow, error: participantError } = await supabase
              .from("deals")
              .select("*")
              .eq("id", id)
              .single();
            if (participantError) return;
            row = participantRow;
          }

          if (!row) return;
          // Merge a single deal into the store without touching any other deals.
          set((state) => ({
            deals: { ...state.deals, [id]: mapDealRow(row) },
          }));
        } catch {
          // ignore — caller checks get().deals[id] and handles missing
        }
      },
    }),
    {
      name: "proofhold.deals.v1",
      version: 1,
    }
  )
);

function humanQueryReason(reason: QueryReason) {
  switch (reason) {
    case "product_not_received":
      return "Product not received";
    case "wrong_product":
      return "Wrong product";
    case "broken_link":
      return "Link/file does not work";
    case "incomplete_delivery":
      return "Delivery incomplete";
    case "buyer_not_confirming":
      return "Buyer received but did not confirm";
    case "false_claim":
      return "Buyer is making a false claim";
    case "no_response":
      return "Buyer is not responding";
    case "other":
      return "Other";
  }
}

function humanDecision(decision: AdminDecisionType) {
  switch (decision) {
    case "release_to_seller":
      return "Admin released funds to seller";
    case "refund_to_buyer":
      return "Admin refunded buyer";
    case "partial_refund":
      return "Admin applied partial refund";
  }
}
