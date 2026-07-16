/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NIMIQ_NETWORK?: string;
  readonly VITE_PROOFHOLD_CUSTODY_NIM_ADDR?: string;
  readonly VITE_USDT_CHAIN_ID?: string;
  readonly VITE_USDT_CONTRACT_ADDR?: string;
  readonly VITE_USDT_DECIMALS?: string;
  readonly VITE_PROOFHOLD_CUSTODY_EVM_ADDR?: string;

  // Supabase (safe for client bundle — RLS + server procedures protect writes)
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
