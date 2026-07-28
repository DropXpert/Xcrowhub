import { ArrowRight } from "lucide-react";
import ProfileCard from "@/components/ProfileCard";
import { SectionHeading } from "@/pages/landing/shared";

/* Founder section is loaded with the landing page so its reveal elements are
   registered immediately and never remain hidden behind a late lazy import. */

const socials = [
  { label: "X / Twitter", href: "https://x.com/faizionweb3", handle: "@faizionweb3" },
  { label: "Telegram", href: "https://t.me/faiziweb3", handle: "@faiziweb3" },
  { label: "GitHub", href: "https://github.com/DropXpert", handle: "@dropxpert" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/faizidx/", handle: "Faizi" },
];

export default function Founder() {
  return (
    <section id="founder" className="relative py-16 sm:py-24 md:py-32">
      <div aria-hidden className="lp-grid absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="Meet the founder"
          title={<>Built by one person, <span className="text-gradient">shipping in public.</span></>}
          sub="XcrowHub is independently designed and built end-to-end, from product experience to on-chain settlement."
        />

        <div className="mt-10 grid items-center gap-8 sm:mt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div className="reveal space-y-5 text-center lg:text-left">
            <p className="text-[15px] leading-relaxed text-[#B9B1A2]">
              An independent Web3 builder focused on practical wallet-native products.
              XcrowHub applies that experience to safer peer-to-peer crypto deals.
            </p>
            <p className="text-[14px] leading-relaxed text-[#928B7D]">
              Follow the founder, explore the work, or get in touch through the
              channels below.
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
