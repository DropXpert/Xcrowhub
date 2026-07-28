import { PageHeader } from "@/components/PageHeader";
import { SkeletonBlock } from "@/components/LoadingStates";
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
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[14px] font-semibold text-ink">{detail}</p>
            <SkeletonBlock className="h-2 w-2/3 max-w-40 rounded-full" />
          </div>
        </div>

        <div className="space-y-2.5 border-t border-edge pt-4">
          <SkeletonBlock className="h-3 w-3/4 rounded-full" />
          <SkeletonBlock className="h-3 w-1/2 rounded-full" />
          <SkeletonBlock className="h-3 w-2/3 rounded-full" />
        </div>
      </section>

      <section className="card space-y-3 px-5 py-5">
        <SkeletonBlock className="h-3 w-24 rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-12 rounded-lg" />
          <SkeletonBlock className="h-12 rounded-lg" />
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
