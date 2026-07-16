import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import { addHoursIso, nowIso } from "@/lib/time";
import type { Currency } from "@/types/deal";
import { limitText, VALUE_LIMITS } from "@/lib/inputLimits";

function validAmount(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > VALUE_LIMITS.amount) {
    throw new Error(`Amount must be between 0 and ${VALUE_LIMITS.amount.toLocaleString()}.`);
  }
  return String(amount);
}

export type OfferStatus =
  | "pending"
  | "countered"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "expired";

export interface Offer {
  id: string;
  listingId: string;
  buyerAddr: string;
  sellerAddr: string;
  currency: Currency;
  originalAmount: string;
  currentAmount: string;
  message: string;
  status: OfferStatus;
  dealId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface PlaceOfferInput {
  listingId: string;
  buyerAddr: string;
  sellerAddr: string;
  currency: Currency;
  amount: string;
  message?: string;
}

const OFFER_WINDOW_HOURS = 48;
const ACTIVE_STATUSES: OfferStatus[] = ["pending", "countered"];

/** An offer is active (awaiting someone's action) and not past its expiry. */
export function isActiveOffer(o: Offer): boolean {
  return ACTIVE_STATUSES.includes(o.status) && new Date(o.expiresAt).getTime() > Date.now();
}

/** True once a pending/countered offer has timed out (display + accept guard). */
export function isExpiredOffer(o: Offer): boolean {
  return ACTIVE_STATUSES.includes(o.status) && new Date(o.expiresAt).getTime() <= Date.now();
}

function mapRow(row: any): Offer {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerAddr: row.buyer_addr,
    sellerAddr: row.seller_addr,
    currency: row.currency,
    originalAmount: String(row.original_amount),
    currentAmount: String(row.current_amount),
    message: row.message ?? "",
    status: row.status,
    dealId: row.deal_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

interface OfferState {
  byListing: Record<string, Offer[]>;
  myOffers: Offer[];
  incoming: Offer[];
  loading: boolean;

  fetchForListing: (listingId: string) => Promise<void>;
  fetchAsBuyer: (addr: string) => Promise<void>;
  fetchAsSeller: (addr: string) => Promise<void>;
  placeOffer: (input: PlaceOfferInput) => Promise<Offer>;
  withdraw: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  counter: (id: string, newAmount: string) => Promise<void>;
  markAccepted: (id: string, dealId: string) => Promise<void>;
  subscribeForListing: (listingId: string, onChange: () => void) => () => void;
}

/** Merge an updated/new offer into every cached collection it belongs to. */
function upsert(lists: Offer[], offer: Offer): Offer[] {
  const idx = lists.findIndex((o) => o.id === offer.id);
  if (idx === -1) return [offer, ...lists];
  const next = lists.slice();
  next[idx] = offer;
  return next;
}

export const useOfferStore = create<OfferState>((set) => {
  /** Apply a local mutation to one offer across all cached collections. */
  function patchLocal(id: string, patch: Partial<Offer>): Offer | undefined {
    let updated: Offer | undefined;
    set((s) => {
      const apply = (o: Offer) => {
        if (o.id !== id) return o;
        updated = { ...o, ...patch, updatedAt: nowIso() };
        return updated;
      };
      const byListing: Record<string, Offer[]> = {};
      for (const [k, v] of Object.entries(s.byListing)) byListing[k] = v.map(apply);
      return {
        byListing,
        myOffers: s.myOffers.map(apply),
        incoming: s.incoming.map(apply),
      };
    });
    return updated;
  }

  /** Persist a status/amount change to Supabase (no-op in local demo mode). */
  async function persist(id: string, patch: Record<string, unknown>) {
    if (!isSupabaseConfiguredForClient()) return;
    const sb = getSupabaseClient();
    const { error } = await sb
      .from("offers")
      .update({ ...patch, updated_at: nowIso() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  return {
    byListing: {},
    myOffers: [],
    incoming: [],
    loading: false,

    fetchForListing: async (listingId) => {
      if (!isSupabaseConfiguredForClient()) return;
      set({ loading: true });
      try {
        const sb = getSupabaseClient();
        const { data } = await sb
          .from("offers")
          .select("*")
          .eq("listing_id", listingId)
          .order("created_at", { ascending: false });
        set((s) => ({
          byListing: { ...s.byListing, [listingId]: (data ?? []).map(mapRow) },
          loading: false,
        }));
      } catch {
        set({ loading: false });
      }
    },

    fetchAsBuyer: async (addr) => {
      if (!isSupabaseConfiguredForClient()) return;
      const sb = getSupabaseClient();
      const { data } = await sb
        .from("offers")
        .select("*")
        .eq("buyer_addr", addr)
        .order("created_at", { ascending: false });
      set({ myOffers: (data ?? []).map(mapRow) });
    },

    fetchAsSeller: async (addr) => {
      if (!isSupabaseConfiguredForClient()) return;
      const sb = getSupabaseClient();
      const { data } = await sb
        .from("offers")
        .select("*")
        .eq("seller_addr", addr)
        .order("created_at", { ascending: false });
      set({ incoming: (data ?? []).map(mapRow) });
    },

    placeOffer: async (input) => {
      const now = nowIso();
      const amount = validAmount(input.amount);
      const base: Offer = {
        id: crypto.randomUUID(),
        listingId: input.listingId,
        buyerAddr: input.buyerAddr,
        sellerAddr: input.sellerAddr,
        currency: input.currency,
        originalAmount: amount,
        currentAmount: amount,
        message: limitText(input.message, 500),
        status: "pending",
        createdAt: now,
        updatedAt: now,
        expiresAt: addHoursIso(now, OFFER_WINDOW_HOURS),
      };

      if (!isSupabaseConfiguredForClient()) {
        set((s) => ({
          byListing: {
            ...s.byListing,
            [input.listingId]: upsert(s.byListing[input.listingId] ?? [], base),
          },
          myOffers: upsert(s.myOffers, base),
        }));
        return base;
      }

      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from("offers")
        .insert({
          listing_id: input.listingId,
          buyer_addr: input.buyerAddr,
          seller_addr: input.sellerAddr,
          currency: input.currency,
          original_amount: Number(amount),
          current_amount: Number(amount),
          message: base.message,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      const offer = mapRow(data);
      set((s) => ({
        byListing: {
          ...s.byListing,
          [offer.listingId]: upsert(s.byListing[offer.listingId] ?? [], offer),
        },
        myOffers: upsert(s.myOffers, offer),
      }));
      return offer;
    },

    withdraw: async (id) => {
      patchLocal(id, { status: "withdrawn" });
      await persist(id, { status: "withdrawn" });
    },

    decline: async (id) => {
      patchLocal(id, { status: "declined" });
      await persist(id, { status: "declined" });
    },

    counter: async (id, newAmount) => {
      const amount = validAmount(newAmount);
      patchLocal(id, { status: "countered", currentAmount: amount });
      await persist(id, { status: "countered", current_amount: Number(amount) });
    },

    markAccepted: async (id, dealId) => {
      patchLocal(id, { status: "accepted", dealId });
      await persist(id, { status: "accepted", deal_id: dealId });
    },

    subscribeForListing: (listingId, onChange) => {
      if (!isSupabaseConfiguredForClient()) return () => {};
      const sb = getSupabaseClient();
      const channel = sb
        .channel(`offers:${listingId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "offers", filter: `listing_id=eq.${listingId}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as any;
            if (!row?.id) return;
            const offer = mapRow(row);
            set((s) => ({
              byListing: {
                ...s.byListing,
                [listingId]: upsert(s.byListing[listingId] ?? [], offer),
              },
              myOffers: s.myOffers.some((o) => o.id === offer.id)
                ? upsert(s.myOffers, offer)
                : s.myOffers,
              incoming: s.incoming.some((o) => o.id === offer.id)
                ? upsert(s.incoming, offer)
                : s.incoming,
            }));
            onChange();
          }
        )
        .subscribe();
      return () => { sb.removeChannel(channel); };
    },
  };
});
