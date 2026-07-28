import type { Deal } from "@/types/deal";
import { WalletAddressBadge } from "./WalletAddressBadge";
import { CategoryTag } from "./CategoryTag";

export function ReceiptSummary({ deal }: { deal: Deal }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="space-y-0.5">
          <p className="field-label">Protected deal</p>
          <h2 className="text-[16px] font-semibold leading-snug text-ink">
            {deal.title}
          </h2>
        </div>
        <div className="text-right">
          <p className="field-label">Price</p>
          <p className="text-[16px] font-semibold tabular-nums text-ink">
            {deal.priceAmount}{" "}
            <span className="text-muted">{deal.priceCurrency}</span>
          </p>
        </div>
      </header>

      <div className="perforation mt-5" />

      <dl className="grid gap-4 px-5 pb-5">
        {deal.description ? (
          <Row label="Notes">{deal.description}</Row>
        ) : null}
        <Row label="What counts as delivery">
          {deal.requiredDeliveryProof}
        </Row>
        <Row label="Refund terms">{deal.refundTerms}</Row>
        <Row label="Delivery deadline">
          {deal.deliveryDeadlineHours} hours from payment
        </Row>
        <Row label="Confirmation window">
          {deal.confirmationWindowHours} hours after delivery
        </Row>
        {deal.category ? (
          <Row label="Category">
            <CategoryTag category={deal.category} />
          </Row>
        ) : null}
        <Row label="Seller">
          <WalletAddressBadge address={deal.sellerWalletAddress} />
        </Row>
        {deal.buyerWalletAddress ? (
          <Row label="Buyer">
            <WalletAddressBadge address={deal.buyerWalletAddress} />
          </Row>
        ) : null}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="field-label pt-0.5">{label}</dt>
      <dd className="text-[14px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}
