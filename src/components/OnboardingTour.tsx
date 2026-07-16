import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { SECTION_TITLES, SECTION_TOURS, type TourStep } from "@/lib/tourConfig";
import { useAuthStore } from "@/store/authStore";
import { useTourStore } from "@/store/tourStore";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const RADIUS = 12;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 14;

export function OnboardingTour() {
  const session = useAuthStore((state) => state.session);
  const activeSection = useTourStore((state) => state.activeSection);
  const stepIndex = useTourStore((state) => state.stepIndex);
  const next = useTourStore((state) => state.next);
  const prev = useTourStore((state) => state.prev);
  const skipSection = useTourStore((state) => state.skipSection);
  const completeSection = useTourStore((state) => state.completeSection);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const frame = useRef<number | null>(null);

  const steps = activeSection ? SECTION_TOURS[activeSection] : [];
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  useLayoutEffect(() => {
    if (!activeSection || !step) return;

    function measure() {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setViewport({ w: window.innerWidth, h: window.innerHeight });
        const anchor = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
        if (!anchor || step.placement === "center") {
          setRect(null);
          return;
        }

        const bounds = anchor.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) {
          setRect(null);
          return;
        }
        setRect({
          top: bounds.top,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        });

        const centerY = bounds.top + bounds.height / 2;
        if (centerY < 80 || centerY > window.innerHeight - 80) {
          anchor.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const retry = window.setTimeout(measure, 180);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearTimeout(retry);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [activeSection, step, stepIndex]);

  useEffect(() => {
    if (!activeSection || !step || !session?.address) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") skipSection(session!.address);
      if (event.key === "ArrowLeft" && !isFirst) prev();
      if (event.key === "ArrowRight" || event.key === "Enter") {
        if (isLast) completeSection(session!.address);
        else next();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSection,
    completeSection,
    isFirst,
    isLast,
    next,
    prev,
    session?.address,
    skipSection,
    step,
  ]);

  if (!activeSection || !step || !session?.address) return null;

  const centered = step.placement === "center" || !rect;
  const tooltip = computeTooltip(rect, step.placement ?? "bottom", viewport);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <svg
        className="absolute inset-0 h-full w-full pointer-events-auto"
        onClick={() => skipSection(session.address)}
        aria-hidden
      >
        <defs>
          <mask id="section-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && !centered && (
              <rect
                x={rect.left - PADDING}
                y={rect.top - PADDING}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx={RADIUS}
                ry={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(10, 16, 13, 0.78)"
          mask="url(#section-tour-mask)"
        />
      </svg>

      {rect && !centered && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent shadow-[0_0_0_6px_rgba(47,111,94,0.25),0_0_28px_rgba(47,111,94,0.45)]"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
          }}
        />
      )}

      <div
        className="pointer-events-auto absolute rounded-2xl border border-edge bg-surface shadow-lift"
        style={{
          top: tooltip.top,
          left: tooltip.left,
          width: Math.min(TOOLTIP_WIDTH, viewport.w - 24),
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
              {SECTION_TITLES[activeSection]}
            </p>
            <h2 id="tour-title" className="text-[15px] font-bold leading-tight text-ink">
              {step.title}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
          </div>
          <button
            type="button"
            onClick={() => skipSection(session.address)}
            aria-label={`Skip ${SECTION_TITLES[activeSection]} guide`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-bg hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-edge px-3 py-2.5">
          <div className="flex shrink-0 items-center gap-1" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
            {steps.map((_, index) => (
              <span
                key={index}
                className={`h-1 rounded-full transition-all ${
                  index === stepIndex
                    ? "w-3 bg-accent"
                    : index < stepIndex
                    ? "w-1 bg-accent/50"
                    : "w-1 bg-edge"
                }`}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!isFirst && (
              <button
                type="button"
                onClick={prev}
                aria-label="Previous tip"
                className="btn-secondary grid h-7 w-7 place-items-center p-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {!isLast ? (
              <>
                <button
                  type="button"
                  onClick={() => skipSection(session.address)}
                  className="px-2 py-1 text-[11.5px] font-medium text-muted transition hover:text-ink"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="btn-primary flex items-center gap-0.5 px-2.5 py-1 text-[11.5px]"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => completeSection(session.address)}
                className="btn-primary px-3 py-1 text-[11.5px]"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function computeTooltip(
  rect: Rect | null,
  placement: NonNullable<TourStep["placement"]>,
  viewport: { w: number; h: number }
): { top: number; left: number } {
  const margin = 12;
  const width = Math.min(TOOLTIP_WIDTH, viewport.w - margin * 2);
  const estimatedHeight = 205;

  if (!rect || placement === "center") {
    return {
      top: Math.max(margin, viewport.h / 2 - estimatedHeight / 2),
      left: Math.max(margin, viewport.w / 2 - width / 2),
    };
  }

  let top = rect.top + rect.height + TOOLTIP_GAP;
  let left = rect.left + rect.width / 2 - width / 2;
  if (placement === "top") top = rect.top - estimatedHeight - TOOLTIP_GAP;
  if (placement === "left") {
    top = rect.top + rect.height / 2 - estimatedHeight / 2;
    left = rect.left - width - TOOLTIP_GAP;
  }
  if (placement === "right") {
    top = rect.top + rect.height / 2 - estimatedHeight / 2;
    left = rect.left + rect.width + TOOLTIP_GAP;
  }

  return {
    top: Math.max(margin, Math.min(top, viewport.h - estimatedHeight - margin)),
    left: Math.max(margin, Math.min(left, viewport.w - width - margin)),
  };
}
