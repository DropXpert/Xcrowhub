import { cn } from "@/lib/cn";

export type TrustLevel = "none" | "bronze" | "silver" | "gold";

export function getTrustLevel(count: number, avg: number): TrustLevel {
  if (count >= 25 && avg >= 4.5) return "gold";
  if (count >= 10 && avg >= 4.0) return "silver";
  if (count >= 3  && avg >= 3.5) return "bronze";
  return "none";
}

const levelConfig: Record<TrustLevel, { label: string; emoji: string; className: string }> = {
  none:   { label: "New",    emoji: "🆕", className: "border-edge bg-bg text-muted" },
  bronze: { label: "Bronze", emoji: "🥉", className: "border-warning/40 bg-warning/10 text-warning" },
  silver: { label: "Silver", emoji: "🥈", className: "border-edge bg-surface text-ink" },
  gold:   { label: "Gold",   emoji: "🥇", className: "border-accent/40 bg-accent-soft text-accent-ink" },
};

interface TrustBadgeProps {
  count: number;
  avg: number;
  showCount?: boolean;
  className?: string;
}

export function TrustBadge({ count, avg, showCount = true, className }: TrustBadgeProps) {
  const level = getTrustLevel(count, avg);
  const cfg = levelConfig[level];

  if (count === 0) {
    return (
      <span className={cn("pill border-edge bg-bg text-muted", className)}>
        🆕 New seller
      </span>
    );
  }

  return (
    <span className={cn("pill", cfg.className, className)}>
      {cfg.emoji} {cfg.label}
      {showCount && (
        <span className="ml-0.5 opacity-70">
          · ★{avg.toFixed(1)} ({count})
        </span>
      )}
    </span>
  );
}
