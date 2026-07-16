import type { TourSection } from "@/store/tourStore";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

export const SECTION_TITLES: Record<TourSection, string> = {
  home: "Home",
  deals: "Deals",
  "create-deal": "Create a deal",
  marketplace: "Marketplace",
  "create-listing": "Create a listing",
  support: "Support",
  profile: "Profile",
};

export const SECTION_TOURS: Record<TourSection, TourStep[]> = {
  home: [
    {
      id: "home-intro",
      title: "Your XcrowHub dashboard",
      body: "This is your starting point for protected payments, active deals, marketplace services, and anything that needs your attention.",
      placement: "center",
    },
    {
      id: "home-hero",
      title: "Create or pay safely",
      body: "Create a private payment link or scan a deal. Funds stay in escrow until the buyer confirms delivery.",
      placement: "bottom",
    },
    {
      id: "home-sell",
      title: "Sell in the marketplace",
      body: "Publish a reusable service listing, choose its quantity, and receive buyer payments through escrow.",
      placement: "bottom",
    },
    {
      id: "home-market-search",
      title: "Find a service",
      body: "Search the marketplace directly from Home. You can buy at the listed price or make an offer when the seller allows it.",
      placement: "top",
    },
  ],
  deals: [
    {
      id: "deals-intro",
      title: "All your deal activity",
      body: "Private deals, marketplace purchases, offers, deadlines, and actions that need you are collected here.",
      placement: "center",
    },
    {
      id: "deals-actions",
      title: "Create or find a deal",
      body: "New deal creates a protected payment link. Find opens an existing deal using its ID or QR code.",
      placement: "bottom",
    },
    {
      id: "deals-library",
      title: "Track every status",
      body: "Search and filter your history. Open a deal card to pay, deliver, confirm, raise a query, or view its current state.",
      placement: "top",
    },
    {
      id: "deals-guide",
      title: "Learn the escrow flow",
      body: "This guide explains when funds lock, what each party must do, and when a refund or release can happen.",
      placement: "top",
    },
  ],
  "create-deal": [
    {
      id: "create-deal-intro",
      title: "Create a private deal",
      body: "Describe the work and price, define proof and deadlines, then share the generated payment link with the buyer.",
      placement: "center",
    },
    {
      id: "deal-basics",
      title: "Deal basics",
      body: "Use a clear title and description, enter the agreed price, then select the payment currency and category.",
      placement: "bottom",
    },
    {
      id: "deal-terms",
      title: "Proof and protection",
      body: "State exactly what counts as delivery, when refunds apply, and how long the seller and buyer have to act.",
      placement: "top",
    },
    {
      id: "deal-wallet",
      title: "Choose the payout wallet",
      body: "The seller receives released funds at this wallet. Connect the wallet matching the selected currency when required.",
      placement: "top",
    },
    {
      id: "deal-submit",
      title: "Review before creating",
      body: "Accept the terms and create the payment link. You will see a final confirmation summary before anything is created.",
      placement: "top",
    },
  ],
  marketplace: [
    {
      id: "market-intro",
      title: "Buy and sell services",
      body: "Marketplace listings can hold multiple units. Buying or an accepted offer creates a protected escrow deal for one unit.",
      placement: "center",
    },
    {
      id: "market-header",
      title: "Publish your service",
      body: "Tap Sell to add a service, price, delivery terms, and available quantity.",
      placement: "bottom",
    },
    {
      id: "market-search",
      title: "Search listings",
      body: "Search by service, skill, or keyword to quickly find the right seller.",
      placement: "bottom",
    },
    {
      id: "market-categories",
      title: "Filter by category",
      body: "Use these category chips to narrow the marketplace without losing your search.",
      placement: "bottom",
    },
    {
      id: "market-results",
      title: "Buy or make an offer",
      body: "A listing shows price, delivery time, and remaining stock. Open it to buy now or bid; your accepted offer appears in Deals for payment.",
      placement: "top",
    },
  ],
  "create-listing": [
    {
      id: "listing-intro",
      title: "Create a reusable listing",
      body: "A listing stays live while quantity remains. When the last unit becomes a deal, the listing is automatically unavailable.",
      placement: "center",
    },
    {
      id: "listing-tabs",
      title: "Complete both sections",
      body: "Listing details covers what you sell; Delivery & terms defines proof, refunds, and the buyer confirmation window.",
      placement: "bottom",
    },
    {
      id: "listing-details",
      title: "Describe and price the service",
      body: "Add a specific title, useful description, price, currency, category, and tags buyers may search for.",
      placement: "bottom",
    },
    {
      id: "listing-stock",
      title: "Set available quantity",
      body: "Use 1 for a one-off product. Use a larger quantity for repeat sales; each completed purchase reserves one unit.",
      placement: "top",
    },
    {
      id: "listing-submit",
      title: "Publish after reviewing terms",
      body: "Open the Delivery & terms tab, complete the required protection fields, accept the terms, and publish the listing.",
      placement: "top",
    },
  ],
  support: [
    {
      id: "support-intro",
      title: "Support and deal help",
      body: "Use Support for deal-specific questions. Include the deal ID and full context so the team can review the correct escrow.",
      placement: "center",
    },
    {
      id: "support-new-ticket",
      title: "Open a support ticket",
      body: "Enter the deal ID, a short subject, and a detailed first message. The ticket becomes a private chat with support.",
      placement: "bottom",
    },
    {
      id: "support-history",
      title: "Continue existing conversations",
      body: "Open tickets and resolved tickets stay here. Reopen a resolved ticket if the same issue returns.",
      placement: "top",
    },
    {
      id: "support-safety",
      title: "For disputes, keep evidence",
      body: "Do not share seed phrases or private keys. For a deal dispute, use its Raise query action and attach delivery or payment evidence there.",
      placement: "center",
    },
  ],
  profile: [
    {
      id: "profile-intro",
      title: "Your public trader identity",
      body: "Your profile combines wallet identity, reputation, marketplace listings, notification settings, and referral rewards.",
      placement: "center",
    },
    {
      id: "profile-identity",
      title: "Identity and reputation",
      body: "Set your username carefully, copy your wallet address, update your avatar, and review completed deals, ratings, and disputes.",
      placement: "bottom",
    },
    {
      id: "profile-referral",
      title: "Refer and earn",
      body: "Share your referral link and earn the displayed portion of marketplace fees from eligible referred sales.",
      placement: "top",
    },
    {
      id: "profile-notifications",
      title: "Connect notifications",
      body: "Link Telegram to receive deal and support updates even when the mini app is closed.",
      placement: "top",
    },
    {
      id: "profile-activity",
      title: "Review your activity",
      body: "Switch between selling, buying, and listings to see your complete account history.",
      placement: "top",
    },
  ],
};

export function sectionForPath(pathname: string, address: string): TourSection | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (path === "/") return "home";
  if (path === "/create") return "deals";
  if (path === "/create/new") return "create-deal";
  if (path === "/listings") return "marketplace";
  if (path === "/listings/new") return "create-listing";
  if (path === "/support") return "support";
  if (path === "/profile") return "profile";

  if (path.startsWith("/profile/")) {
    try {
      const routeAddress = decodeURIComponent(path.slice("/profile/".length));
      const clean = (value: string) => value.replace(/\s+/g, "").toLowerCase();
      return clean(routeAddress) === clean(address) ? "profile" : null;
    } catch {
      return null;
    }
  }

  return null;
}
