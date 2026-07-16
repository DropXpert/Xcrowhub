import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/cn";

export function PageLoader({
  eyebrow = "Loading",
  title = "Opening",
  detail = "Fetching the latest details.",
  className,
}: {
  eyebrow?: string;
  title?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)} aria-busy="true">
      <PageHeader eyebrow={eyebrow} title={title} />

      <section className="card space-y-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="text-[14px] font-semibold text-ink">{detail}</p>
            <div className="h-2 w-40 animate-pulse rounded-full bg-edge" />
          </div>
        </div>

        <div className="space-y-2.5 border-t border-edge pt-4">
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-edge" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-edge" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-edge" />
        </div>
      </section>

      <section className="card space-y-3 px-5 py-5">
        <div className="h-3 w-24 animate-pulse rounded-full bg-edge" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 animate-pulse rounded-lg bg-bg" />
          <div className="h-12 animate-pulse rounded-lg bg-bg" />
        </div>
      </section>
    </div>
  );
}

export function DealLoader({
  eyebrow = "Deal",
  title = "Opening deal",
}: {
  eyebrow?: string;
  title?: string;
}) {
  return (
    <PageLoader
      eyebrow={eyebrow}
      title={title}
      detail="Loading deal from XcrowHub."
    />
  );
}
