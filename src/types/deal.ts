export type Currency = "NIM" | "USDT";

export type DealCategory =
  | "digital_goods"
  | "design"
  | "content"
  | "software"
  | "consulting"
  | "gaming"
  | "other";

export const DEAL_CATEGORIES: DealCategory[] = [
  "digital_goods",
  "design",
  "content",
  "software",
  "consulting",
  "gaming",
  "other",
];

export const CATEGORY_LABELS: Record<DealCategory, string> = {
  digital_goods: "Digital goods",
  design: "Design",
  content: "Content",
  software: "Software",
  consulting: "Consulting",
  gaming: "Gaming",
  other: "Other",
};

export interface Feedback {
  id: string;
  dealId: string;
  fromAddr: string;
  toAddr: string;
  fromRole: "buyer" | "seller";
  rating: number;
  comment: string;
  createdAt: string;
}

export type PartyRole = "buyer" | "seller" | "admin";

export type ProofStatus = "not_submitted" | "submitted";

export type DealStatus =
  | "draft"
  | "awaiting_payment"
  | "funds_held"
  | "delivered_by_seller"
  | "received_by_buyer"
  | "released"
  | "query_open"
  | "proof_window"
  | "under_admin_review"
  | "refunded"
  | "partially_refunded"
  | "cancelled"
  | "expired";

export type QueryReason =
  | "product_not_received"
  | "wrong_product"
  | "broken_link"
  | "incomplete_delivery"
  | "buyer_not_confirming"
  | "false_claim"
  | "no_response"
  | "other";

export type AdminDecisionType =
  | "release_to_seller"
  | "refund_to_buyer"
  | "partial_refund";

export interface Proof {
  id: string;
  dealId: string;
  submittedBy: "buyer" | "seller";
  explanation: string;
  txHash?: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface DealQuery {
  id: string;
  dealId: string;
  raisedBy: "buyer" | "seller";
  reason: QueryReason;
  details: string;
  createdAt: string;
}

export interface AdminDecision {
  id: string;
  dealId: string;
  decision: AdminDecisionType;
  buyerAmount?: string;
  sellerAmount?: string;
  reason: string;
  decidedBy: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  dealId: string;
  at: string;
  label: string;
  detail?: string;
  kind:
    | "created"
    | "paid"
    | "delivered"
    | "received"
    | "released"
    | "query"
    | "proof"
    | "admin"
    | "refund"
    | "cancelled"
    | "expired";
}

export interface Deal {
  id: string;
  title: string;
  description: string;
  priceAmount: string;
  priceCurrency: Currency;

  sellerWalletAddress: string;
  buyerWalletAddress?: string;

  deliveryDeadlineHours: number;
  confirmationWindowHours: number;

  requiredDeliveryProof: string;
  refundTerms: string;

  status: DealStatus;

  paymentTxHash?: string;
  escrowTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;

  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  deliveredAt?: string;
  receivedAt?: string;
  releasedAt?: string;
  refundedAt?: string;

  paymentDeadlineAt?: string;
  proofDeadlineAt?: string;
  confirmationDeadlineAt?: string;

  buyerProofStatus: ProofStatus;
  sellerProofStatus: ProofStatus;

  deliveryNote?: string;
  category?: DealCategory;

  // Set when the deal originated from a marketplace listing (direct buy or
  // accepted offer). Used to credit the listing's order count on release.
  listingId?: string;

  // Platform fee actually taken at payout, recorded by the payout function.
  // Only non-zero on a full release of a marketplace deal (1% of the price,
  // kept in custody — the seller receives priceAmount − feeAmount).
  feeAmount?: string;
  feeBps?: number;
}
