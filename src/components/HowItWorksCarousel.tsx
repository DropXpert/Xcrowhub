import {
  FilePlus2,
  Share2,
  ShieldCheck,
  PackageCheck,
  CheckCircle2,
  Scale,
} from "lucide-react";
import { Carousel, type CarouselItem } from "@/components/ui/carousel";

/*
 * Shared 6-step "How escrow works" carousel. Rendered on the /how-it-works
 * page as the main hero, and also embedded on Your deals so first-time users
 * see the flow without leaving the deals view.
 *
 * Auto-slide runs at a leisurely 30s per step — long enough for a user to
 * actually read the copy on each slide before it advances.
 */

export const HOW_IT_WORKS_STEPS: CarouselItem[] = [
  {
    id: 1,
    title: "Seller creates a deal",
    description:
      "Set the price, currency, delivery deadline, what counts as delivery, and refund terms. You get a shareable payment link.",
    icon: <FilePlus2 className="h-5 w-5" />,
  },
  {
    id: 2,
    title: "Share the link",
    description:
      "Send the link or QR to your buyer over WhatsApp, Telegram, or anywhere. They open it to review the deal and pay.",
    icon: <Share2 className="h-5 w-5" />,
  },
  {
    id: 3,
    title: "Buyer pays into escrow",
    description:
      "Funds lock on-chain in XcrowHub custody — not with the seller. The seller can see the payment is secured before starting.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    id: 4,
    title: "Seller delivers",
    description:
      "The seller does the work and marks it delivered with a note or links, so the buyer knows exactly what to check.",
    icon: <PackageCheck className="h-5 w-5" />,
  },
  {
    id: 5,
    title: "Buyer confirms",
    description:
      "Happy with what they got, the buyer confirms receipt and the funds release to the seller instantly.",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  {
    id: 6,
    title: "Disputes, settled fairly",
    description:
      "If something's wrong, either side raises a query. Both submit proof and an admin releases, refunds, or splits the funds.",
    icon: <Scale className="h-5 w-5" />,
  },
];

export const HOW_IT_WORKS_AUTOPLAY_MS = 30_000;

export function HowItWorksCarousel({
  autoplayDelay = HOW_IT_WORKS_AUTOPLAY_MS,
}: {
  autoplayDelay?: number;
}) {
  return (
    <Carousel
      items={HOW_IT_WORKS_STEPS}
      loop
      autoplay
      autoplayDelay={autoplayDelay}
    />
  );
}
