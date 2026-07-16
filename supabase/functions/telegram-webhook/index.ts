// XcrowHub — Telegram webhook Edge Function
//
// Receives updates from the Telegram Bot API. Handles account linking:
//   /start <token>  → bind this chat to the wallet that minted <token>
//   /stop           → disable notifications for this chat
//
// Register once (after deploy):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d url=https://<ref>.supabase.co/functions/v1/telegram-webhook \
//     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Telegram echoes the secret token we set in setWebhook.
  if (WEBHOOK_SECRET && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) {
    return json({ ok: false }, 401);
  }

  try {
    const update = await req.json();
    const msg = update?.message;
    const text: string = (msg?.text ?? "").trim();
    const chatId: number | undefined = msg?.chat?.id;
    const username: string | null = msg?.from?.username ?? null;
    if (!chatId || !text) return json({ ok: true });

    if (text.startsWith("/start")) {
      const linkToken = text.split(/\s+/)[1];
      if (!linkToken) {
        await send(chatId, "👋 To link your account, open XcrowHub → Profile → Connect Telegram and tap the button there.");
        return json({ ok: true });
      }
      const { data: addr, error } = await supabase.rpc("link_telegram", {
        p_token: linkToken,
        p_chat_id: chatId,
        p_username: username,
      });
      if (error) {
        console.error("[telegram-webhook] link_telegram error", error.message);
        await send(chatId, "⚠️ Something went wrong linking your account. Please try again.");
      } else if (addr) {
        await send(chatId, "✅ Connected! You'll get deal, offer and dispute alerts here. Send /stop to unsubscribe.");
      } else {
        await send(chatId, "⚠️ This link expired or was already used. Generate a fresh one in XcrowHub → Profile → Connect Telegram.");
      }
    } else if (text.startsWith("/stop")) {
      await supabase.rpc("unlink_telegram_by_chat", { p_chat_id: chatId });
      await send(chatId, "🔕 Notifications stopped. Reconnect anytime from your XcrowHub profile.");
    } else {
      await send(chatId, "Open XcrowHub → Profile → Connect Telegram to link your account. Send /stop to unsubscribe.");
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[telegram-webhook] error", err);
    return json({ ok: true }); // always 200 so Telegram doesn't retry-storm
  }
});

async function send(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    console.error("[telegram-webhook] send error", err);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
