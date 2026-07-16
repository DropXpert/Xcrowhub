import {
  AlertDialog as AlertDialogRoot,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/cn";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  cancelLabel?: string;
  actionLabel: string;
  onAction: () => void;
  destructive?: boolean;
  busy?: boolean;
}

/**
 * Convenience confirm dialog built on the animated ui/alert-dialog primitive
 * (radix + motion). Keeps the original prop API so existing call sites are
 * unchanged. The action is a plain button (not radix Action) so a `busy` async
 * handler can keep the dialog open while it works.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  actionLabel,
  onAction,
  destructive,
  busy,
}: AlertDialogProps) {
  return (
    <AlertDialogRoot open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className={cn(destructive ? "btn-danger" : "btn-primary")}
          >
            {actionLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}
