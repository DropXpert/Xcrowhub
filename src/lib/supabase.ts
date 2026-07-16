import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig, isSupabaseConfigured } from "./config";

// Current wallet JWT — set after successful auth, cleared on logout.
let _currentToken: string | null = null;

// We recreate the client whenever the token changes so every subsequent
// PostgREST / RPC / Storage call carries the correct Authorization header.
// With persistSession:false, auth.setSession() does NOT reliably inject
// the token into request headers — global.headers is the only safe path.
let _client: SupabaseClient | null = null;

function buildClient(token: string | null): SupabaseClient {
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    },
  });
}

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  if (!_client) {
    _client = buildClient(_currentToken);
  }
  return _client;
}

export function isSupabaseConfiguredForClient(): boolean {
  return isSupabaseConfigured();
}

/**
 * Inject the wallet-signature JWT so all subsequent Supabase calls are
 * authenticated. Recreates the client with the token in Authorization header.
 */
export async function setSupabaseAccessToken(token: string) {
  _currentToken = token;
  _client = buildClient(token);
  // Realtime authenticates over its own socket, separate from global headers.
  // Without this, RLS-restricted tables (e.g. notifications) evaluate as anon
  // and the subscription receives no rows.
  try {
    _client.realtime.setAuth(token);
  } catch {
    // ignore — realtime auth is best-effort
  }
}

/**
 * Clear auth on logout — reverts to anon key.
 */
export function clearSupabaseAccessToken() {
  _currentToken = null;
  _client = buildClient(null);
  try {
    _client.realtime.setAuth(supabaseConfig.anonKey);
  } catch {
    // ignore
  }
}

export type { SupabaseClient } from "@supabase/supabase-js";
