import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card flex flex-col items-center gap-3 px-6 py-10 text-center",
        className
      )}
    >
      {icon ? (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
