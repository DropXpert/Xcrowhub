import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronsUp, type LucideIcon } from "lucide-react";
import { BorderGlow } from "@/components/BorderGlow";
import { nimiqPayDeeplink, NIMIQ_PAY_SITE, openNimiqPayOrStore } from "@/lib/host";

/* Shared building blocks for the public marketing surface (Landing + Marketplace).
   Kept standalone: no app stores, wallet, or router guards. */

export const deeplink = nimiqPayDeeplink();

// Scroll-reveal: adds .is-visible when an element scrolls into view.
export function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window) || els.length === 0) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export function useParallax() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setY(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return y;
}

export function Nav({ scrolled }: { scrolled: boolean }) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "py-1.5" : "py-2"
      }`}
    >
     <div className="mx-auto max-w-[1000px] px-5">
  <div
    className={`flex items-center justify-between rounded-pill px-3 py-1.5 transition-all duration-300 ${
      scrolled ? "glass" : ""
    }`}
  >
          <Link to="/" className="flex items-center pl-1">
            <img src="/logo-wordmark.png" alt="XcrowHub" className="w-40 h-auto" />
          </Link>

          <nav className="hidden items-center gap-7 text-[15.5px] text-[#B9B1A2] md:flex">
            <a href="/#how" className="transition hover:text-[#EDE7DA]">How it works</a>
            <Link to="/marketplace" className="transition hover:text-[#EDE7DA]">Marketplace</Link>
            <a href="/#referral" className="transition hover:text-[#EDE7DA]">Refer &amp; earn</a>
            <Link to="/docs" className="transition hover:text-[#EDE7DA]">Docs</Link>
            <a href={NIMIQ_PAY_SITE} target="_blank" rel="noopener noreferrer" className="transition hover:text-[#EDE7DA]">Nimiq Pay</a>
          </nav>

          <a
            href={deeplink}
            onClick={openNimiqPayOrStore(deeplink)}
            className="btn-gold !px-4 !py-2 !text-[14.5px]"
          >
            Launch app
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#C6DDD7] p-2 sm:p-3">
      <div className="relative overflow-hidden rounded-[24px] border border-white/80 bg-[#0D433E] text-[#F3F5EF] shadow-[0_18px_55px_rgba(4,28,25,0.28)] sm:rounded-[28px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 720 520"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-[72%] opacity-80"
        >
          <g fill="none" stroke="rgba(205,245,233,0.18)" strokeWidth="1">
            <path d="M20 520 300 0" />
            <path d="M700 520 430 0" />
            <path d="m55 520 315-390 300 390" />
            <path d="m165 520 205-205 205 205" />
          </g>
        </svg>

        <div className="relative mx-auto max-w-site px-6 py-11 sm:px-8 sm:py-14 lg:px-16 lg:py-16">
          <div className="grid gap-11 md:grid-cols-[1.35fr_0.8fr_0.8fr] md:gap-12 lg:gap-20">
            <div>
              <Link to="/" className="inline-flex items-center gap-3">
                <img src="/logo-icon.png" alt="" className="h-9 w-9 rounded-xl" />
                <span className="text-[19px] font-extrabold tracking-[0.08em]">XCROWHUB</span>
              </Link>

              <p className="mt-7 max-w-[330px] text-[14px] leading-7 text-[#D4E0DB] sm:text-[15px]">
                Protected escrow payments for safer crypto P2P deals. Built for buyers and sellers using Nimiq Pay.
              </p>

              <div className="mt-7">
                <SocialDock />
              </div>

              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="mt-8 inline-flex items-center gap-3 border border-[#D6E9E3]/75 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#F3F5EF] transition hover:border-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <ChevronsUp className="h-4 w-4" />
                Back to top
              </button>
            </div>

            <nav aria-label="Site map">
              <p className="text-[13px] font-bold text-white">Site map</p>
              <div className="mt-6 flex flex-col items-start gap-4 text-[13px] text-[#D4E0DB]">
                <Link to="/" className="underline decoration-white/70 underline-offset-2 transition hover:text-white">Homepage</Link>
                <a href="/#how" className="transition hover:text-white">How it works</a>
                <a href="/#private-deals" className="transition hover:text-white">Private deals</a>
                <Link to="/marketplace" className="transition hover:text-white">Marketplace</Link>
                <a href="/#referral" className="transition hover:text-white">Refer &amp; earn</a>
                <Link to="/docs" className="transition hover:text-white">Docs</Link>
              </div>
            </nav>

            <nav aria-label="Legal links">
              <p className="text-[13px] font-bold text-white">Legal</p>
              <div className="mt-6 flex flex-col items-start gap-4 text-[13px] text-[#D4E0DB]">
                <Link to="/privacy" className="transition hover:text-white">Privacy policy</Link>
                <Link to="/terms" className="transition hover:text-white">Terms of service</Link>
                <a href={NIMIQ_PAY_SITE} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">Nimiq Pay</a>
              </div>
            </nav>
          </div>

          <div className="mt-12 border-t border-white/10 pt-5 text-[12px] text-[#A9C0B8]">
            © {new Date().getFullYear()} XcrowHub · Built on Nimiq Pay
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialDock() {
  return (
    <div className="flex items-center gap-5" aria-label="XcrowHub social links">
      <a
        href="https://x.com/xcrowhub"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Follow XcrowHub on X"
        title="X · @xcrowhub"
        className="text-white transition hover:-translate-y-0.5 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
        </svg>
      </a>

      <a
        href="https://t.me/xcrowhubtelegram"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Join XcrowHub on Telegram"
        title="Telegram · xcrowhubtelegram"
        className="text-white transition hover:-translate-y-0.5 hover:text-[#68C7F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M21.944 2.506a1.5 1.5 0 0 0-1.535-.204L2.744 9.117c-1.21.466-1.193 1.18-.218 1.478l4.532 1.414 1.759 5.455c.213.588.108.822.728.822.479 0 .69-.218.956-.478l2.186-2.126 4.55 3.36c.838.462 1.443.224 1.65-.777l2.986-14.073c.306-1.224-.468-1.78-1.229-1.686ZM8.87 11.684l8.84-5.58c.441-.267.846-.123.514.172l-7.274 6.562-.283 3.017-1.797-4.171Z" />
        </svg>
      </a>
    </div>
  );
}

export function SectionHeading({
  chip,
  title,
  sub,
}: {
  chip: string;
  title: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="reveal mx-auto max-w-2xl text-center">
      <span className="lp-chip mx-auto">{chip}</span>
      <h2 className="mt-4 text-[25px] font-extrabold leading-[1.14] tracking-tight sm:mt-5 sm:text-[32px] sm:leading-[1.1] md:text-[44px]">
        {title}
      </h2>
      <p className="mx-auto mt-3.5 max-w-xl text-[16px] leading-relaxed text-[#B9B1A2] sm:mt-4 sm:text-[17px] md:text-[18px]">
        {sub}
      </p>
    </div>
  );
}

export function GlowCard({
  children,
  className = "",
  innerClassName = "",
  borderRadius = 16,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  borderRadius?: number;
}) {
  return (
    <BorderGlow
      className={`h-full ${className}`}
      borderRadius={borderRadius}
      backgroundColor="#121A16"
      colors={["#E8B964", "#4FD1A5", "#F5D89B"]}
      glowColor="160 65% 62%"
      glowIntensity={0.85}
      edgeSensitivity={25}
      fillOpacity={0.35}
    >
      <div className={`glass group h-full !border-0 ${innerClassName}`}>{children}</div>
    </BorderGlow>
  );
}

export function BentoCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      <GlowCard innerClassName="p-6 sm:p-7">{children}</GlowCard>
    </div>
  );
}

export function FeatureIcon({
  icon: Icon,
  accent = "gold",
}: {
  icon: LucideIcon;
  accent?: "gold" | "jade" | "warn";
}) {
  const map = {
    gold: "from-gold-soft/25 to-gold/10 text-gold",
    jade: "from-jade/25 to-jade/10 text-jade",
    warn: "from-[#E5B567]/25 to-[#E5B567]/10 text-[#E5B567]",
  };
  return (
    <span className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${map[accent]} ring-1 ring-white/10`}>
      <Icon className="h-5 w-5" strokeWidth={2} />
    </span>
  );
}
