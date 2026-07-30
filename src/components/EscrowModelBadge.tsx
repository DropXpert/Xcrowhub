import { Building2, FileCode2 } from "lucide-react";
import type { Deal } from "@/types/deal";
import { isSmartUsdtDeal } from "@/lib/usdtEscrow";

export function EscrowModelBadge({
  deal,
  compact = false,
}: {
  deal: Deal;
  compact?: boolean;
}) {
  const smart = isSmartUsdtDeal(deal);
  const Icon = smart ? FileCode2 : Building2;
  const label = smart
    ? "Non-custodial smart contract"
    : "XcrowHub managed custody";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        smart
          ? "border-jade/25 bg-jade/10 text-jade"
          : "border-gold/25 bg-gold/10 text-gold"
      }`}
      title={
        smart
          ? "USDT is locked in an immutable Polygon escrow contract."
          : `${deal.priceCurrency} is held and settled by XcrowHub's managed custody service.`
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {compact ? (smart ? "Smart-contract escrow" : "Managed escrow") : label}
    </span>
  );
}
