import { useEffect, useState } from "react";
import {
  Store,
  ShieldCheck,
  Package,
  Palette,
  Code2,
  MessageSquare,
  Gamepad2,
  FileText,
  BadgeDollarSign,
  Handshake,
  Lock,
  Sparkles,
  Zap,
  Apple,
  Play,
} from "lucide-react";
import { NIMIQ_PAY_IOS, NIMIQ_PAY_ANDROID, nimiqPayDeeplink } from "@/lib/host";
import {
  Nav,
  Footer,
  SectionHeading,
  FeatureIcon,
  useReveal,
  useParallax,
} from "@/pages/landing/shared";

/* Marketplace: public marketing page for the optional listings feature.
   Standalone like Landing; renders in any browser, routes people into Nimiq Pay. */

const CATEGORIES = [
  { icon: Package, label: "Digital goods" },
  { icon: Palette, label: "Design" },
  { icon: FileText, label: "Content" },
  { icon: Code2, label: "Software" },
  { icon: MessageSquare, label: "Consulting" },
  { icon: Gamepad2, label: "Gaming" },
];

const marketplaceDeeplink = nimiqPayDeeplink("/listings");

export default function Marketplace() {
  useReveal();
  const scrollY = useParallax();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setScrolled(scrollY > 12);
  }, [scrollY]);

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden pt-28 pb-14 sm:pt-32 sm:pb-20 md:pt-44 md:pb-24">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div
            className="lp-aurora animate-aurora h-[40rem] w-[40rem] -left-40 -top-40"
            style={{ background: "radial-gradient(circle, rgba(232,185,100,0.30), transparent 60%)" }}
          />
          <div
            className="lp-aurora animate-aurora h-[34rem] w-[34rem] right-[-10rem] top-0"
            style={{ background: "radial-gradient(circle, rgba(79,209,165,0.28), transparent 60%)", animationDelay: "-7s" }}
          />
        </div>
        <div aria-hidden className="lp-grid absolute inset-0 -z-10" />

        <div className="mx-auto max-w-site px-5 text-center">
          <span className="lp-chip mx-auto reveal">
            <Store className="h-3.5 w-3.5" /> Marketplace + bidding
          </span>
          <h1 className="reveal mx-auto mt-5 max-w-3xl text-[30px] font-extrabold leading-[1.1] tracking-tight sm:mt-6 sm:text-[40px] sm:leading-[1.05] md:text-[56px] lg:text-[60px]">
            Public listings.
            <br />
            <span className="text-gradient">Buy now or make an offer.</span>
          </h1>
          <p className="reveal mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-[#B9B1A2] sm:mt-6 sm:max-w-xl sm:text-[16px] md:text-[17.5px]">
            List a repeat offer on the XcrowHub marketplace. Buyers pay your listed price
            or submit a bid. You accept or decline. Every sale becomes an escrow-protected
            deal with the same delivery and dispute rules as a private deal. A 1% fee applies
            only when a marketplace sale completes.
          </p>
          <div className="reveal mt-7 flex flex-col items-center justify-center gap-3 sm:mt-9 sm:flex-row">
            <a href={marketplaceDeeplink} className="btn-gold w-full justify-center sm:w-auto">
              <Store className="h-[18px] w-[18px]" />
              Open live marketplace
            </a>
            <div className="flex w-full gap-3 sm:w-auto">
              <a href={NIMIQ_PAY_IOS} target="_blank" rel="noopener noreferrer" className="btn-glass !px-5 flex-1 justify-center sm:flex-none">
                <Apple className="h-[18px] w-[18px]" /> iOS
              </a>
              <a href={NIMIQ_PAY_ANDROID} target="_blank" rel="noopener noreferrer" className="btn-glass !px-5 flex-1 justify-center sm:flex-none">
                <Play className="h-[18px] w-[18px]" /> Android
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Category strip */}
      <section className="reveal border-y border-white/5 bg-white/[0.015] py-7">
        <div className="mx-auto max-w-site px-5">
          <p className="mb-5 text-center text-[11.5px] uppercase tracking-[0.2em] text-[#6F695C]">
            Browse by category
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {CATEGORIES.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.03] px-4 py-2 text-[13.5px] font-medium text-[#B9B1A2] transition hover:border-gold/40 hover:text-[#EDE7DA]"
              >
                <c.icon className="h-4 w-4 text-gold" />
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Live marketplace CTA */}
      <section className="relative py-16 sm:py-24 md:py-28">
        <div className="mx-auto max-w-site px-5">
          <SectionHeading
            chip="Live marketplace"
            title={<>Browse real listings <span className="text-gradient">inside the app.</span></>}
            sub="Current listings, offers, and purchases are shown in XcrowHub inside Nimiq Pay. When a sale starts, escrow takes over."
          />

          <div className="reveal mx-auto mt-10 max-w-2xl glass rounded-2xl p-6 text-center sm:mt-14 sm:p-8">
            <FeatureIcon icon={Store} accent="jade" />
            <h3 className="mt-5 text-[20px] font-bold">Open current listings</h3>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-[#B9B1A2]">
              Browse active listings, buy at list price, or make an offer from the mini app.
              Every purchase becomes a protected escrow deal.
            </p>
            <a href={marketplaceDeeplink} className="btn-gold mt-6 w-full justify-center sm:w-auto">
              <Store className="h-[18px] w-[18px]" />
              Open marketplace
            </a>
          </div>
        </div>
      </section>

      {/* How selling works */}
      <section className="relative py-14 sm:py-20">
        <div aria-hidden className="lp-grid absolute inset-0 -z-10 opacity-60" />
        <div className="mx-auto max-w-site px-5">
          <SectionHeading
            chip="How selling works"
            title={<>List once. <span className="text-gradient">Sell with escrow.</span></>}
            sub="Three steps from public listing to paid. Same protected flow as a private deal."
          />
          <div className="mt-10 grid gap-3 sm:mt-14 sm:gap-4 md:grid-cols-3">
            {[
              { icon: Store, t: "Publish your listing", d: "Set a title, description, price in NIM or USDT, and category. Your offer appears in the live marketplace." },
              { icon: Handshake, t: "Buyer buys or bids", d: "Buyers pay your list price with Buy now, or submit a lower offer. You review bids and accept the ones you want." },
              { icon: ShieldCheck, t: "Escrow deal opens", d: "Every accepted sale becomes a protected deal: buyer pays into hold, you deliver, buyer confirms, funds release." },
            ].map((s, i) => (
              <div key={s.t} className="reveal" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="group glass relative h-full overflow-hidden rounded-2xl p-6 sm:p-7">
                  <div className="absolute -right-3 -top-4 text-[68px] font-black leading-none text-white/[0.04] transition group-hover:text-gold/10">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <FeatureIcon icon={s.icon} />
                  <h3 className="mt-5 text-[16.5px] font-bold">{s.t}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[#B9B1A2]">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fees + private band */}
      <section className="relative py-12 sm:py-16">
        <div className="mx-auto max-w-site px-5">
          <div className="reveal grid gap-4 md:grid-cols-2">
            <div className="glass rounded-2xl p-6 sm:p-8">
              <FeatureIcon icon={BadgeDollarSign} accent="jade" />
              <h3 className="mt-5 text-[20px] font-bold">1% on completed sales</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">
                Listing is free. The marketplace fee applies only when a sale completes,
                and it is shown before you publish. Private deals stay separate from
                marketplace sale accounting.
              </p>
            </div>
            <div className="glass rounded-2xl p-6 sm:p-8">
              <FeatureIcon icon={Lock} />
              <h3 className="mt-5 text-[20px] font-bold">Escrow on every sale</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">
                Marketplace listings are public, but payment never goes straight to you.
                Funds sit in hold until the buyer confirms delivery. Buy-now and
                accepted offers both follow the same rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-16 sm:py-24 md:py-28">
        <div className="mx-auto max-w-site px-5">
          <div className="reveal relative overflow-hidden rounded-3xl p-[1px]">
            <div
              aria-hidden
              className="absolute inset-0 animate-spin-slow opacity-70"
              style={{ background: "conic-gradient(from 0deg, transparent, rgba(232,185,100,0.6), transparent 30%, rgba(79,209,165,0.5), transparent 60%)" }}
            />
            <div className="relative overflow-hidden rounded-[calc(28px-1px)] bg-night-soft px-5 py-12 text-center sm:px-7 sm:py-16 md:px-16 md:py-20">
              <div aria-hidden className="lp-grid absolute inset-0 opacity-50" />
              <div
                aria-hidden
                className="lp-aurora animate-aurora absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2"
                style={{ background: "radial-gradient(circle, rgba(232,185,100,0.3), transparent 60%)" }}
              />
              <div className="relative">
                <span className="lp-chip mx-auto">
                  <Sparkles className="h-3.5 w-3.5" /> Open in Nimiq Pay
                </span>
                <h2 className="mx-auto mt-5 max-w-2xl text-[26px] font-extrabold leading-[1.12] tracking-tight sm:mt-6 sm:text-[34px] sm:leading-[1.08] md:text-[48px]">
                  Publish your first listing
                  <br />
                  <span className="text-gradient">in Nimiq Pay.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-[#B9B1A2] sm:mt-5 sm:text-[16px]">
                  Open XcrowHub, create a listing with your price, and let buyers purchase
                  or bid. Every order runs through escrow. Free to list, 1% only on
                  completed marketplace sales.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:mt-9 sm:flex-row">
                  <a href={marketplaceDeeplink} className="btn-gold w-full justify-center sm:w-auto">
                    <Zap className="h-[18px] w-[18px]" />
                    Open in Nimiq Pay
                  </a>
                  <div className="flex w-full gap-3 sm:w-auto">
                    <a href={NIMIQ_PAY_IOS} target="_blank" rel="noopener noreferrer" className="btn-glass !px-5 flex-1 justify-center sm:flex-none">
                      <Apple className="h-[18px] w-[18px]" /> iOS
                    </a>
                    <a href={NIMIQ_PAY_ANDROID} target="_blank" rel="noopener noreferrer" className="btn-glass !px-5 flex-1 justify-center sm:flex-none">
                      <Play className="h-[18px] w-[18px]" /> Android
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
