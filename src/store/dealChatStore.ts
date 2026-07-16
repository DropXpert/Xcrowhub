import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import { INPUT_LIMITS, limitText } from "@/lib/inputLimits";

export interface DealMessage {
  id: string;
  dealId: string;
  senderAddr: string;
  senderRole: "buyer" | "seller" | "system";
  body: string;
  createdAt: string;
}

interface ChatThread {
  messages: DealMessage[];
  loading: boolean;
}

interface DealChatState {
  chats: Record<string, ChatThread>;
  loadChat: (dealId: string) => Promise<void>;
  sendMessage: (dealId: string, senderAddr: string, senderRole: "buyer" | "seller", body: string) => Promise<void>;
  subscribeChat: (dealId: string, onNew: (msg: DealMessage) => void) => () => void;
}

function mapRow(row: any): DealMessage {
  return {
    id: row.id,
    dealId: row.deal_id,
    senderAddr: row.sender_addr,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

export const useDealChatStore = create<DealChatState>((set) => ({
  chats: {},

  loadChat: async (dealId) => {
    set((s) => ({
      chats: { ...s.chats, [dealId]: { messages: s.chats[dealId]?.messages ?? [], loading: true } },
    }));

    if (!isSupabaseConfiguredForClient()) {
      set((s) => ({ chats: { ...s.chats, [dealId]: { messages: [], loading: false } } }));
      return;
    }

    try {
      const sb = getSupabaseClient();
      const { data } = await sb
        .from("deal_messages")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });

      set((s) => ({
        chats: { ...s.chats, [dealId]: { messages: (data ?? []).map(mapRow), loading: false } },
      }));
    } catch {
      set((s) => ({ chats: { ...s.chats, [dealId]: { messages: [], loading: false } } }));
    }
  },

  sendMessage: async (dealId, senderAddr, senderRole, body) => {
    const cleanBody = limitText(body, INPUT_LIMITS.message);
    if (!cleanBody) return;
    if (!isSupabaseConfiguredForClient()) {
      const local: DealMessage = {
        id: crypto.randomUUID(),
        dealId,
        senderAddr,
        senderRole,
        body: cleanBody,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        chats: {
          ...s.chats,
          [dealId]: {
            messages: [...(s.chats[dealId]?.messages ?? []), local],
            loading: false,
          },
        },
      }));
      return;
    }

    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("deal_messages")
      .insert({ deal_id: dealId, sender_addr: senderAddr, sender_role: senderRole, body: cleanBody })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const msg = mapRow(data);
    set((s) => ({
      chats: {
        ...s.chats,
        [dealId]: {
          messages: [...(s.chats[dealId]?.messages ?? []), msg],
          loading: false,
        },
      },
    }));
  },

  subscribeChat: (dealId, onNew) => {
    if (!isSupabaseConfiguredForClient()) return () => {};

    const sb = getSupabaseClient();
    const channel = sb
      .channel(`deal-chat:${dealId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deal_messages", filter: `deal_id=eq.${dealId}` },
        (payload) => {
          const msg = mapRow(payload.new);
          set((s) => {
            const existing = s.chats[dealId]?.messages ?? [];
            if (existing.some((m) => m.id === msg.id)) return s;
            return {
              chats: {
                ...s.chats,
                [dealId]: { messages: [...existing, msg], loading: false },
              },
            };
          });
          onNew(msg);
        }
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  },
}));
