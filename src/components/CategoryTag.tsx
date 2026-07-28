import { Package, Palette, FileText, Code2, MessageSquare, Gamepad2, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DealCategory } from "@/types/deal";
import { CATEGORY_LABELS } from "@/types/deal";
import { cn } from "@/lib/cn";

const ICON_MAP: Record<DealCategory, LucideIcon> = {
  digital_goods: Package,
  design: Palette,
  content: FileText,
  software: Code2,
  consulting: MessageSquare,
  gaming: Gamepad2,
  other: Tag,
};

export function CategoryTag({ category, className }: { category: DealCategory; className?: string }) {
  const Icon = ICON_MAP[category];
  return (
    <span className={cn("pill border-edge bg-bg text-muted", className)}>
      <Icon className="h-3 w-3 shrink-0" />
      {CATEGORY_LABELS[category]}
    </span>
  );
}
