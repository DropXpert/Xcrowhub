import { create } from "zustand";
import { INPUT_LIMITS, limitText } from "@/lib/inputLimits";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";

// Tickets contain private support metadata. Older builds persisted them without
// a wallet namespace, which could expose the previous wallet's tickets after a
// wallet switch on a shared device. Remove that legacy cache and keep support
// state memory-only; the authenticated RLS query reloads it after sign-in.
try {
  localStorage.removeItem("proofhold.support.v1");
} catch {
  // Storage can be unavailable in restricted webviews.
}

export interface SupportTicket {
  id: string;
  dealId: string;
  subject: string;
  status: "open" | "resolved";
  openerAddr: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string | null;
  dealId: string;
  sender: "user" | "admin";
  senderAddr: string;
  body: string;
  createdAt: string;
}

interface SupportThread {
  dealId: string;
  messages: SupportMessage[];
  loading: boolean;
}

interface SupportState {
  // Ticket list (persisted so user sees their history)
  myTickets: SupportTicket[];
  // In-memory message cache keyed by ticketId
  threads: Record<string, SupportThread>;

  // Ticket actions
  createTicket: (dealId: string, subject: string, openerAddr: string) => Promise<SupportTicket>;
  loadMyTickets: (openerAddr: string) => Promise<void>;
  loadAllTickets: () => Promise<SupportTicket[]>;
  resolveTicket: (ticketId: string, resolvedBy: string) => Promise<void>;
  reopenTicket: (ticketId: string) => Promise<void>;

  // Message actions
  loadThread: (ticketId: string, dealId: string) => Promise<void>;
  sendMessage: (ticketId: string, dealId: string, body: string, sender: "user" | "admin", senderAddr?: string) => Promise<void>;
  subscribeThread: (ticketId: string, dealId: string, onMessage: (msg: SupportMessage) => void) => () => void;
}

function mapTicket(row: any): SupportTicket {
  return {
    id: row.id,
    dealId: row.deal_id,
    subject: row.subject ?? "",
    status: row.status,
    openerAddr: row.opener_addr ?? "",
    resolvedAt: row.resolved_at ?? null,
    resolvedBy: row.resolved_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: any): SupportMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id ?? null,
    dealId: row.deal_id,
    sender: row.sender,
    senderAddr: row.sender_addr ?? "",
    body: row.body,
    createdAt: row.created_at,
  };
}

let ticketsLoadGeneration = 0;

export const useSupportStore = create<SupportState>((set) => ({
      myTickets: [],
      threads: {},

      createTicket: async (dealId, subject, openerAddr) => {
        const cleanDealId = limitText(dealId, INPUT_LIMITS.dealId);
        const cleanSubject = limitText(subject, INPUT_LIMITS.supportSubject);
        if (!isSupabaseConfiguredForClient()) {
          const local: SupportTicket = {
            id: crypto.randomUUID(),
            dealId: cleanDealId,
            subject: cleanSubject,
            status: "open",
            openerAddr,
            resolvedAt: null,
            resolvedBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((s) => ({ myTickets: [local, ...s.myTickets] }));
          return local;
        }

        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from("support_tickets")
          .insert({ deal_id: cleanDealId, subject: cleanSubject, opener_addr: openerAddr, status: "open" })
          .select()
          .single();
        if (error) throw new Error(error.message);
        const ticket = mapTicket(data);
        set((s) => ({ myTickets: [ticket, ...s.myTickets] }));
        return ticket;
      },

      loadMyTickets: async (openerAddr) => {
        const requestGeneration = ++ticketsLoadGeneration;
        // Clear the prior wallet's private cache synchronously before the new
        // RLS-scoped request resolves.
        set({ myTickets: [], threads: {} });
        if (!isSupabaseConfiguredForClient()) return;
        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from("support_tickets")
          .select("*")
          .eq("opener_addr", openerAddr)
          .order("created_at", { ascending: false });
        if (requestGeneration !== ticketsLoadGeneration) return;
        if (error) throw new Error(error.message);
        if (data) set({ myTickets: data.map(mapTicket) });
      },

      loadAllTickets: async () => {
        if (!isSupabaseConfiguredForClient()) return [];
        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from("support_tickets")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []).map(mapTicket);
      },

      resolveTicket: async (ticketId, resolvedBy) => {
        const now = new Date().toISOString();
        if (isSupabaseConfiguredForClient()) {
          const sb = getSupabaseClient();
          const { error } = await sb.rpc("set_support_ticket_status", {
            p_ticket_id: ticketId,
            p_status: "resolved",
          });
          if (error) throw new Error(error.message);
        }
        set((s) => ({
          myTickets: s.myTickets.map((t) =>
            t.id === ticketId
              ? { ...t, status: "resolved", resolvedAt: now, resolvedBy, updatedAt: now }
              : t
          ),
        }));
      },

      reopenTicket: async (ticketId) => {
        const now = new Date().toISOString();
        if (isSupabaseConfiguredForClient()) {
          const sb = getSupabaseClient();
          const { error } = await sb.rpc("set_support_ticket_status", {
            p_ticket_id: ticketId,
            p_status: "open",
          });
          if (error) throw new Error(error.message);
        }
        set((s) => ({
          myTickets: s.myTickets.map((t) =>
            t.id === ticketId
              ? { ...t, status: "open", resolvedAt: null, resolvedBy: null, updatedAt: now }
              : t
          ),
        }));
      },

      loadThread: async (ticketId, dealId) => {
        set((s) => ({
          threads: {
            ...s.threads,
            [ticketId]: { dealId, messages: s.threads[ticketId]?.messages ?? [], loading: true },
          },
        }));

        if (!isSupabaseConfiguredForClient()) {
          set((s) => ({
            threads: { ...s.threads, [ticketId]: { ...s.threads[ticketId], loading: false } },
          }));
          return;
        }

        try {
          const sb = getSupabaseClient();
          const { data, error } = await sb
            .from("support_messages")
            .select("*")
            .eq("ticket_id", ticketId)
            .order("created_at", { ascending: true });
          if (error) throw new Error(error.message);

          set((s) => ({
            threads: {
              ...s.threads,
              [ticketId]: { dealId, messages: (data ?? []).map(mapMessage), loading: false },
            },
          }));
        } catch {
          set((s) => ({
            threads: { ...s.threads, [ticketId]: { ...s.threads[ticketId], loading: false } },
          }));
        }
      },

      sendMessage: async (ticketId, dealId, body, sender, senderAddr = "") => {
        const cleanBody = limitText(body, INPUT_LIMITS.message);
        if (!cleanBody) return;
        if (!isSupabaseConfiguredForClient()) {
          const local: SupportMessage = {
            id: crypto.randomUUID(),
            ticketId,
            dealId,
            sender,
            senderAddr,
            body: cleanBody,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            threads: {
              ...s.threads,
              [ticketId]: {
                dealId,
                messages: [...(s.threads[ticketId]?.messages ?? []), local],
                loading: false,
              },
            },
          }));
          return;
        }

        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from("support_messages")
          .insert({ ticket_id: ticketId, deal_id: dealId, sender, sender_addr: senderAddr, body: cleanBody })
          .select()
          .single();

        if (error) throw new Error(error.message);

        const msg = mapMessage(data);
        set((s) => ({
          threads: {
            ...s.threads,
            [ticketId]: {
              dealId,
              messages: [...(s.threads[ticketId]?.messages ?? []), msg],
              loading: false,
            },
          },
        }));
      },

      subscribeThread: (ticketId, dealId, onMessage) => {
        if (!isSupabaseConfiguredForClient()) return () => {};

        const sb = getSupabaseClient();
        const channel = sb
          .channel(`support-ticket:${ticketId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` },
            (payload) => {
              const msg = mapMessage(payload.new);
              set((s) => {
                const existing = s.threads[ticketId]?.messages ?? [];
                if (existing.some((m) => m.id === msg.id)) return s;
                return {
                  threads: {
                    ...s.threads,
                    [ticketId]: { dealId, messages: [...existing, msg], loading: false },
                  },
                };
              });
              onMessage(msg);
            }
          )
          .subscribe();

        return () => { sb.removeChannel(channel); };
      },
    }));
