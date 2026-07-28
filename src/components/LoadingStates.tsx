import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function SkeletonBlock({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  );
}

export function SkeletonDots({
  label = "Processing",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1", className)}
      role="status"
      aria-label={label}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className="skeleton-dot h-1.5 w-1.5 rounded-full bg-current"
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function ChatSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("space-y-3 py-2", className)}
      aria-busy="true"
      aria-label="Loading messages"
    >
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-14 w-[78%] rounded-xl" />
      </div>
      <div className="ml-auto flex w-[70%] flex-col items-end gap-2">
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="h-11 w-full rounded-xl" />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-16 w-[84%] rounded-xl" />
      </div>
    </div>
  );
}

export function ListSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-3", className)}
      aria-busy="true"
      aria-label="Loading list"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="card flex items-center gap-3 px-4 py-4">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-2/3" />
            <SkeletonBlock className="h-3 w-5/6" />
          </div>
          <SkeletonBlock className="h-7 w-14 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ListingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("card space-y-3 px-3 py-3", className)}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-2">
        <SkeletonBlock className="h-8 w-8 rounded-lg" />
        <SkeletonBlock className="h-5 w-12 rounded-full" />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="h-3.5 w-5/6" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
      <SkeletonBlock className="h-4 w-1/2" />
    </div>
  );
}

export function LandingLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn("three-body", className)}
      role="status"
      aria-label="Loading XcrowHub"
    >
      <div className="three-body__dot" />
      <div className="three-body__dot" />
      <div className="three-body__dot" />
      <span className="sr-only">Loading XcrowHub</span>
    </div>
  );
}
