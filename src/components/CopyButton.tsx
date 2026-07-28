import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "md";
}

export function CopyButton({ text, className, size = "sm" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const dim = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy"}
      className={cn(
        "relative overflow-hidden rounded-md border border-edge bg-surface text-muted",
        "grid place-items-center transition hover:border-accent/40 hover:text-accent active:scale-95",
        dim,
        className
      )}
    >
      <span
        className="absolute inset-0 grid place-items-center transition-all duration-200"
        style={{
          opacity: copied ? 0 : 1,
          transform: copied ? "scale(0.4) rotate(-15deg)" : "scale(1) rotate(0deg)",
        }}
      >
        <Copy className={icon} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center text-accent transition-all duration-200"
        style={{
          opacity: copied ? 1 : 0,
          transform: copied ? "scale(1) rotate(0deg)" : "scale(0.4) rotate(15deg)",
        }}
      >
        <Check className={icon} />
      </span>
    </button>
  );
}
