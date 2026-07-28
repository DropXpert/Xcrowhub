import type { TimelineEvent } from "@/types/deal";
import { formatDateTime } from "@/lib/time";
import {
  Check,
  Clock,
  FileText,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Undo2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";

function iconFor(kind: TimelineEvent["kind"]) {
  switch (kind) {
    case "created":
      return Sprout;
    case "paid":
      return Receipt;
    case "delivered":
      return FileText;
    case "received":
      return Check;
    case "released":
      return ShieldCheck;
    case "query":
      return ShieldAlert;
    case "proof":
      return Clock;
    case "admin":
      return ShieldCheck;
    case "refund":
      return Undo2;
    case "cancelled":
    case "expired":
      return XCircle;
  }
}

export function DealTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted">Nothing has happened yet.</p>
    );
  }
  return (
    <ol className="relative ml-2 space-y-5">
      <span
        aria-hidden
        className="absolute left-[10px] top-1 bottom-1 w-px bg-edge"
      />
      {events.map((event, idx) => {
        const Icon = iconFor(event.kind);
        const last = idx === events.length - 1;
        return (
          <li key={event.id} className="relative pl-8">
            <span
              className={cn(
                "absolute left-0 top-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border bg-surface",
                last
                  ? "border-accent text-accent"
                  : "border-edge text-muted"
              )}
            >
              <Icon className="h-3 w-3" strokeWidth={2.25} />
            </span>
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium leading-snug text-ink">
                {event.label}
              </p>
              {event.detail ? (
                <p className="text-[13px] text-muted">{event.detail}</p>
              ) : null}
              <p className="text-[12px] uppercase tracking-wider text-muted/80">
                {formatDateTime(event.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
