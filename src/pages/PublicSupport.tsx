import { useEffect, useState } from "react";
import { AlertTriangle, FileCheck2, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { Footer, Nav, FeatureIcon, useParallax, useReveal } from "@/pages/landing/shared";
import { nimiqPayDeeplink, openNimiqPayOrStore } from "@/lib/host";

const supportLink = nimiqPayDeeplink("/support");

export default function PublicSupport() {
  useReveal();
  const y = useParallax();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setScrolled(y > 12), [y]);

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />
      <section className="relative isolate overflow-hidden pb-16 pt-28 sm:pt-36 md:pb-24 md:pt-44">
        <div aria-hidden className="lp-grid absolute inset-0 -z-10" />
        <div className="mx-auto max-w-site px-5 text-center">
          <span className="lp-chip mx-auto reveal"><MessageCircle className="h-3.5 w-3.5" /> Support</span>
          <h1 className="reveal mx-auto mt-5 max-w-3xl text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] md:text-[56px]">Help with your <span className="text-gradient">protected deal.</span></h1>
          <p className="reveal mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[#B9B1A2] sm:text-[17px]">Open the in-app support area for account-specific help. Your wallet session lets the team securely connect a ticket to the correct deal.</p>
          <a href={supportLink} onClick={openNimiqPayOrStore(supportLink)} className="btn-gold reveal mt-8 w-full justify-center sm:w-auto"><MessageCircle className="h-[18px] w-[18px]" /> Open XcrowHub support</a>
        </div>
      </section>

      <section className="pb-20 sm:pb-28">
        <div className="mx-auto grid max-w-site gap-4 px-5 md:grid-cols-3">
          {[
            { icon: FileCheck2, title: "Deal or payment issue", body: "Include the deal ID, transaction hash, amount, currency and the exact status shown in XcrowHub." },
            { icon: ShieldCheck, title: "Dispute help", body: "Keep screenshots, delivery files, chat records and transaction evidence ready before the proof deadline." },
            { icon: Smartphone, title: "Technical issue", body: "Share your device, Nimiq Pay version, affected page and the action that caused the problem." },
          ].map(({ icon, title, body }, index) => (
            <article key={title} className="reveal glass rounded-2xl p-6" style={{ transitionDelay: `${index * 80}ms` }}>
              <FeatureIcon icon={icon} accent={index === 1 ? "gold" : "jade"} />
              <h2 className="mt-5 text-[18px] font-bold">{title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-2xl px-5">
          <div className="reveal rounded-2xl border border-gold/25 bg-gold/[0.06] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
              <div>
                <h2 className="text-[17px] font-bold">Do not share recovery words or private keys</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">XcrowHub support does not need your wallet recovery phrase. Never send it in a ticket, message or screenshot.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
