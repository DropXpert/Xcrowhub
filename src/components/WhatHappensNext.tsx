import type { DealStatus } from "@/types/deal";
import { ArrowRight } from "lucide-react";

const copyByStatus: Partial<Record<DealStatus, string[]>> = {
  awaiting_payment:     ["Share the link with your buyer.", "Funds lock on payment."],
  funds_held:           ["Deliver, then mark as delivered with proof.", "Buyer confirms to release funds."],
  delivered_by_seller:  ["Waiting for buyer to confirm receipt.", "Buyer can raise a dispute if something is wrong."],
  received_by_buyer:    ["Releasing funds to the seller."],
  released:             ["Deal complete."],
  query_open:           ["Both sides have 24 h to submit proof.", "Whoever submits wins if the other side doesn't."],
  proof_window:         ["Submit your proof before the deadline.", "If both submit, an admin decides."],
  under_admin_review:   ["Admin is reviewing both proofs.", "Decision: release, refund, or partial refund."],
  refunded:             ["Buyer refunded. Deal closed."],
  partially_refunded:   ["Funds split between buyer and seller."],
  cancelled:            ["Cancelled before payment."],
  expired:              ["Expired before payment."],
};

export function WhatHappensNext({ status }: { status: DealStatus }) {
  const lines = copyByStatus[status];
  if (!lines || lines.length === 0) return null;
  return (
    <section className="rounded-card border border-edge bg-accent-soft/40 px-4 py-3.5">
      <p className="field-label text-accent-ink">What happens next</p>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[13.5px] text-ink">
            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
