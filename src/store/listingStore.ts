import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import type { Currency, DealCategory } from "@/types/deal";
import { clampNumber, INPUT_LIMITS, limitText, VALUE_LIMITS } from "@/lib/inputLimits";

export interface Listing {
  id: string;
  /** Owner identity — the wallet address the seller was signed in with when
      they created the listing. Constant across listings so a seller who
      lists in both currencies still has one profile. */
  sellerAddr: string;
  /** Currency-matched wallet where release payouts are sent. Equals
      sellerAddr when the seller listed in the same currency they signed in
      with; otherwise the wallet fetched from the currency-specific
      provider at listing time. */
  payoutAddr: string;
  title: string;
  description: string;
  priceAmount: string;
  priceCurrency: Currency;
  category: DealCategory;
  deliveryHours: number;
  confirmationHours: number;
  requiredDeliveryProof: string;
  refundTerms: string;
  tags: string[];
  status: "active" | "paused" | "sold_out" | "deleted";
  quantityTotal: number;
  quantityAvailable: number;
  ordersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateListingInput {
  sellerAddr: string;
  payoutAddr: string;
  title: string;
  description: string;
  priceAmount: string;
  priceCurrency: Currency;
  category: DealCategory;
  deliveryHours: number;
  confirmationHours: number;
  requiredDeliveryProof: string;
  refundTerms: string;
  tags: string[];
  quantityTotal: number;
}

function mapRow(row: any): Listing {
  return {
    id: row.id,
    sellerAddr: row.seller_addr,
    // Older rows written before migration 0024 don't have payout_addr set --
    // fall back to seller_addr so the payout target is always defined.
    payoutAddr: row.payout_addr ?? row.seller_addr,
    title: row.title,
    description: row.description ?? "",
    priceAmount: String(row.price_amount),
    priceCurrency: row.price_currency,
    category: row.category ?? "other",
    deliveryHours: row.delivery_hours,
    confirmationHours: row.confirmation_hours,
    requiredDeliveryProof: row.required_delivery_proof ?? "",
    refundTerms: row.refund_terms ?? "",
    tags: row.tags ?? [],
    status: row.status,
    quantityTotal: Number(row.quantity_total ?? 1),
    quantityAvailable: Number(row.quantity_available ?? 1),
    ordersCount: row.orders_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ListingState {
  listings: Listing[];
  myListings: Listing[];
  popular: Listing[];
  loading: boolean;
  popularLoading: boolean;

  fetchAll: (filters?: { category?: string; search?: string }) => Promise<void>;
  fetchPopular: () => Promise<void>;
  fetchMine: (sellerAddr: string) => Promise<void>;
  getListing: (id: string) => Listing | undefined;
  createListing: (input: CreateListingInput) => Promise<Listing>;
  toggleStatus: (id: string, status: "active" | "paused") => Promise<void>;
  deleteListing: (id: string) => Promise<void>;
  incrementOrders: (id: string) => Promise<void>;
  applyInventoryReservation: (id: string) => void;
}

export const useListingStore = create<ListingState>((set, get) => ({
  listings: [],
  myListings: [],
  popular: [],
  loading: false,
  popularLoading: false,

  getListing: (id) =>
    [...get().listings, ...get().popular, ...get().myListings].find((l) => l.id === id),

  fetchAll: async (filters) => {
    set({ loading: true });
    if (!isSupabaseConfiguredForClient()) {
      set({ loading: false });
      return;
    }
    try {
      const sb = getSupabaseClient();
      let q = sb
        .from("listings")
        .select("*")
        .eq("status", "active")
        .order("orders_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (filters?.category && filters.category !== "all") {
        q = q.eq("category", filters.category);
      }
      if (filters?.search) {
        q = q.ilike("title", `%${filters.search}%`);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      set({ listings: (data ?? []).map(mapRow), loading: false });
    } catch (error) {
      console.error("[XcrowHub] Failed to load listings:", error);
      set({ loading: false });
    }
  },

  // Home's "popular" rail keeps its own slice so the marketplace page's
  // filtered fetchAll() can never clobber it (they share no array).
  fetchPopular: async () => {
    if (!isSupabaseConfiguredForClient()) return;
    set({ popularLoading: true });
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from("listings")
        .select("*")
        .eq("status", "active")
        .order("orders_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      set({ popular: (data ?? []).map(mapRow), popularLoading: false });
    } catch (error) {
      console.error("[XcrowHub] Failed to load popular listings:", error);
      set({ popularLoading: false });
    }
  },

  fetchMine: async (sellerAddr) => {
    if (!isSupabaseConfiguredForClient()) return;
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .eq("seller_addr", sellerAddr)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    set({ myListings: (data ?? []).map(mapRow) });
  },

  createListing: async (input) => {
    const cleanInput: CreateListingInput = {
      ...input,
      title: limitText(input.title, INPUT_LIMITS.listingTitle),
      description: limitText(input.description, INPUT_LIMITS.description),
      priceAmount: String(clampNumber(Number(input.priceAmount), 0, VALUE_LIMITS.amount)),
      deliveryHours: clampNumber(Math.round(input.deliveryHours), 1, VALUE_LIMITS.deadlineHours),
      confirmationHours: clampNumber(Math.round(input.confirmationHours), 1, VALUE_LIMITS.deadlineHours),
      requiredDeliveryProof: limitText(input.requiredDeliveryProof, INPUT_LIMITS.terms),
      refundTerms: limitText(input.refundTerms, INPUT_LIMITS.terms),
      tags: input.tags.slice(0, INPUT_LIMITS.maxTags).map((tag) => limitText(tag, INPUT_LIMITS.tag)).filter(Boolean),
      quantityTotal: clampNumber(Math.round(input.quantityTotal), 1, VALUE_LIMITS.quantity),
    };
    if (!isSupabaseConfiguredForClient()) {
      const local: Listing = {
        id: `LS-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
        ...cleanInput,
        payoutAddr: cleanInput.payoutAddr || cleanInput.sellerAddr,
        status: "active",
        quantityTotal: cleanInput.quantityTotal,
        quantityAvailable: cleanInput.quantityTotal,
        ordersCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      set((s) => ({ myListings: [local, ...s.myListings] }));
      return local;
    }

    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("listings")
      .insert({
        seller_addr: cleanInput.sellerAddr,
        payout_addr: cleanInput.payoutAddr,
        title: cleanInput.title,
        description: cleanInput.description,
        price_amount: Number(cleanInput.priceAmount),
        price_currency: cleanInput.priceCurrency,
        category: cleanInput.category,
        delivery_hours: cleanInput.deliveryHours,
        confirmation_hours: cleanInput.confirmationHours,
        required_delivery_proof: cleanInput.requiredDeliveryProof,
        refund_terms: cleanInput.refundTerms,
        tags: cleanInput.tags,
        quantity_total: cleanInput.quantityTotal,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const listing = mapRow(data);
    set((s) => ({ myListings: [listing, ...s.myListings] }));
    return listing;
  },

  toggleStatus: async (id, status) => {
    if (!isSupabaseConfiguredForClient()) {
      set((s) => ({
        myListings: s.myListings.map((l) =>
          l.id === id ? { ...l, status } : l
        ),
      }));
      return;
    }

    const sb = getSupabaseClient();
    const { error } = await sb
      .from("listings")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);

    set((s) => ({
      myListings: s.myListings.map((l) =>
        l.id === id ? { ...l, status } : l
      ),
    }));
  },

  deleteListing: async (id) => {
    if (!isSupabaseConfiguredForClient()) {
      set((s) => ({
        listings: s.listings.filter((l) => l.id !== id),
        popular: s.popular.filter((l) => l.id !== id),
        myListings: s.myListings.filter((l) => l.id !== id),
      }));
      return;
    }
    const sb = getSupabaseClient();
    // Definer RPC does its own owner/admin check and soft-deletes the row.
    // Chose this over the previous update+.select("id") because the SELECT
    // policy (status <> 'deleted') tripped over the RETURNING clause the
    // moment status flipped — Postgres reported it as a WITH CHECK error
    // even though the UPDATE itself was legal.
    const { error } = await sb.rpc("delete_listing", { p_id: id });
    if (error) throw new Error(error.message);
    // DB delete confirmed → drop from every local cache so the admin's
    // marketplace view reflects it immediately (not only 'myListings').
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      popular: s.popular.filter((l) => l.id !== id),
      myListings: s.myListings.filter((l) => l.id !== id),
    }));
  },

  incrementOrders: async (id) => {
    // Remote deal procedures increment orders_count transactionally when a
    // listed deal is released. Never call the old public increment RPC from
    // the browser: doing so double-counts completed orders and lets clients
    // mutate marketplace ranking directly.
    if (isSupabaseConfiguredForClient()) return;

    // Demo mode has no database trigger/procedure, so keep its local counter.
    const bump = (l: Listing) => (l.id === id ? { ...l, ordersCount: l.ordersCount + 1 } : l);
    set((s) => ({
      listings: s.listings.map(bump),
      popular: s.popular.map(bump),
      myListings: s.myListings.map(bump),
    }));
  },

  // The database is authoritative. Call this only after a stock-reserving RPC
  // succeeds so the current detail view immediately reflects the new balance.
  applyInventoryReservation: (id) => {
    const reserve = (l: Listing) =>
      l.id !== id
        ? l
        : (() => {
            const quantityAvailable = Math.max(0, l.quantityAvailable - 1);
            return {
              ...l,
              quantityAvailable,
              status: quantityAvailable === 0 ? "sold_out" as const : l.status,
            };
          })();
    set((s) => ({
      listings: s.listings.map(reserve),
      popular: s.popular.map(reserve),
      myListings: s.myListings.map(reserve),
    }));
  },
}));
