import {
  Package,
  Palette,
  FileText,
  Code2,
  MessageSquare,
  Gamepad2,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DealCategory } from "@/types/deal";

/* One source of truth for the icon component per deal category. Replaces the
   per-page CAT_ICON_MAP that used to sit above CATEGORY_ICON (string) in
   CreateDeal, Listings, and YourDeals. */
export const CATEGORY_ICON: Record<DealCategory, LucideIcon> = {
  digital_goods: Package,
  design: Palette,
  content: FileText,
  software: Code2,
  consulting: MessageSquare,
  gaming: Gamepad2,
  other: Tag,
};
