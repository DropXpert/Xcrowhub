import { createPortal } from "react-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { tourUserKey, useTourStore } from "@/store/tourStore";

function SplitWelcomeText({ text }: { text: string }) {
  return (
    <h1
      aria-label={text}
      className="w-full whitespace-nowrap text-center text-[clamp(22px,7vw,30px)] font-black leading-[1.05] tracking-[-0.04em] text-white"
    >
      <span aria-hidden="true">
        {Array.from(text).map((character, index) => (
          <span
            key={`${character}-${index}`}
            className="welcome-split-char inline-block whitespace-pre"
            style={{ animationDelay: `${index * 35}ms` }}
          >
            {character}
          </span>
        ))}
      </span>
    </h1>
  );
}

export function NewUserWelcome() {
  const session = useAuthStore((state) => state.session);
  const welcomeAddress = useTourStore((state) => state.welcomeAddress);
  const finishWelcome = useTourStore((state) => state.finishWelcome);

  if (
    !session?.address ||
    !welcomeAddress ||
    tourUserKey(session.address) !== tourUserKey(welcomeAddress)
  ) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-[#07130f]/75 px-5 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-user-welcome"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(30,199,145,0.28),transparent_45%)]"
      />
      <div
        className="welcome-card relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-[28px] border border-white/15 bg-black/35 px-6 py-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      >
        <span
          className="welcome-icon mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#71e8bd]"
        >
          <Sparkles className="h-6 w-6" />
        </span>

        <div id="new-user-welcome">
          <SplitWelcomeText text="Welcome to XcrowHub" />
        </div>

        <p
          className="welcome-fade mt-4 max-w-[17rem] text-[13.5px] leading-relaxed text-white/70"
          style={{ animationDelay: "900ms" }}
        >
          Create protected deals, sell services, and get help with escrow
          keeping every payment safe.
        </p>

        <button
          type="button"
          onClick={() => finishWelcome(session.address)}
          className="welcome-fade mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-bold text-[#10211b] shadow-lg transition active:scale-[0.98]"
          style={{ animationDelay: "1050ms" }}
        >
          Show me around
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
