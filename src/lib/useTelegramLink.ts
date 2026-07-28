import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import { TELEGRAM_BOT } from "@/lib/host";

/* Shared status + connect/disconnect for the user's Telegram notification link.
   Both TelegramConnectCard (Profile) and DealPushCta (Deal Timeline) consume
   this so the RPC surface stays in one place.

   The visibilitychange re-fetch is debounced to 30 s. Without the guard, quickly
   flipping between tabs on the Deal screen fires get_my_notification_settings
   on every focus — noisy for the DB and doesn't add fresher state. */

const REFRESH_MIN_INTERVAL_MS = 30_000;

export type TelegramLinkState = "loading" | "linked" | "unlinked";

export interface TelegramLinkApi {
  state: TelegramLinkState;
  username: string | null;
  busy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTelegramLink(): TelegramLinkApi {
  const [state, setState] = useState<TelegramLinkState>("loading");
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshedAtRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfiguredForClient()) {
      setState("unlinked");
      return;
    }
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        "get_my_notification_settings"
      );
      if (rpcError) throw new Error(rpcError.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.telegram_linked) {
        setState("linked");
        setUsername(row.telegram_username ?? null);
      } else {
        setState("unlinked");
        setUsername(null);
      }
    } catch (err) {
      setState("unlinked");
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't load Telegram link status"
      );
    } finally {
      refreshedAtRef.current = Date.now();
    }
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: token, error: rpcErr } = await getSupabaseClient().rpc(
        "create_telegram_link_token"
      );
      if (rpcErr || !token) {
        throw rpcErr ?? new Error("Couldn't mint link token");
      }
      window.open(
        `https://t.me/${TELEGRAM_BOT}?start=${token}`,
        "_blank",
        "noopener"
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Couldn't start Telegram link";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await getSupabaseClient().rpc(
        "unlink_telegram"
      );
      if (rpcError) throw new Error(rpcError.message);
      setState("unlinked");
      setUsername(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Couldn't unlink Telegram";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - refreshedAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { state, username, busy, error, connect, disconnect, refresh };
}
