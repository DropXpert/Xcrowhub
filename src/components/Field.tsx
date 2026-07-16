import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  children,
  required,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="field-label flex items-center gap-1.5">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
