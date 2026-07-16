import type { Currency } from "@/types/deal";

export interface SendPaymentParams {
  to: string;
  amount: string;
  currency: Currency;
  memo?: string;
}

export interface PaymentResult {
  txHash: string;
}

/**
 * Single point of contact with whichever wallet runtime hosts the app.
 * Payment code should depend on this interface, never a concrete provider.
 */
export interface SignResult {
  signature: string;
  publicKey?: string; // present for Nimiq (Ed25519); absent for EVM (address-recoverable)
}

export interface WalletProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getAddress(): Promise<string>;
  sendPayment(params: SendPaymentParams): Promise<PaymentResult>;
  signMessage(message: string): Promise<SignResult>;
}
