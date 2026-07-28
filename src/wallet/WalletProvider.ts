import type { Currency } from "@/types/deal";

export interface SendPaymentParams {
  from?: string;
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

export interface AuthChallenge {
  nonce: string;
  message: string;
}

export interface WalletAuthentication extends SignResult, AuthChallenge {
  address: string;
}

export interface WalletProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getAddress(): Promise<string>;
  sendPayment(params: SendPaymentParams): Promise<PaymentResult>;
  /**
   * Browser wallets can open their approval UI immediately, while the app
   * finishes the server-side payment reservation in the supplied promise.
   * This avoids popup blockers without weakening the escrow reservation.
   */
  sendPaymentWhenReady?(
    params: Promise<SendPaymentParams>
  ): Promise<PaymentResult>;
  signMessage(message: string): Promise<SignResult>;
  /**
   * Optional one-window browser login. The provider selects the address and
   * signs the asynchronously loaded nonce in the same user-initiated popup.
   */
  authenticate?(
    loadChallenge: () => Promise<AuthChallenge>
  ): Promise<WalletAuthentication>;
}
