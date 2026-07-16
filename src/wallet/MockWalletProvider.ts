import { mockTxHash, mockWalletAddress } from "@/lib/ids";
import type {
  PaymentResult,
  SendPaymentParams,
  WalletProvider,
} from "./WalletProvider";

const STORAGE_KEY = "proofhold.mockWallet.address";

function loadAddress(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // localStorage unavailable — fall through
  }
  const fresh = mockWalletAddress();
  try {
    localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // ignore
  }
  return fresh;
}

export class MockWalletProvider implements WalletProvider {
  readonly name = "Mock wallet";

  async isAvailable() {
    return true;
  }

  async getAddress() {
    return loadAddress();
  }

  async sendPayment(_params: SendPaymentParams): Promise<PaymentResult> {
    // Simulate a wallet round-trip so the UI loading state is exercised.
    await new Promise((r) => setTimeout(r, 900));
    return { txHash: mockTxHash() };
  }

  async signMessage(message: string): Promise<import("./WalletProvider").SignResult> {
    const fake = Array.from(message)
      .map((c, i) => ((c.charCodeAt(0) + i) % 16).toString(16))
      .join("");
    return { signature: `0xmock${fake}${"0".repeat(64 - 4 - fake.length)}` };
  }
}
