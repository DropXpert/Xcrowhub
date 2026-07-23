import { getNimWallet, getWallet } from "@/wallet";
import type { AuthChallenge } from "@/wallet/WalletProvider";
import type { Currency } from "@/types/deal";
import { setSupabaseAccessToken, isSupabaseConfiguredForClient } from "./supabase";
import { supabaseConfig } from "./config";

const STORAGE_KEY = "proofhold.auth.v1";

// ── Persisted auth session ─────────────────────────────────────────────────

export interface AuthSession {
  token: string;
  address: string;
  currency: Currency;
  role: string;
  expiresAt: number; // epoch ms
}

export function loadStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    const session: AuthSession = {
      ...parsed,
      currency: parsed.currency ?? "NIM",
    };
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Local admin address override ──────────────────────────────────────────
// Set VITE_ADMIN_ADDRESSES in .env.local (comma-separated wallet addresses).
// Used as a fallback when the edge function is unreachable and as a supplement
// when the edge function doesn't have PROOFHOLD_ADMIN_ADDRESSES configured.

function resolveLocalRole(address: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_ADMIN_ADDRESSES ?? "";
  const locals = raw.split(",").map((s) => s.trim().replace(/\s+/g, "").toLowerCase()).filter(Boolean);
  const compact = address.replace(/\s+/g, "").toLowerCase();
  return locals.includes(compact) ? "admin" : "authenticated";
}

// ── Core login flow ────────────────────────────────────────────────────────

export async function loginWithWallet(currency: Currency = "NIM"): Promise<AuthSession | null> {
  if (!isSupabaseConfiguredForClient()) {
    // Pure local demo — no auth needed.
    return null;
  }

  // NIM is selected synchronously so the browser Hub can open during the
  // original click. Awaiting provider discovery first would trigger blockers.
  const wallet = currency === "NIM" ? getNimWallet() : await getWallet(currency);
  let address = "";

  try {
    const edgeBase = `${supabaseConfig.url}/functions/v1/auth`;
    let challenge: AuthChallenge;
    let signature: string;
    let publicKey: string | undefined;

    if (wallet.authenticate) {
      // Browser Hub: address selection + nonce signing happen in one popup.
      const authenticated = await wallet.authenticate(() => requestChallenge(edgeBase));
      address = authenticated.address;
      challenge = {
        nonce: authenticated.nonce,
        message: authenticated.message,
      };
      signature = authenticated.signature;
      publicKey = authenticated.publicKey;
    } else {
      // Injected providers already expose an account before message signing.
      address = await wallet.getAddress();
      challenge = await requestChallenge(edgeBase, address);
      const signed = await wallet.signMessage(challenge.message);
      signature = signed.signature;
      publicKey = signed.publicKey;
    }

    // Step 3: POST to verify + mint JWT
    const authRes = await fetch(edgeBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        signature,
        publicKey,
        message: challenge.message,
        nonce: challenge.nonce,
        network: currency === "NIM" ? "nimiq" : "evm",
      }),
    });

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({ error: authRes.statusText }));
      throw new Error((err as any).error || `Auth failed: ${authRes.status}`);
    }

    const { token, role: edgeRole, warning } = await authRes.json() as {
      token: string | null;
      address: string;
      role: string;
      warning?: string;
    };

    if (warning) console.warn("[ProofHold auth]", warning);

    // Local env can promote to admin even if edge function doesn't have PROOFHOLD_ADMIN_ADDRESSES set.
    const localRole = resolveLocalRole(address);
    const role = localRole === "admin" ? "admin" : edgeRole;

    const session: AuthSession = {
      token: token ?? "",
      address,
      currency,
      role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    };

    saveSession(session);

    if (token) {
      await setSupabaseAccessToken(token);
    }

    return session;
  } catch (err) {
    console.error("[ProofHold auth] loginWithWallet failed:", err);
    // Do NOT fall back to an empty-token session when Supabase is configured —
    // that would let anyone appear "logged in" without a verified wallet sig.
    // Only fall back in pure local/demo mode (no Supabase URL).
    if (isSupabaseConfiguredForClient()) {
      throw err;
    }
    const role = resolveLocalRole(address);
    const session: AuthSession = {
      token: "",
      address,
      currency,
      role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    saveSession(session);
    return session;
  }
}

async function requestChallenge(
  edgeBase: string,
  address?: string,
): Promise<AuthChallenge> {
  const suffix = address ? `?address=${encodeURIComponent(address)}` : "";
  const response = await fetch(`${edgeBase}${suffix}`);
  if (!response.ok) {
    throw new Error(`Nonce request failed: ${await response.text()}`);
  }
  const data = await response.json() as AuthChallenge;
  return { nonce: data.nonce, message: data.message };
}

export async function applyStoredSession(): Promise<AuthSession | null> {
  const session = loadStoredSession();
  if (session?.token) {
    // setSupabaseAccessToken is now sync (rebuilds client with header)
    // but keep await so callers don't break if it becomes async again.
    await setSupabaseAccessToken(session.token);
  }
  return session;
}
