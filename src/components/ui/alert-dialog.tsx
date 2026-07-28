"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/cn";
import { getStrictContext } from "@/lib/get-strict-context";
import { useControlledState } from "@/lib/use-controlled-state";

/* ── animated primitive layer (radix + motion) ─────────────────────────────
   Ported from animate-ui/radix/alert-dialog, adapted to the individual radix
   packages and themed to the app tokens. Centering is done with a flex wrapper
   so motion's transform (flip + scale) doesn't clobber a translate. */

type AlertDialogContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const [AlertDialogProvider, useAlertDialog] =
  getStrictContext<AlertDialogContextType>("AlertDialogContext");

type AlertDialogProps = React.ComponentProps<typeof AlertDialogPrimitive.Root>;

function AlertDialog(props: AlertDialogProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <AlertDialogProvider value={{ isOpen: !!isOpen, setIsOpen }}>
      <AlertDialogPrimitive.Root
        data-slot="alert-dialog"
        {...props}
        onOpenChange={setIsOpen}
      />
    </AlertDialogProvider>
  );
}

type AlertDialogTriggerProps = React.ComponentProps<
  typeof AlertDialogPrimitive.Trigger
>;

function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

type AlertDialogPortalProps = Omit<
  React.ComponentProps<typeof AlertDialogPrimitive.Portal>,
  "forceMount"
>;

function AlertDialogPortal(props: AlertDialogPortalProps) {
  const { isOpen } = useAlertDialog();

  return (
    <AnimatePresence>
      {isOpen && (
        <AlertDialogPrimitive.Portal
          data-slot="alert-dialog-portal"
          forceMount
          {...props}
        />
      )}
    </AnimatePresence>
  );
}

type AlertDialogOverlayProps = Omit<
  React.ComponentProps<typeof AlertDialogPrimitive.Overlay>,
  "forceMount" | "asChild"
> &
  HTMLMotionProps<"div">;

function AlertDialogOverlay({
  className,
  transition = { duration: 0.2, ease: "easeInOut" },
  ...props
}: AlertDialogOverlayProps) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      asChild
      forceMount
    >
      <motion.div
        key="alert-dialog-overlay"
        className={cn("fixed inset-0 z-[100] bg-black/50", className)}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={transition}
        {...props}
      />
    </AlertDialogPrimitive.Overlay>
  );
}

type AlertDialogFlipDirection = "top" | "bottom" | "left" | "right";

type AlertDialogContentProps = Omit<
  React.ComponentProps<typeof AlertDialogPrimitive.Content>,
  "forceMount" | "asChild"
> &
  HTMLMotionProps<"div"> & {
    from?: AlertDialogFlipDirection;
  };

function AlertDialogContent({
  className,
  from = "top",
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  transition = { type: "spring", stiffness: 150, damping: 25 },
  ...props
}: AlertDialogContentProps) {
  const initialRotation =
    from === "bottom" || from === "left" ? "20deg" : "-20deg";
  const isVertical = from === "top" || from === "bottom";
  const rotateAxis = isVertical ? "rotateX" : "rotateY";

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <AlertDialogPrimitive.Content
          asChild
          forceMount
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          <motion.div
            key="alert-dialog-content"
            data-slot="alert-dialog-content"
            className={cn(
              "grid w-full max-w-sm gap-4 rounded-2xl border border-edge bg-surface p-5 shadow-lift",
              className
            )}
            initial={{
              opacity: 0,
              filter: "blur(4px)",
              transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
            }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              transform: `perspective(500px) ${rotateAxis}(0deg) scale(1)`,
            }}
            exit={{
              opacity: 0,
              filter: "blur(4px)",
              transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
            }}
            transition={transition}
            {...props}
          />
        </AlertDialogPrimitive.Content>
      </div>
    </AlertDialogPortal>
  );
}

type AlertDialogHeaderProps = React.ComponentProps<"div">;

function AlertDialogHeader({ className, ...props }: AlertDialogHeaderProps) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

type AlertDialogFooterProps = React.ComponentProps<"div">;

function AlertDialogFooter({ className, ...props }: AlertDialogFooterProps) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("grid grid-cols-2 gap-2.5", className)}
      {...props}
    />
  );
}

type AlertDialogTitleProps = React.ComponentProps<
  typeof AlertDialogPrimitive.Title
>;

function AlertDialogTitle({ className, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-[16px] font-semibold text-ink", className)}
      {...props}
    />
  );
}

type AlertDialogDescriptionProps = React.ComponentProps<
  typeof AlertDialogPrimitive.Description
>;

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogDescriptionProps) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-[14px] leading-relaxed text-muted", className)}
      {...props}
    />
  );
}

type AlertDialogActionProps = React.ComponentProps<
  typeof AlertDialogPrimitive.Action
>;

function AlertDialogAction({ className, ...props }: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn("btn-primary", className)}
      {...props}
    />
  );
}

type AlertDialogCancelProps = React.ComponentProps<
  typeof AlertDialogPrimitive.Cancel
>;

function AlertDialogCancel({ className, ...props }: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn("btn-secondary", className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  useAlertDialog,
  type AlertDialogProps,
  type AlertDialogContentProps,
};
