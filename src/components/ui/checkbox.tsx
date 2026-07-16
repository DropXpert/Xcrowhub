"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { motion, type SVGMotionProps, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/cn";
import { getStrictContext } from "@/lib/get-strict-context";
import { useControlledState } from "@/lib/use-controlled-state";

/* Ported from animate-ui/radix/checkbox — an animated SVG check-draw, themed to
   the app's accent. The check uses the page bg colour so it stays readable on
   the accent fill in both light (dark-jade fill) and dark (bright-mint fill). */

type CheckboxContextType = {
  isChecked: boolean | "indeterminate";
  setIsChecked: (checked: boolean | "indeterminate") => void;
};

const [CheckboxProvider, useCheckbox] =
  getStrictContext<CheckboxContextType>("CheckboxContext");

type CheckboxProps = HTMLMotionProps<"button"> &
  Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "asChild">;

function Checkbox({
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
  required,
  name,
  value,
  className,
  children,
  ...props
}: CheckboxProps) {
  const [isChecked, setIsChecked] = useControlledState<boolean | "indeterminate">({
    value: checked,
    defaultValue: defaultChecked,
    onChange: onCheckedChange,
  });

  return (
    <CheckboxProvider value={{ isChecked: isChecked ?? false, setIsChecked }}>
      <CheckboxPrimitive.Root
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={setIsChecked}
        disabled={disabled}
        required={required}
        name={name}
        value={value}
        asChild
      >
        <motion.button
          data-slot="checkbox"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          className={cn(
            "peer flex size-5 shrink-0 items-center justify-center rounded-[6px] border border-edge bg-surface text-bg outline-none transition-colors",
            "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
            "data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
            "focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        >
          {children}
          <CheckboxIndicator />
        </motion.button>
      </CheckboxPrimitive.Root>
    </CheckboxProvider>
  );
}

type CheckboxIndicatorProps = SVGMotionProps<SVGSVGElement>;

function CheckboxIndicator({ className, ...props }: CheckboxIndicatorProps) {
  const { isChecked } = useCheckbox();

  return (
    <CheckboxPrimitive.Indicator forceMount asChild>
      <motion.svg
        data-slot="checkbox-indicator"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="3.5"
        stroke="currentColor"
        className={cn("size-3.5", className)}
        initial="unchecked"
        animate={isChecked ? "checked" : "unchecked"}
        {...props}
      >
        {isChecked === "indeterminate" ? (
          <motion.line
            x1="5"
            y1="12"
            x2="19"
            y2="12"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: 1,
              opacity: 1,
              transition: { duration: 0.2 },
            }}
          />
        ) : (
          <motion.path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
            variants={{
              checked: {
                pathLength: 1,
                opacity: 1,
                transition: { duration: 0.2, delay: 0.15 },
              },
              unchecked: {
                pathLength: 0,
                opacity: 0,
                transition: { duration: 0.2 },
              },
            }}
          />
        )}
      </motion.svg>
    </CheckboxPrimitive.Indicator>
  );
}

export {
  Checkbox,
  CheckboxIndicator,
  useCheckbox,
  type CheckboxProps,
  type CheckboxIndicatorProps,
};
