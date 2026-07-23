import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Lock,
  ShieldCheck,
  Clock,
  FileCheck2,
  ArrowRight,
  Check,
  Scale,
  Fingerprint,
  Wallet,
  Zap,
  BadgeDollarSign,
  EyeOff,
  Store,
  Link2,
  ListChecks,
  Gift,
  Coins,
  Share2,
  UserPlus,
  Copy,
} from "lucide-react";

import { SpotlightCard } from "@/components/SpotlightCard";
import { Nav, Footer, SectionHeading, FeatureIcon, BentoCard, GlowCard, useReveal, useParallax, deeplink } from "@/pages/landing/shared";
import { APP_URL, openNimiqPayOrStore } from "@/lib/host";

/* Founder pulls in ProfileCard (~1000 lines of TSX + CSS + tilt engine). Split
   it out of Landing's initial bundle so the hero paints first. */
const Founder = lazy(() => import("@/pages/landing/Founder"));

/* ───────────────────────────────────────────────────────────────────────────
   Landing: the public, browser-facing marketing page.

   This is intentionally standalone: it does NOT touch the app's stores, wallet,
   router guards, or Nimiq host APIs. It renders cleanly in any browser. The app
   itself works in browsers and inside Nimiq Pay.
─────────────────────────────────────────────────────────────────────────── */

export default function Landing() {
  useReveal();
  const scrollY = useParallax();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setScrolled(scrollY > 12);
  }, [scrollY]);

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />
      <Hero scrollY={scrollY} />
      <TrustBar />
      <HowItWorks />
      <PrivateDeals />
      <MarketplaceTeaser />
      <ReferEarn />
      <DisputeShowcase />
      <TrustSignals />
      <Suspense fallback={<div className="h-[560px]" aria-hidden />}>
        <Founder />
      </Suspense>
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
function Hero({ scrollY }: { scrollY: number }) {
  return (
    <section id="top" className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-20 md:pt-44 md:pb-32">
      {/* Aurora field */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div
          className="lp-aurora animate-aurora h-[42rem] w-[42rem] -left-40 -top-40"
          style={{ background: "radial-gradient(circle, rgba(79,209,165,0.34), transparent 60%)" }}
        />
        <div
          className="lp-aurora animate-aurora h-[38rem] w-[38rem] right-[-12rem] top-10"
          style={{ background: "radial-gradient(circle, rgba(232,185,100,0.30), transparent 60%)", animationDelay: "-6s" }}
        />
        <div
          className="lp-aurora animate-aurora h-[30rem] w-[30rem] left-1/3 top-1/2"
          style={{ background: "radial-gradient(circle, rgba(47,111,94,0.30), transparent 60%)", animationDelay: "-11s" }}
        />
      </div>
      <div aria-hidden className="lp-grid absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-site items-center gap-10 px-5 sm:gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        {/* Left: copy */}
        <div className="reveal text-center lg:text-left">
          <h1 className="text-[31px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] sm:leading-[1.04] md:text-[56px] lg:text-[62px]">
            Protected deals for <span className="text-gradient">crypto P2P.</span>
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-[15px] font-medium leading-relaxed text-[#EDE7DA] sm:mt-5 lg:mx-0">
            Money stays locked in escrow until delivery is confirmed. No fees on private deals. Works for both one-time deals and repeat work.
          </p>

          <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-[#B9B1A2] sm:text-[15px] lg:mx-0">
            Create a private deal and share a link, or list your services on the marketplace and accept bids. During beta, sellers can keep up to 10 active deals at once to reduce spam.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
            <a
              href={`${APP_URL}/create/new`}
              className="btn-gold w-full justify-center whitespace-nowrap sm:w-auto"
            >
              <Wallet className="h-[18px] w-[18px]" />
              Create a private deal
            </a>
            <Link to="/marketplace" className="btn-glass w-full justify-center whitespace-nowrap sm:w-auto">
              <Store className="h-[18px] w-[18px]" />
              Browse marketplace
            </Link>
          </div>
        </div>

        {/* Right: floating receipt mockup */}
        <div className="reveal relative" style={{ transitionDelay: "120ms" }}>
          <HeroReceipt scrollY={scrollY} />
        </div>
      </div>
    </section>
  );
}

function HeroReceipt({ scrollY }: { scrollY: number }) {
  const float = Math.sin(scrollY / 600) * 6;
  return (
    <SpotlightCard
      spotlightColor="rgba(79, 209, 165, 0.28)"
      className="relative mx-auto w-full max-w-[380px]"
      style={{ transform: `translateY(${float}px)`, transition: "transform 0.1s linear" }}
    >
      <div className="glass relative z-[1] overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-soft to-gold text-night">
              <Lock className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-bold">Private deal</p>
              <p className="text-[11px] text-[#928B7D]">#XCR-7F2A</p>
            </div>
          </div>
          <span className="lp-chip !px-2.5 !py-1 !text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-jade" />
            Funds held
          </span>
        </div>

        <div className="my-5 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <p className="text-[12px] uppercase tracking-wider text-[#928B7D]">Item</p>
        <p className="mt-1 text-[15px] font-semibold">Logo design, final files</p>

        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-wider text-[#928B7D]">Amount in hold</p>
            <p className="mt-1 text-[30px] font-extrabold leading-none text-gradient-warm sm:text-[34px]">
              20<span className="ml-1.5 text-[15px] font-bold text-[#B9B1A2] sm:text-[16px]">USDT</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] uppercase tracking-wider text-[#928B7D]">Releases in</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-gold">
              <Clock className="h-4 w-4" /> 47:58:12
            </p>
          </div>
        </div>

        {/* Progress rail */}
        <div className="mt-6 space-y-2.5">
          {[
            { label: "Buyer paid into hold", done: true },
            { label: "Seller delivering", done: true },
            { label: "Buyer confirms receipt", done: false },
            { label: "Funds release to seller", done: false },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                  s.done
                    ? "border-jade bg-jade/15 text-jade"
                    : "border-white/15 text-[#5C5648]"
                }`}
              >
                {s.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className={`text-[13px] ${s.done ? "text-[#EDE7DA]" : "text-[#928B7D]"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <div className="perforation-dark mt-6" />

        <button className="btn-gold mt-5 w-full !py-3">
          <ShieldCheck className="h-[18px] w-[18px]" />
          Pay into protected hold
        </button>
      </div>
    </SpotlightCard>
  );
}

/* ── Trust bar ────────────────────────────────────────────────────────────── */
function TrustBar() {
  const items = [
    { icon: BadgeDollarSign, label: "0% fees on private deals" },
    { icon: Lock, label: "Funds held in escrow until delivery" },
    { icon: ListChecks, label: "10 active deals max during beta" },
    { icon: Fingerprint, label: "Wallet-signed actions only" },
    { icon: ShieldCheck, label: "Proof-based dispute resolution" },
  ];
  const loop = [...items, ...items];
  return (
    <section className="border-y border-white/5 bg-white/[0.02] py-5">
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <div className="flex w-max shrink-0 animate-marquee items-center gap-10 pr-10">
          {loop.map(({ icon: Icon, label }, i) => (
            <span
              key={`${label}-${i}`}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] text-[#B9B1A2]"
            >
              <Icon className="h-4 w-4 shrink-0 text-jade" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Private deals ────────────────────────────────────────────────────────── */
function PrivateDeals() {
  const points = [
    { icon: EyeOff, title: "Only you and your buyer", desc: "Only you and your buyer can access the deal." },
    { icon: Link2, title: "No public listing", desc: "No public listing required." },
    { icon: ShieldCheck, title: "Same escrow protection", desc: "Same escrow protection as marketplace deals." },
    { icon: FileCheck2, title: "Best for one-time work", desc: "Best for freelance work, custom orders, and one-time transactions." },
  ];

  return (
    <section id="private-deals" className="relative py-16 sm:py-24 md:py-32">
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="Private Deals"
          title="Private Deals"
          sub="Direct protected deals using a shareable link. Most deals on XcrowHub start this way. You create a deal with your terms and share a private link with one buyer. No one else can see it. Payment stays in escrow until you deliver and the buyer confirms."
        />

        <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2">
          {points.map((p, i) => (
            <BentoCard key={p.title} delay={i * 70}>
              <FeatureIcon icon={p.icon} accent="jade" />
              <h3 className="mt-4 text-[17px] font-bold">{p.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#B9B1A2]">{p.desc}</p>
            </BentoCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works ─────────────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { n: "01", icon: FileCheck2, t: "Create a deal", d: "Set the item, price (NIM or USDT), and delivery terms. Get a private link or publish it on the marketplace." },
    { n: "02", icon: Wallet, t: "Buyer pays into escrow", d: "The buyer pays into a protected hold. Money is locked and visible to both sides. It does not go directly to the seller." },
    { n: "03", icon: ShieldCheck, t: "Seller delivers", d: "Complete the work and mark it as delivered. You can attach proof if needed." },
    { n: "04", icon: Check, t: "Buyer confirms → Funds released", d: "Once the buyer confirms receipt, funds are released to you. If there's a dispute, both sides submit proof for review." },
  ];
  return (
    <section id="how" className="relative py-16 sm:py-24 md:py-32">
      <div aria-hidden className="lp-grid absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="How it works"
          title="How it works"
          sub="Simple 4-step process. Same flow for both private deals and marketplace orders."
        />

        <div className="mt-10 grid grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.n} className="reveal" style={{ transitionDelay: `${i * 90}ms` }}>
              <GlowCard innerClassName="relative overflow-hidden p-5 sm:p-6">
                <div className="absolute -right-3 -top-4 text-[56px] font-black leading-none text-white/[0.04] transition group-hover:text-gold/10 sm:text-[68px]">
                  {s.n}
                </div>
                <FeatureIcon icon={s.icon} />
                <h3 className="mt-5 text-[16.5px] font-bold">{s.t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#B9B1A2]">{s.d}</p>
                {i < steps.length - 1 && (
                  <ArrowRight className="mt-5 hidden h-4 w-4 text-gold/50 md:block" />
                )}
              </GlowCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Dispute showcase ─────────────────────────────────────────────────────── */
function DisputeShowcase() {
  return (
    <section id="disputes" className="relative py-16 sm:py-24 md:py-32">
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="Dispute Resolution"
          title="What happens in a dispute?"
          sub="If something goes wrong, either party can raise a dispute. A proof window opens for both sides — then a real person reviews the evidence. No one can win by default."
        />

        <div className="mt-10 grid sm:mt-14 gap-4 lg:grid-cols-3">
          {[
            {
              icon: FileCheck2,
              t: "Raise a query",
              d: "Either side flags a problem and a proof window opens for both to respond.",
              accent: "jade",
            },
            {
              icon: Scale,
              t: "Both submit proof",
              d: "Screenshots, files, transaction hashes — whatever backs your side of the story.",
              accent: "gold",
            },
            {
              icon: ShieldCheck,
              t: "An admin decides",
              d: "A human reviews the evidence and resolves it — release, refund, or a fair split.",
              accent: "warn",
            },
          ].map((c, i) => (
            <div key={c.t} className="reveal" style={{ transitionDelay: `${i * 90}ms` }}>
              <GlowCard innerClassName="h-full p-6 sm:p-7">
                <FeatureIcon icon={c.icon} accent={c.accent as "jade" | "gold" | "warn"} />
                <h3 className="mt-5 text-[18px] font-bold">{c.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">{c.d}</p>
              </GlowCard>
            </div>
          ))}
        </div>

        <p className="reveal mx-auto mt-6 max-w-xl text-center text-[14px] leading-relaxed text-[#B9B1A2]">
          No automatic payouts on a dispute — every contested deal is decided by a person, on the evidence.
        </p>
      </div>
    </section>
  );
}

/* ── Why trust XcrowHub ───────────────────────────────────────────────────── */
function TrustSignals() {
  const signals = [
    { icon: BadgeDollarSign, title: "Free private deals", desc: "Private deals have 0% fees — you receive the full amount." },
    { icon: Lock, title: "Escrow protection", desc: "Money stays locked until delivery is confirmed." },
    { icon: ListChecks, title: "Clear visibility", desc: "Both parties can see the deal status at every step." },
    { icon: Fingerprint, title: "Wallet-based", desc: "Sign in and act using your Nimiq Pay wallet only." },
  ];
  return (
    <section id="trust" className="relative py-16 sm:py-20 md:py-24">
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="Why Trust XcrowHub"
          title="Built for deals where trust matters."
          sub="XcrowHub is designed to protect both buyers and sellers in P2P crypto transactions."
        />

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2">
          {signals.map((s, i) => (
            <div key={s.title} className="reveal" style={{ transitionDelay: `${i * 60}ms` }}>
              <GlowCard innerClassName="p-5 sm:p-6">
                <FeatureIcon icon={s.icon} />
                <h3 className="mt-4 text-[15px] font-bold">{s.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#B9B1A2]">{s.desc}</p>
              </GlowCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ────────────────────────────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="relative py-16 sm:py-24 md:py-32">
      <div className="mx-auto max-w-site px-5">
        <div className="reveal relative overflow-hidden rounded-3xl p-[1px]">
          {/* gradient frame */}
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
              <h2 className="mx-auto mt-2 max-w-2xl text-[27px] font-extrabold leading-[1.12] tracking-tight sm:text-[36px] sm:leading-[1.08] md:text-[52px]">
                Ready to do safer <span className="text-gradient">P2P deals?</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-[#B9B1A2] sm:mt-5 sm:text-[16px]">
                Open XcrowHub in your browser or inside Nimiq Pay. Start with a private deal or publish a marketplace listing.
              </p>

              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:mt-9 sm:flex-row">
                <a
                  href={APP_URL}
                  className="btn-gold w-full justify-center sm:w-auto"
                >
                  <Zap className="h-[18px] w-[18px]" />
                  Open web app
                </a>
                <a
                  href={deeplink}
                  onClick={openNimiqPayOrStore(deeplink)}
                  className="btn-glass w-full justify-center sm:w-auto"
                >
                  <Wallet className="h-[18px] w-[18px]" />
                  Open in Nimiq Pay
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Refer & earn ─────────────────────────────────────────────────────────── */
function ReferEarn() {
  const steps = [
    { icon: Share2, t: "Share your link", d: "Every account gets a short referral code and a one-tap link into the app." },
    { icon: UserPlus, t: "They join & sell", d: "Anyone who signs up through your link is credited to you — first touch, locked in." },
    { icon: Coins, t: "You earn 10%", d: "Pocket 10% of the platform fee on every marketplace sale they make. Forever." },
  ];
  return (
    <section id="referral" className="relative py-16 sm:py-24 md:py-32">
      <div aria-hidden className="lp-grid absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-site px-5">
        <SectionHeading
          chip="Refer & earn"
          title={
            <>
              Invite friends. <span className="text-gradient">Earn on every sale.</span>
            </>
          }
          sub="Bring people to XcrowHub and earn a slice of the platform fee on the marketplace sales of everyone you refer — paid in crypto, claimable to your wallet any time."
        />

        <div className="mt-10 grid items-center gap-8 sm:mt-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
          <div className="reveal space-y-5">
            {steps.map((s, i) => (
              <div key={s.t} className="flex gap-4">
                <FeatureIcon icon={s.icon} accent={i === 2 ? "gold" : "jade"} />
                <div>
                  <h3 className="text-[16px] font-bold">{s.t}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#B9B1A2]">{s.d}</p>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <a
                href={`${APP_URL}/referral`}
                className="btn-gold w-full justify-center sm:w-auto"
              >
                <Gift className="h-[18px] w-[18px]" />
                Get your referral link
              </a>
            </div>
          </div>

          <ReferralCard />
        </div>
      </div>
    </section>
  );
}

function ReferralCard() {
  return (
    <SpotlightCard
      spotlightColor="rgba(232, 185, 100, 0.26)"
      className="reveal relative mx-auto w-full max-w-[420px]"
    >
      <div className="glass relative z-[1] overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-soft to-gold text-night">
              <Gift className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-bold">Your referral</p>
              <p className="text-[11px] text-[#928B7D]">Earn on every sale</p>
            </div>
          </div>
          <span className="lp-chip !px-2.5 !py-1 !text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-jade" />
            10% of fee
          </span>
        </div>

        <div className="my-5 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <p className="text-[12px] uppercase tracking-wider text-[#928B7D]">Your code</p>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/10">
          <span className="font-mono text-[20px] font-bold tracking-[0.28em] text-gradient-warm">A1B2C3</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#B9B1A2]">
            <Copy className="h-3.5 w-3.5" /> Copy
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            <p className="text-[11px] uppercase tracking-wider text-[#928B7D]">Friends joined</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none">12</p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            <p className="text-[11px] uppercase tracking-wider text-[#928B7D]">Claimable</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none text-gradient-warm">
              4.20<span className="ml-1 text-[13px] font-bold text-[#B9B1A2]">USDT</span>
            </p>
          </div>
        </div>

        <div className="perforation-dark mt-6" />

        <button className="btn-gold mt-5 w-full !py-3">
          <Wallet className="h-[18px] w-[18px]" />
          Claim to wallet
        </button>
      </div>
    </SpotlightCard>
  );
}

/* ── Marketplace teaser ───────────────────────────────────────────────────── */
function MarketplaceTeaser() {
  return (
    <section id="marketplace" className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-site px-5">
        <div className="reveal">
          <GlowCard borderRadius={24} innerClassName="p-6 sm:p-8 md:p-12">
          <div className="grid items-center gap-8 text-center lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:text-left">
            <div>
              <span className="lp-chip">
                <Store className="h-3.5 w-3.5" /> Marketplace + Bidding
              </span>
              <h3 className="mt-5 text-[23px] font-bold leading-tight sm:text-[28px] md:text-[34px]">
                List once and get buyers
                <br />
                <span className="text-gradient">or accept custom offers.</span>
              </h3>
              <p className="mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-[#B9B1A2] lg:mx-0">
                Publish your services or digital products on the marketplace. Buyers can either pay the listed price directly or send you a bid. You decide whether to accept or reject the offer. Every sale still goes through protected escrow.
              </p>
              <ul className="mx-auto mt-5 max-w-md space-y-2 text-left text-[13px] text-[#928B7D] lg:mx-0">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
                  <span>Create reusable listings</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
                  <span>Buyers can buy instantly or send a custom bid</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
                  <span>You control which offers to accept</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
                  <span>Same secure escrow flow for every order</span>
                </li>
              </ul>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link to="/marketplace" className="btn-gold w-full justify-center sm:w-auto">
                  <Store className="h-[18px] w-[18px]" />
                  Explore the marketplace
                </Link>
                <a
                  href={`${APP_URL}/listings/new`}
                  className="btn-glass w-full justify-center sm:w-auto"
                >
                  Create a listing <ArrowRight className="h-[18px] w-[18px]" />
                </a>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { t: "Notion template: Finance OS", p: "15 USDT", tag: "Buy now", note: "Listed price, instant purchase" },
                { t: "Brand sprint: 1h session", p: "95 NIM", tag: "Offer accepted", note: "Buyer bid 95 NIM, seller accepted" },
                { t: "Discord access: Pro tier", p: "10 USDT", tag: "Bid pending", note: "Buyer offered 8 USDT, awaiting reply" },
              ].map((l, i) => (
                <div
                  key={l.t}
                  className="glass-soft flex items-center justify-between rounded-2xl px-4 py-3.5"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{l.t}</p>
                    <p className="text-[11.5px] text-[#928B7D]">{l.tag} · {l.note}</p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-pill bg-gold/15 px-3 py-1 text-[12.5px] font-bold text-gold">
                    {l.p}
                  </span>
                </div>
              ))}
            </div>
          </div>
          </GlowCard>
        </div>
      </div>
    </section>
  );
}
