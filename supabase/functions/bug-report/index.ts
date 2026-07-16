// XcrowHub beta bug reports
//
// POST { summary, description, contact, sourcePath, walletAddress, userAgent, createdAt }
// Sends a report email to official@xcrowhub.com via Resend.
//
// Required secret:
//   RESEND_API_KEY
//
// Optional secrets:
//   BUG_REPORT_TO_EMAIL=official@xcrowhub.com
//   BUG_REPORT_FROM_EMAIL="XcrowHub Bug Reports <bugs@xcrowhub.com>"

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TO_EMAIL = Deno.env.get("BUG_REPORT_TO_EMAIL") ?? "official@xcrowhub.com";
const FROM_EMAIL =
  Deno.env.get("BUG_REPORT_FROM_EMAIL") ?? "XcrowHub Bug Reports <bugs@xcrowhub.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BugReportBody {
  summary?: string;
  description?: string;
  contact?: string;
  sourcePath?: string;
  walletAddress?: string;
  userAgent?: string;
  createdAt?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as BugReportBody;
    const summary = clean(body.summary, 120) || "New report";
    const description = clean(body.description, 4000);
    const contact = clean(body.contact, 180);
    const sourcePath = clean(body.sourcePath, 300);
    const walletAddress = clean(body.walletAddress, 120);
    const userAgent = clean(body.userAgent, 500);
    const createdAt = clean(body.createdAt, 80) || new Date().toISOString();

    if (!description) return json({ error: "description is required" }, 400);
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY is not set" }, 500);

    const subject = `[XcrowHub Beta Bug] ${summary}`;
    const text = [
      `Bug: ${summary}`,
      "",
      description,
      "",
      `Source: ${sourcePath || "Unknown"}`,
      `Wallet: ${walletAddress || "Not connected"}`,
      `Contact: ${contact || "Not provided"}`,
      `User agent: ${userAgent || "Unknown"}`,
      `Time: ${createdAt}`,
    ].join("\n");

    const html = `
      <h2>XcrowHub beta bug report</h2>
      <p><strong>Bug:</strong> ${escapeHtml(summary)}</p>
      <p><strong>Description:</strong></p>
      <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace">${escapeHtml(description)}</pre>
      <hr />
      <p><strong>Source:</strong> ${escapeHtml(sourcePath || "Unknown")}</p>
      <p><strong>Wallet:</strong> ${escapeHtml(walletAddress || "Not connected")}</p>
      <p><strong>Contact:</strong> ${escapeHtml(contact || "Not provided")}</p>
      <p><strong>User agent:</strong> ${escapeHtml(userAgent || "Unknown")}</p>
      <p><strong>Time:</strong> ${escapeHtml(createdAt)}</p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "xcrowhub-bug-report/1.0",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("[bug-report] resend error", res.status, detail.slice(0, 500));
      return json({ error: "Email provider rejected the report" }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[bug-report] error", err);
    return json({ error: "Failed to send bug report" }, 500);
  }
});

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
