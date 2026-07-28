"use client";

import * as React from "react";
import { Progress as ProgressPrimitives } from "@base-ui-components/react/progress";
import { motion } from "motion/react";

import { cn } from "@/lib/cn";
import { getStrictContext } from "@/lib/get-strict-context";

/* Ported from animate-ui/base/progress — a spring-eased fill, themed to the
   app's accent. CountingNumber is intentionally omitted; ProgressValue renders
   Base UI's default formatted value. */

type ProgressContextType = { value: number };

const [ProgressProvider, useProgress] =
  getStrictContext<ProgressContextType>("ProgressContext");

type ProgressProps = React.ComponentProps<typeof ProgressPrimitives.Root>;

function Progress(props: ProgressProps) {
  return (
    <ProgressProvider value={{ value: props.value ?? 0 }}>
      <ProgressPrimitives.Root data-slot="progress" {...props} />
    </ProgressProvider>
  );
}

const MotionProgressIndicator = motion.create(ProgressPrimitives.Indicator);

type ProgressIndicatorProps = React.ComponentProps<
  typeof MotionProgressIndicator
>;

function ProgressIndicator({
  className,
  transition = { type: "spring", stiffness: 100, damping: 30 },
  ...props
}: ProgressIndicatorProps) {
  const { value } = useProgress();

  return (
    <MotionProgressIndicator
      data-slot="progress-indicator"
      className={cn("h-full flex-1 rounded-full bg-accent", className)}
      animate={{ width: `${value}%` }}
      transition={transition}
      {...props}
    />
  );
}

type ProgressTrackProps = React.ComponentProps<
  typeof ProgressPrimitives.Track
> & {
  indicatorClassName?: string;
};

function ProgressTrack({
  className,
  indicatorClassName,
  ...props
}: ProgressTrackProps) {
  return (
    <ProgressPrimitives.Track
      data-slot="progress-track"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-accent/15",
        className
      )}
      {...props}
    >
      <ProgressIndicator className={indicatorClassName} />
    </ProgressPrimitives.Track>
  );
}

type ProgressLabelProps = React.ComponentProps<typeof ProgressPrimitives.Label>;

function ProgressLabel({ className, ...props }: ProgressLabelProps) {
  return (
    <ProgressPrimitives.Label
      data-slot="progress-label"
      className={cn("text-[13px] font-medium text-ink", className)}
      {...props}
    />
  );
}

type ProgressValueProps = React.ComponentProps<typeof ProgressPrimitives.Value>;

function ProgressValue({ className, ...props }: ProgressValueProps) {
  return (
    <ProgressPrimitives.Value
      data-slot="progress-value"
      className={cn("text-[13px] tabular-nums text-muted", className)}
      {...props}
    />
  );
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
  useProgress,
  type ProgressProps,
  type ProgressTrackProps,
  type ProgressIndicatorProps,
  type ProgressLabelProps,
  type ProgressValueProps,
};
