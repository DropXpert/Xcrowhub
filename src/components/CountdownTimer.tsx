import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatCountdown, msUntil } from "@/lib/time";
import { cn } from "@/lib/cn";

export function CountdownTimer({
  deadline,
  onExpire,
  className,
  label = "Proof window",
}: {
  deadline: string | undefined;
  onExpire?: () => void;
  className?: string;
  label?: string;
}) {
  const [remaining, setRemaining] = useState(() => msUntil(deadline));

  useEffect(() => {
    setRemaining(msUntil(deadline));
    const id = setInterval(() => {
      const next = msUntil(deadline);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, onExpire]);

  if (!deadline) return null;

  const expired = remaining <= 0;
  return (
    <div
      className={cn(
        "card flex items-center justify-between gap-4 px-4 py-3",
        expired ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <Clock
          className={cn(
            "h-4 w-4",
            expired ? "text-danger" : "text-warning"
          )}
        />
        <div className="leading-tight">
          <p className="text-[12px] uppercase tracking-wider text-muted">
            {label}
          </p>
          <p
            className={cn(
              "text-[15px] font-medium",
              expired ? "text-danger" : "text-ink"
            )}
          >
            {expired ? "Deadline passed" : "Time remaining"}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "font-mono text-[17px] font-semibold tabular-nums",
          expired ? "text-danger" : "text-ink"
        )}
      >
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}
