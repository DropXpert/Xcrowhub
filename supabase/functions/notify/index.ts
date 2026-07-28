// XcrowHub — Notification delivery Edge Function
//
// Called by the pg_cron flush (flush_notifications) for each unsent notification.
// Sends the message to the recipient's linked Telegram chat and marks the row
// tg_sent_at on success so it isn't re-sent.
//
// POST { notification_id, chat_id, title, text, url }
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
//   CRON_SECRET                              (shared secret the cron sends)
//   TELEGRAM_BOT_TOKEN                       (BotFather token)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

// The Telegram button can't carry a nimiqpay:// scheme, so it points at a tiny
// redirect on the marketing site that bounces into the mini app.
const OPEN_BASE = "https://www.xcrowhub.com/open?to=";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!CRON_SECRET || token !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  try {
    const { notification_id, chat_id, title, text, url } =
      (await req.json()) as {
        notification_id?: string;
        chat_id?: number;
        title?: string;
        text?: string;
        url?: string;
      };

    if (!chat_id) return json({ ok: false, reason: "no chat_id" });
    if (!BOT_TOKEN) return json({ ok: false, reason: "TELEGRAM_BOT_TOKEN not set" }, 500);

    const message = [title, text].filter(Boolean).join("\n");
    const reply_markup = url
      ? { inline_keyboard: [[{ text: "Open in XcrowHub", url: OPEN_BASE + encodeURIComponent(url) }]] }
      : undefined;

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: message,
        reply_markup,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("[notify] telegram error", res.status, detail.slice(0, 200));
      return json({ ok: false, status: res.status }, 200); // leave unsent → cron retries
    }

    if (notification_id) {
      await supabase
        .from("notifications")
        .update({ tg_sent_at: new Date().toISOString() })
        .eq("id", notification_id);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[notify] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
