import { Link } from "react-router-dom";
import {
  Package, Palette, FileText, Code2, MessageSquare, Gamepad2, Tag, Store, ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DealCategory } from "@/types/deal";
import { DEAL_CATEGORIES, CATEGORY_LABELS } from "@/types/deal";

const ICON_MAP: Record<DealCategory, LucideIcon> = {
  digital_goods: Package,
  design: Palette,
  content: FileText,
  software: Code2,
  consulting: MessageSquare,
  gaming: Gamepad2,
  other: Tag,
};

/**
 * 2-column icon-card grid over the 7 real categories plus an "All listings"
 * tile, so the grid stays even and every category is one tap from Home. Each
 * tile deep-links into the marketplace with the category pre-filtered.
 */
export function CategoryGrid() {
  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-ink">Browse by category</h2>
      <div className="grid grid-cols-2 gap-2">
        {DEAL_CATEGORIES.map((c) => {
          const Icon = ICON_MAP[c];
          return (
            <CategoryCard
              key={c}
              to={`/listings?category=${c}`}
              icon={<Icon className="h-4 w-4" />}
              label={CATEGORY_LABELS[c]}
            />
          );
        })}
        <CategoryCard
          to="/listings"
          icon={<Store className="h-4 w-4" />}
          label="All listings"
        />
      </div>
    </section>
  );
}

function CategoryCard({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded-card border border-edge bg-surface px-3.5 py-3 shadow-receipt transition hover:border-accent/30 hover:shadow-lift active:scale-[0.99]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
        {label}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-edge transition group-hover:text-muted" />
    </Link>
  );
}
