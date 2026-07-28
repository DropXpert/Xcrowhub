import { useEffect, useState } from "react";
import { Check, FileCheck2, Lock, Scale, ShieldCheck, Wallet } from "lucide-react";
import { Footer, Nav, SectionHeading, FeatureIcon, useParallax, useReveal } from "@/pages/landing/shared";

const STEPS = [
  { icon: FileCheck2, title: "Create the deal", body: "Set the title, price in NIM or USDT, delivery terms and confirmation window. Keep it private or publish a marketplace listing." },
  { icon: Wallet, title: "Buyer funds escrow", body: "The buyer pays the agreed amount into a protected hold. The seller can verify that payment is secured before starting work." },
  { icon: ShieldCheck, title: "Seller delivers", body: "The seller completes the order and marks it delivered. Files, messages or transaction details can be kept as proof." },
  { icon: Check, title: "Confirm and release", body: "The buyer confirms delivery and the funds are released to the seller. A disputed deal pauses for evidence review." },
];

export default function PublicHowItWorks() {
  useReveal();
  const y = useParallax();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setScrolled(y > 12), [y]);

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />
      <section className="relative isolate overflow-hidden pb-14 pt-28 sm:pb-20 sm:pt-36 md:pb-24 md:pt-44">
        <div aria-hidden className="lp-grid absolute inset-0 -z-10" />
        <div aria-hidden className="lp-aurora animate-aurora absolute -left-40 -top-40 -z-10 h-[38rem] w-[38rem]" style={{ background: "radial-gradient(circle, rgba(79,209,165,0.3), transparent 60%)" }} />
        <div className="mx-auto max-w-site px-5 text-center">
          <span className="lp-chip mx-auto reveal"><Lock className="h-3.5 w-3.5" /> Protected flow</span>
          <h1 className="reveal mx-auto mt-5 max-w-3xl text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] md:text-[58px]">How XcrowHub <span className="text-gradient">escrow works.</span></h1>
          <p className="reveal mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[#B9B1A2] sm:text-[17px]">The same protected process powers private deals, marketplace buy-now orders and accepted bids.</p>
        </div>
      </section>

      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-site px-5">
          <div className="grid gap-4 md:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <article key={title} className="reveal glass relative overflow-hidden rounded-2xl p-6 sm:p-8" style={{ transitionDelay: `${index * 70}ms` }}>
                <span className="absolute right-5 top-3 text-[52px] font-black text-white/[0.04]">{String(index + 1).padStart(2, "0")}</span>
                <FeatureIcon icon={Icon} accent={index % 2 ? "gold" : "jade"} />
                <h2 className="mt-5 text-[19px] font-bold">{title}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 sm:py-24">
        <div className="mx-auto max-w-site px-5">
          <SectionHeading chip="If something goes wrong" title="Proof-based dispute resolution" sub="Either party can raise a dispute. Both sides submit evidence, then a human reviewer decides whether to release, refund or split the protected funds." />
          <div className="reveal mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
            {[
              [Scale, "Deal pauses", "No automatic payout happens while a dispute is active."],
              [FileCheck2, "Both submit proof", "Each side gets a fair opportunity to provide evidence."],
              [ShieldCheck, "Human decision", "The outcome follows the deal terms and submitted proof."],
            ].map(([Icon, title, body]) => (
              <div key={String(title)} className="glass rounded-2xl p-5">
                <Icon className="h-5 w-5 text-gold" />
                <h3 className="mt-4 text-[15px] font-bold">{String(title)}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#B9B1A2]">{String(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
