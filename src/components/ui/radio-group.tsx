import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/cn";

/* ── animated radio primitive (radix + motion) ─────────────────────────────
   Ported from animate-ui/radix/radio-group. The indicator dot inside each
   item is a motion.div that scales + fades in when the item is checked, and
   fades out when the selection moves elsewhere. Consumers wrap each item in
   a <label> to build tile-style selectors (see CreateDeal). */

type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root>;

function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

type RadioGroupIndicatorTransition = React.ComponentProps<
  typeof motion.div
>["transition"];

type RadioGroupItemProps = Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  "asChild"
> & {
  indicatorClassName?: string;
  transition?: RadioGroupIndicatorTransition;
  motionProps?: HTMLMotionProps<"div">;
};

function RadioGroupItem({
  className,
  indicatorClassName,
  transition = { type: "spring", stiffness: 400, damping: 26 },
  motionProps,
  ...props
}: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square h-4 w-4 shrink-0 rounded-full border border-edge bg-surface transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator asChild forceMount>
        <div className="flex h-full w-full items-center justify-center">
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key="radio-dot"
              className={cn(
                "block h-1.5 w-1.5 rounded-full bg-white",
                indicatorClassName
              )}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={transition}
              {...motionProps}
            />
          </AnimatePresence>
        </div>
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupProps,
  type RadioGroupItemProps,
};
