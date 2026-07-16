import type { Deal } from "@/types/deal";
import { isTerminal } from "@/lib/stateMachine";

export const ACTIVE_DEAL_LIMIT = 10;
export const ACTIVE_DEAL_LIMIT_MESSAGE =
  "You already have 10 active deals. Finish or close one before creating another.";

function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, "").toLowerCase();
}

export function countActiveSellerDeals(
  deals: Iterable<Deal>,
  sellerAddress: string
): number {
  const seller = normalizeAddress(sellerAddress);
  if (!seller) return 0;
  let count = 0;
  for (const deal of deals) {
    if (
      normalizeAddress(deal.sellerWalletAddress) === seller &&
      !isTerminal(deal.status)
    ) {
      count += 1;
    }
  }
  return count;
}

export function cleanDealCreationError(message: string): string {
  if (/10 active deals/i.test(message)) return ACTIVE_DEAL_LIMIT_MESSAGE;
  return message;
}
