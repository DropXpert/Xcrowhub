import { NimiqWalletProvider } from "./NimiqWalletProvider";
import { NimiqHubWalletProvider } from "./NimiqHubWalletProvider";
import type { EvmWalletProvider } from "./EvmWalletProvider";
import type { WalletProvider } from "./WalletProvider";
import type { Currency } from "@/types/deal";
import { isCustodyConfigured } from "@/lib/config";
import { isNimiqPayHost } from "@/lib/host";

const nimiqPay = new NimiqWalletProvider();
const nimiqHub = new NimiqHubWalletProvider();
let devInstance: WalletProvider | null = null;

// ethers.js (268KB) is only needed for USDT/EVM — load it on demand so NIM-only
// sessions (and the gate/landing pages) never pay for it.
let evmInstance: EvmWalletProvider | null = null;
async function getEvmProvider(): Promise<EvmWalletProvider> {
  if (!evmInstance) {
    const { EvmWalletProvider } = await import("./EvmWalletProvider");
    evmInstance = new EvmWalletProvider();
  }
  return evmInstance;
}

async function getDevProvider(): Promise<WalletProvider> {
  if (!devInstance) {
    const { MockWalletProvider } = await import("./MockWalletProvider");
    devInstance = new MockWalletProvider();
  }
  return devInstance;
}

/**
 * Pick the right wallet provider for a given currency.
 *
 * NIM uses the injected Mini App provider inside Nimiq Pay and Nimiq Hub in
 * standard browsers.
 * USDT → EvmWalletProvider (uses window.ethereum, works inside Nimiq Pay's
 *   EVM bridge or any normal Web3 wallet).
 *
 * In production, missing wallet runtime or custody configuration is a hard
 * payment error. Local development can still use the dev provider.
 */
export async function getWallet(
  currency: Currency
): Promise<WalletProvider> {
  if (!isCustodyConfigured(currency)) {
    if (import.meta.env.DEV) return getDevProvider();
    throw new Error("Payments are temporarily unavailable.");
  }

  const real = currency === "NIM" ? getNimWallet() : await getEvmProvider();
  if (await real.isAvailable()) {
    return real;
  }
  if (import.meta.env.DEV) return getDevProvider();
  throw new Error(
    currency === "NIM"
      ? "Could not open the Nimiq wallet. Check your connection and try again."
      : "Open this inside Nimiq Pay or connect an EVM wallet."
  );
}

/** Synchronous so Hub can open its approval window during the user's click. */
export function getNimWallet(): WalletProvider {
  return isNimiqPayHost() ? nimiqPay : nimiqHub;
}

export type { WalletProvider } from "./WalletProvider";
