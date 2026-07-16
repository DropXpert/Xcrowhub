import type { DealStatus } from "@/types/deal";

export const allowedTransitions: Record<DealStatus, DealStatus[]> = {
  draft: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["funds_held", "expired", "cancelled"],
  funds_held: ["delivered_by_seller", "query_open"],
  delivered_by_seller: ["received_by_buyer", "query_open"],
  received_by_buyer: ["released"],
  query_open: ["proof_window"],
  proof_window: ["under_admin_review", "released", "refunded"],
  under_admin_review: ["released", "refunded", "partially_refunded"],
  released: [],
  refunded: [],
  partially_refunded: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: DealStatus, to: DealStatus) {
  return allowedTransitions[from].includes(to);
}

export const statusLabel: Record<DealStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  funds_held: "Funds held",
  delivered_by_seller: "Seller delivered",
  received_by_buyer: "Receipt confirmed",
  released: "Released to seller",
  query_open: "Query opened",
  proof_window: "Proof needed",
  under_admin_review: "Under review",
  refunded: "Refunded to buyer",
  partially_refunded: "Partially refunded",
  cancelled: "Cancelled",
  expired: "Expired",
};

export type StatusTone = "neutral" | "info" | "warn" | "success" | "danger";

export const statusTone: Record<DealStatus, StatusTone> = {
  draft: "neutral",
  awaiting_payment: "info",
  funds_held: "info",
  delivered_by_seller: "info",
  received_by_buyer: "success",
  released: "success",
  query_open: "warn",
  proof_window: "warn",
  under_admin_review: "warn",
  refunded: "neutral",
  partially_refunded: "neutral",
  cancelled: "neutral",
  expired: "danger",
};

export function isTerminal(status: DealStatus) {
  return (
    status === "released" ||
    status === "refunded" ||
    status === "partially_refunded" ||
    status === "cancelled" ||
    status === "expired"
  );
}

/**
 * True when real funds are currently locked in escrow for this status —
 * paid in, not yet released or refunded. Used for the Home "in escrow now"
 * snapshot so it never counts unpaid (awaiting_payment) or settled deals.
 */
export function isFundsLocked(status: DealStatus) {
  return (
    status === "funds_held" ||
    status === "delivered_by_seller" ||
    status === "received_by_buyer" ||
    status === "query_open" ||
    status === "proof_window" ||
    status === "under_admin_review"
  );
}
