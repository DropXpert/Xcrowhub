import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";

export interface AppNotification {
  id: string;
  type: "support_reply" | "deal_update" | "offer";
  title: string;
  body: string;
  url: string;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "read">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  startListening: (myTicketIds: string[]) => () => void;
  startNotificationFeed: (address: string) => () => void;
}

// Map a server notification kind to the bell's display type.
function mapKind(kind: string): AppNotification["type"] {
  if (kind === "offer") return "offer";
  if (kind === "support") return "support_reply";
  return "deal_update";
}

// Best-effort: persist read state to the server so the badge doesn't resurrect.
function syncRead(id: string | null) {
  if (!isSupabaseConfiguredForClient()) return;
  try {
    const sb = getSupabaseClient();
    Promise.resolve(sb.rpc("mark_notifications_read", id ? { p_ids: [id] } : {})).then(
      () => {},
      () => {}
    );
  } catch {
    // ignore
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (n) => {
        // Deduplicate by id
        if (get().notifications.some((x) => x.id === n.id)) return;
        const notif: AppNotification = { ...n, read: false };
        set((s) => ({
          notifications: [notif, ...s.notifications].slice(0, 50),
          unreadCount: s.unreadCount + 1,
        }));
      },

      markAllRead: () => {
        syncRead(null);
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      markRead: (id) => {
        syncRead(id);
        set((s) => {
          const notifications = s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
        });
      },

      startListening: (myTicketIds) => {
        if (!isSupabaseConfiguredForClient() || myTicketIds.length === 0) return () => {};

        const sb = getSupabaseClient();
        const channels = myTicketIds.map((ticketId) =>
          sb
            .channel(`notif:${ticketId}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "support_messages",
                filter: `ticket_id=eq.${ticketId}`,
              },
              (payload) => {
                const row = payload.new as any;
                // Only notify for admin replies (not user's own messages)
                if (row.sender !== "admin") return;
                get().addNotification({
                  id: row.id,
                  type: "support_reply",
                  title: "Support replied",
                  body: row.body.slice(0, 80) + (row.body.length > 80 ? "..." : ""),
                  url: "/support",
                  createdAt: row.created_at,
                });
              }
            )
            .subscribe()
        );

        return () => {
          channels.forEach((ch) => sb.removeChannel(ch));
        };
      },

      // Durable feed: deal lifecycle, offers, messages and disputes all land in
      // the `notifications` table (written by DB triggers, server-side). We load
      // recent unread on connect and subscribe to new rows for this wallet.
      startNotificationFeed: (address) => {
        if (!isSupabaseConfiguredForClient() || !address) return () => {};

        const sb = getSupabaseClient();
        const norm = address.toLowerCase().replace(/\s+/g, "");

        const ingest = (row: any) =>
          get().addNotification({
            id: row.id,
            type: mapKind(row.kind),
            title: row.title,
            body: row.body ?? "",
            url: row.url ?? "",
            createdAt: row.created_at,
          });

        // Recent unread, oldest first so the newest ends up on top after prepend.
        Promise.resolve(
          sb
            .from("notifications")
            .select("id, kind, title, body, url, created_at")
            .is("read_at", null)
            .order("created_at", { ascending: false })
            .limit(30)
        ).then(({ data }: any) => {
          (data ?? []).slice().reverse().forEach(ingest);
        }, () => {});

        const ch = sb
          .channel(`notif-feed:${norm}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_addr=eq.${norm}` },
            (payload) => ingest(payload.new)
          )
          .subscribe();

        return () => {
          sb.removeChannel(ch);
        };
      },
    }),
    {
      name: "proofhold.notifications.v1",
      partialize: (s) => ({ notifications: s.notifications, unreadCount: s.unreadCount }),
    }
  )
);
