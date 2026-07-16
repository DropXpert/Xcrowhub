// Network + custody config read from Vite env vars.
//
// All `import.meta.env.VITE_*` values are inlined at build time. Anything
// secret (e.g. private keys, custody seed words) must NEVER live here —
// these values ship in the client bundle.

export type NimiqNetwork = "main" | "test";

const PLACEHOLDER_NQ = "NQ00 0000 0000 0000 0000 0000 0000 0000 0000";
const PLACEHOLDER_EVM = "0x0000000000000000000000000000000000000000";

function readString(name: string, fallback: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function readNumber(name: string, fallback: number): number {
  const raw = (import.meta.env as Record<string, string | undefined>)[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  nimiq: {
    network: (readString("VITE_NIMIQ_NETWORK", "main") as NimiqNetwork) ?? "main",
    custodyAddress: readString("VITE_PROOFHOLD_CUSTODY_NIM_ADDR", PLACEHOLDER_NQ),
  },
  usdt: {
    chainId: readNumber("VITE_USDT_CHAIN_ID", 137),
    contractAddress: readString(
      "VITE_USDT_CONTRACT_ADDR",
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
    ),
    decimals: readNumber("VITE_USDT_DECIMALS", 6),
    custodyAddress: readString("VITE_PROOFHOLD_CUSTODY_EVM_ADDR", PLACEHOLDER_EVM),
  },
} as const;

export function isCustodyConfigured(currency: "NIM" | "USDT"): boolean {
  if (currency === "NIM") {
    return config.nimiq.custodyAddress !== PLACEHOLDER_NQ;
  }
  return config.usdt.custodyAddress.toLowerCase() !== PLACEHOLDER_EVM;
}

export function custodyAddressFor(currency: "NIM" | "USDT"): string {
  return currency === "NIM"
    ? config.nimiq.custodyAddress
    : config.usdt.custodyAddress;
}

export function normalizeWalletAddress(address: string): string {
  return address.replace(/\s+/g, "").toLowerCase();
}

export function isCustodyAddress(
  currency: "NIM" | "USDT",
  address: string
): boolean {
  const custodyAddress = custodyAddressFor(currency);
  if (!address || !custodyAddress) return false;
  return normalizeWalletAddress(address) === normalizeWalletAddress(custodyAddress);
}

// Supabase (client-safe anon key + URL). When present the app uses remote mode.
export const supabaseConfig = {
  url: readString("VITE_SUPABASE_URL", ""),
  anonKey: readString("VITE_SUPABASE_ANON_KEY", ""),
};

export function isSupabaseConfigured(): boolean {
  return supabaseConfig.url.length > 0 && supabaseConfig.anonKey.length > 0;
}
