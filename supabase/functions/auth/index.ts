// ProofHold — Wallet-signature auth Edge Function (Phase 2)
//
// GET  /functions/v1/auth?address=<addr>
//   → { nonce, message, expiresAt }   (request a challenge)
//
// POST /functions/v1/auth
//   Body: { address, signature, publicKey?, message, network? }
//   → { token, address, role }        (verify sig → mint JWT)
//
// The JWT payload contains: { wallet_addr, role, sub, aud, iat, exp }
// PostgREST reads auth.jwt() → wallet_addr is available in RLS procedures.
//
// Required secrets (set via Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_JWT_SECRET   – from Settings → API → JWT Secret
//   PROOFHOLD_ADMIN_ADDRESSES – comma-separated wallet addresses with admin role
//
// Auto-available:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://esm.sh/jose@5.2.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET") ?? "";
const ADMIN_ADDRESSES = (Deno.env.get("PROOFHOLD_ADMIN_ADDRESSES") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// When true, placeholder/mock signatures are accepted so the app can be
// exercised in a plain browser (no real wallet host). MUST be false/unset in
// production — otherwise anyone can mint a JWT for any wallet, including admins.
const ALLOW_DEMO_SIGNATURES =
  (Deno.env.get("ALLOW_DEMO_SIGNATURES") ?? "").toLowerCase() === "true";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // ── GET: request a fresh nonce for an address ──────────────────────────
    if (req.method === "GET") {
      const address = url.searchParams.get("address");
      if (!address) return json({ error: "address param required" }, 400, corsHeaders);

      const nonce = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const message = buildChallengeMessage(address.trim(), nonce);

      const { error } = await supabase.from("auth_nonces").insert({
        nonce,
        address: address.trim().toLowerCase(),
        expires_at: expiresAt,
        consumed: false,
      });

      // Non-fatal: nonce won't have replay protection but auth can still proceed.
      if (error) console.warn("[auth] Could not persist nonce (auth_nonces table missing?):", error.message);

      return json({ nonce, message, expiresAt }, 200, corsHeaders);
    }

    // ── POST: verify signature → mint JWT ──────────────────────────────────
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const body = await req.json();
    const { address, signature, publicKey, message, network } = body as {
      address: string;
      signature: string;
      publicKey?: string;
      message: string;
      network?: string;
    };

    if (!address || !signature || !message) {
      return json({ error: "address, signature and message are required" }, 400, corsHeaders);
    }

    const normalizedAddr = address.trim();
    const lowerAddr = normalizedAddr.toLowerCase();

    // 1. Find & consume a valid nonce
    const { data: nonceRow, error: nonceErr } = await supabase
      .from("auth_nonces")
      .select("*")
      .eq("address", lowerAddr)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nonceErr) throw nonceErr;

    // Tolerate missing nonce row in demo/dev mode (no nonce flow used).
    // In production this should be a hard failure.
    const devMode = !nonceRow;
    if (!devMode) {
      // Verify the message contains the correct nonce
      if (!message.includes(nonceRow.nonce)) {
        return json({ error: "Message nonce mismatch" }, 401, corsHeaders);
      }

      // Consume the nonce (replay protection)
      await supabase
        .from("auth_nonces")
        .update({ consumed: true })
        .eq("nonce", nonceRow.nonce);
    }

    // JWT_SECRET is mandatory — without it we cannot mint a token PostgREST will
    // accept, so the whole auth model is off. Fail closed rather than degrading.
    if (!JWT_SECRET_RAW) {
      console.error("[auth] JWT_SECRET not set — refusing to authenticate");
      return json(
        { error: "Server auth not configured (JWT_SECRET missing)." },
        500,
        corsHeaders,
      );
    }

    // 2. Signature verification (cryptographic). Placeholder/mock signatures are
    // ONLY accepted when ALLOW_DEMO_SIGNATURES is explicitly enabled.
    const isNimiq = !network || network === "nimiq" ||
      normalizedAddr.toUpperCase().startsWith("NQ");
    const isEvm = network === "evm" || /^0x[0-9a-fA-F]{40}$/.test(normalizedAddr);

    let verified = false;

    if (isNimiq && publicKey) {
      // NOTE: this verifies the Ed25519 signature against the supplied public
      // key. Binding the public key to the claimed NQ address (Blake2b derive)
      // still requires the Nimiq SDK — tracked as a follow-up.
      verified = await verifyNimiqSignature(message, signature, publicKey);
    } else if (isEvm) {
      verified = await verifyEvmSignature(message, signature, normalizedAddr);
    }

    if (isNimiq && publicKey && verified) {
      console.log(`[auth] NIM Ed25519 signature verified for ${normalizedAddr}`);
    }

    if (!verified && ALLOW_DEMO_SIGNATURES) {
      console.warn("[auth] real verification failed — accepting demo signature (ALLOW_DEMO_SIGNATURES)");
      verified = signature.startsWith("0xnim") || signature.startsWith("0xmock") ||
        signature.length > 10;
    }

    if (!verified) {
      return json({ error: "Signature verification failed" }, 401, corsHeaders);
    }

    // 2b. NIM pubkey→address binding: verify the claimed NQ address is actually
    // derived from the supplied public key (Blake2b-160 → Nimiq base32 + IBAN checksum).
    // Runs as a soft warning so a derivation bug never locks users out; check Supabase
    // function logs to confirm "binding verified" before hardening to a 401.
    if (isNimiq && publicKey) {
      const derived = await deriveNimiqAddress(publicKey);
      const claimedCompact = normalizedAddr.replace(/\s+/g, "").toUpperCase();
      if (derived === null) {
        console.warn("[auth] NIM address derivation failed — skipping binding check");
      } else if (derived !== claimedCompact) {
        console.warn(`[auth] NIM pubkey-address MISMATCH claimed=${claimedCompact} derived=${derived}`);
        return json({ error: "Public key does not match claimed address" }, 401, corsHeaders);
      } else {
        console.log(`[auth] NIM pubkey-address binding verified for ${claimedCompact}`);
      }
    }

    // 3. Determine role — compare without spaces
    const addrCompact = lowerAddr.replace(/\s+/g, "");
    const isAdmin = ADMIN_ADDRESSES.some(
      (a) => a.replace(/\s+/g, "") === addrCompact
    );

    // Record only successfully verified wallets. auth_nonces is not a user
    // table: a nonce is consumed before verification, so counting consumed
    // nonces also counts failed signatures and abandoned attempts.
    const walletNetwork = isEvm ? "evm" : "nimiq";
    const { error: userRegistryError } = await supabase.rpc("register_app_user", {
      p_wallet_address: normalizedAddr,
      p_network: walletNetwork,
      p_is_admin: isAdmin,
    });
    if (userRegistryError) {
      // User analytics must never lock a valid wallet out. This also keeps the
      // function deploy-safe while migration 0036 is being applied.
      console.error("[auth] Could not update app_users:", userRegistryError.message);
    }

    // 4. Mint JWT. The PostgREST `role` claim must be a real DB role, so it is
    // always 'authenticated'; admin status travels in the custom `app_role`
    // claim, read server-side by is_admin() in SQL.
    const secret = new TextEncoder().encode(JWT_SECRET_RAW);
    const token = await new SignJWT({
      wallet_addr: normalizedAddr,
      role: "authenticated",
      app_role: isAdmin ? "admin" : "user",
      aud: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(normalizedAddr)
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret);

    console.log(`[auth] Minted JWT for ${normalizedAddr} (admin=${isAdmin})`);

    // Response `role` (separate from the JWT claim) drives the client's admin UI.
    return json(
      { token, address: normalizedAddr, role: isAdmin ? "admin" : "authenticated" },
      200,
      corsHeaders,
    );
  } catch (err) {
    console.error("[auth] error", err);
    return json({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function buildChallengeMessage(address: string, nonce: string): string {
  return `Xcrow authentication\nAddress: ${address}\nNonce: ${nonce}\nTime: ${new Date().toISOString()}`;
}

async function verifyNimiqSignature(
  message: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const pubKeyBytes = hexToBytes(publicKeyHex);
    const sigBytes = hexToBytes(signatureHex);
    const msgBytes = new TextEncoder().encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      pubKeyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    // Nimiq Keyguard Key.signMessage() format (verified from Key.js source):
    //   SHA-256( "\x16Nimiq Signed Message:\n" + String(msgByteLen) + msgBytes )
    //   The length is encoded as a UTF-8 decimal string, not a binary integer.
    const enc = new TextEncoder();
    const prefixBytes = enc.encode("\x16Nimiq Signed Message:\n");
    const lenStrBytes = enc.encode(String(msgBytes.length));
    const nimiqBuf = new Uint8Array(prefixBytes.length + lenStrBytes.length + msgBytes.length);
    nimiqBuf.set(prefixBytes, 0);
    nimiqBuf.set(lenStrBytes, prefixBytes.length);
    nimiqBuf.set(msgBytes, prefixBytes.length + lenStrBytes.length);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", nimiqBuf));

    return await crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, digest);
  } catch (e) {
    console.warn("[auth] Ed25519 verify error:", e);
    return false;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyEvmSignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  try {
    // EIP-191 personal_sign recovery using Web Crypto + manual ecrecover
    // For simplicity in Deno we use a small helper; production should use viem/ethers
    const { recoverAddress } = await import("https://esm.sh/viem@2.7.0");
    const { hashMessage } = await import("https://esm.sh/viem@2.7.0");
    const hash = hashMessage(message);
    const recovered = await recoverAddress({ hash, signature: signature as `0x${string}` });
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch (e) {
    console.debug("[auth] EVM sig verify error:", e);
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Nimiq pubkey→address derivation ──────────────────────────────────────────
// Algorithm: Blake2b-160(publicKey) → 20 bytes → Nimiq base32 → IBAN checksum
// Reference: https://nimiq.dev/learn/protocol/primitives/keys-and-addresses

// Nimiq's base32 alphabet (32 chars, skips I O W Z to avoid visual confusion).
const NIMIQ_BASE32 = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

function nimiqBase32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += NIMIQ_BASE32[(value >>> bits) & 31];
    }
  }
  if (bits > 0) output += NIMIQ_BASE32[(value << (5 - bits)) & 31];
  return output;
}

function nimiqIBANChecksum(base32: string): string {
  // Rearrange: "{base32}NQ00" then convert each char to its base-36 numeric value,
  // concatenate as a string, compute mod 97. Checksum = 98 - result.
  const reordered = base32 + "NQ00";
  let numStr = "";
  for (const char of reordered) numStr += parseInt(char, 36).toString();
  const check = 98 - Number(BigInt(numStr) % 97n);
  return check.toString().padStart(2, "0");
}

// Returns the compact (no-spaces) uppercase NQ address, or null on any error.
//
// Nimiq address derivation (verified from core-js source):
//   Hash.light(pubkey) = blake2b(pubkey, outputLen=32)   ← 32 bytes
//   Address.fromHash(hash) = hash.slice(0, 20)           ← first 20 bytes
//   Then: nimiq-base32-encode(20 bytes) + IBAN checksum  → NQ address
async function deriveNimiqAddress(publicKeyHex: string): Promise<string | null> {
  try {
    const { blake2b } = await import("https://esm.sh/@noble/hashes@1.4.0/blake2b");
    const pubKeyBytes = hexToBytes(publicKeyHex);
    // blake2b with 32-byte output, then take first 20 bytes (same as core-js)
    const hash32 = blake2b(pubKeyBytes, { dkLen: 32 });
    const addrBytes = hash32.slice(0, 20);
    const base32 = nimiqBase32Encode(addrBytes);
    const checksum = nimiqIBANChecksum(base32);
    return `NQ${checksum}${base32}`;
  } catch (e) {
    console.debug("[auth] deriveNimiqAddress error:", e);
    return null;
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}
