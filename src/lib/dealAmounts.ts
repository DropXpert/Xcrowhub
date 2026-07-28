import type { Currency } from "@/types/deal";
import { VALUE_LIMITS } from "@/lib/inputLimits";

export const MIN_DEAL_AMOUNT: Record<Currency, number> = {
  NIM: 1000,
  USDT: 1,
};

export function minimumDealAmount(currency: Currency): number {
  return MIN_DEAL_AMOUNT[currency];
}

export function validateDealAmount(value: string | number, currency: Currency): number {
  const amount = Number(value);
  const minimum = minimumDealAmount(currency);

  if (!Number.isFinite(amount) || amount < minimum || amount > VALUE_LIMITS.amount) {
    throw new Error(
      `Amount must be between ${minimum} ${currency} and ${VALUE_LIMITS.amount.toLocaleString()} ${currency}.`,
    );
  }

  return amount;
}
