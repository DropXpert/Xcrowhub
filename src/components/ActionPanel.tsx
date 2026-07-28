import { type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export function ActionPanel({
  heading,
  description,
  children,
  hint,
}: {
  heading: string;
  description?: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <section className="card space-y-4 px-5 py-5">
      <header className="space-y-1">
        <h3 className="text-[15px] font-semibold text-ink">{heading}</h3>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </header>
      <div className="space-y-2">{children}</div>
      {hint ? (
        <div className="flex items-start gap-2 border-t border-edge pt-3 text-[12.5px] text-muted">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>{hint}</div>
        </div>
      ) : null}
    </section>
  );
}
