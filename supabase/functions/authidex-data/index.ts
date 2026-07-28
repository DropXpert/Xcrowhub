// Read-only XcrowHub activity API for AuthideX.
//
// POST { action: "activity", campaign_id?, wallet_address }
// POST { action: "issue_coupon", campaign_id, external_user_id }
// POST { action: "referral_detail", wallet_address }
// Header: X-AuthideX-Signature: sha256=<HMAC-SHA256(raw request body)>
//
// AuthideX owns referral attribution and rewards. This endpoint intentionally
// returns aggregate private-deal activity only; it never accepts referral IDs
// and never sends events back to AuthideX.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DATA_SECRET = Deno.env.get("AUTHIDEX_DATA_SECRET") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-authidex-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!DATA_SECRET) return json({ error: "AUTHIDEX_DATA_SECRET is not configured" }, 500);

  const rawBody = await req.text();
  const signature = req.headers.get("x-authidex-signature") ?? "";
  if (!(await verifySignature(rawBody, signature, DATA_SECRET))) {
    return json({ error: "Invalid signature" }, 401);
  }

  try {
    const body = JSON.parse(rawBody) as {
      action?: unknown;
      campaign_id?: unknown;
      wallet_address?: unknown;
      external_user_id?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "activity";
    const walletAddress = typeof body.wallet_address === "string"
      ? body.wallet_address.trim().slice(0, 120)
      : "";

    if (action === "referral_detail") {
      const referralWallet = typeof body.wallet_address === "string"
        ? body.wallet_address.trim().slice(0, 120)
        : "";
      if (!referralWallet) return json({ error: "wallet_address is required" }, 400);

      const { data, error } = await supabase.rpc("authidex_referral_detail_for_wallet", {
        p_wallet_address: referralWallet,
      });
      if (error) {
        console.error("[authidex-data] referral detail failed", error.message);
        return json({ error: "Could not read wallet referral activity" }, 502);
      }
      return json({ action, ...(data ?? {}) });
    }

    if (action === "issue_coupon") {
      const campaignId = typeof body.campaign_id === "string"
        ? body.campaign_id.trim().slice(0, 120)
        : "";
      const externalUserId = typeof body.external_user_id === "string"
        ? body.external_user_id.trim().slice(0, 160)
        : null;
      if (!campaignId) return json({ error: "campaign_id is required" }, 400);
      if (!externalUserId) return json({ error: "external_user_id is required" }, 400);

      const { data, error } = await supabase.rpc("issue_campaign_coupon", {
        p_campaign_id: campaignId,
        p_external_user_id: externalUserId,
      });
      if (error) {
        console.error("[authidex-data] coupon issue failed", error.message);
        return json({ error: "Could not issue a campaign coupon" }, 502);
      }
      return json({ action, ...(data ?? {}) });
    }

    if (action !== "activity") return json({ error: "Unsupported action" }, 400);
    if (!walletAddress) return json({ error: "wallet_address is required" }, 400);

    const { data, error } = await supabase.rpc("authidex_activity_for_wallet", {
      p_wallet_address: walletAddress,
    });
    if (error) {
      console.error("[authidex-data] activity query failed", error.message);
      return json({ error: "Could not read wallet activity" }, 502);
    }

    return json({
      action,
      campaign_id: typeof body.campaign_id === "string" ? body.campaign_id.slice(0, 120) : null,
      ...(data ?? {
        wallet_address: walletAddress,
        has_created_private_deal: false,
        private_deals_created: 0,
        private_deals_completed: 0,
        first_private_deal_completed_at: null,
        referral_count: 0,
        qualified_referral_count: 0,
        referral_count_source: "xcrowhub",
      }),
    });
  } catch (error) {
    console.error("[authidex-data] request failed", error);
    return json({ error: "Invalid request" }, 400);
  }
});

async function verifySignature(body: string, provided: string, secret: string) {
  const expected = await hmacHex(body, secret);
  const supplied = provided.trim().replace(/^sha256=/i, "").toLowerCase();
  return supplied.length === expected.length && constantTimeEqual(supplied, expected);
}

async function hmacHex(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
