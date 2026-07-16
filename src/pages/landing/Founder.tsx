import { ArrowRight } from "lucide-react";
import ProfileCard from "@/components/ProfileCard";
import { SectionHeading } from "@/pages/landing/shared";

/* Founder section — split into its own module so Landing can lazy-load it.
   ProfileCard alone pulls ~1000 lines of TSX + CSS plus a tilt engine, none of
   which the initial paint of the landing hero needs. */

const socials = [
  { label: "X / Twitter", href: "https://x.com/faizionweb3", handle: "@faizionweb3" },
  { label: "Telegram", href: "https://t.me/faiziweb3", handle: "@faiziweb3" },
  { label: "GitHub", href: "https://github.com/dropxpert", handle: "dropxpert" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/faizidx/", handle: "faizidx" },
];

export default function Founder() {
  return (
    <section id="founder" className="relative py-16 sm:py-24 md:py-32">
      <div aria-hidden className="lp-grid absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="Meet the founder"
          title={<>Built by one person, <span className="text-gradient">shipping in public.</span></>}
          sub="XcrowHub is founded and built end-to-end by Faizi — product, frontend, backend, growth, and support. Reach out any time."
        />

        <div className="mt-10 grid items-center gap-8 sm:mt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div className="reveal space-y-5 text-center lg:text-left">
            <p className="text-[15px] leading-relaxed text-[#B9B1A2]">
              Web3 founder and full-stack builder specializing in Telegram Mini Apps and
              on-chain products. Previously scaled Authidex from 0 to 1,000 users in two
              weeks — solo. XcrowHub is the same playbook applied to safer P2P crypto deals.
            </p>
            <p className="text-[14px] leading-relaxed text-[#928B7D]">
              If you're a seller, a buyer, or just curious — DMs are open on every channel below.
            </p>

            <div className="mx-auto grid max-w-md grid-cols-2 gap-2.5 lg:mx-0">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-soft flex items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:border-white/20"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-[#928B7D]">
                      {s.label}
                    </p>
                    <p className="mt-0.5 truncate text-[13.5px] font-semibold text-[#EDE7DA]">
                      {s.handle}
                    </p>
                  </div>
                  <ArrowRight className="ml-2 h-4 w-4 shrink-0 text-gold/70" />
                </a>
              ))}
            </div>
          </div>

          <div className="reveal mx-auto w-full max-w-[380px]" style={{ transitionDelay: "120ms" }}>
            <ProfileCard
              avatarUrl="/founder.webp"
              name="Faizi"
              title="Founder · Full-stack builder"
              behindGlowColor="rgba(232, 185, 100, 0.55)"
              innerGradient="linear-gradient(145deg,#2f6f5e88 0%,#e8b96444 100%)"
              showUserInfo={false}
              enableMobileTilt
            />
          </div>
        </div>
      </div>
    </section>
  );
}
