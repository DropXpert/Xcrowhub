import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { type ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  back = true,
  right,
}: {
  title: string;
  eyebrow?: string;
  back?: boolean | string;
  right?: ReactNode;
}) {
  const navigate = useNavigate();

  function handleBack() {
    if (typeof back === "string") navigate(back);
    else navigate(-1);
  }

  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {back ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            className="-ml-2 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-edge/40 hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="field-label truncate">{eyebrow}</p>
          ) : null}
          <h1 className="truncate text-[20px] font-bold leading-tight tracking-tight text-ink">
            {title}
          </h1>
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
