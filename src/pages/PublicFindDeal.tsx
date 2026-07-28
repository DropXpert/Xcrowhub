import { useEffect, useState } from "react";
import { Link2, QrCode, Search, ShieldCheck } from "lucide-react";
import { Footer, Nav, FeatureIcon, useParallax, useReveal } from "@/pages/landing/shared";
import { dealStatusPath, extractDealId } from "@/lib/dealLinks";
import { nimiqPayDeeplink, openNimiqPayOrStore } from "@/lib/host";

export default function PublicFindDeal() {
  useReveal();
  const y = useParallax();
  const [scrolled, setScrolled] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setScrolled(y > 12), [y]);

  function openDeal(event: React.FormEvent) {
    event.preventDefault();
    const id = extractDealId(value);
    if (!id) {
      setError("Enter a valid XcrowHub deal ID or shared link.");
      return;
    }
    const target = nimiqPayDeeplink(dealStatusPath(id));
    openNimiqPayOrStore(target)(event);
  }

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />
      <section className="relative isolate overflow-hidden pb-14 pt-28 sm:pb-20 sm:pt-36 md:pb-24 md:pt-44">
        <div aria-hidden className="lp-grid absolute inset-0 -z-10" />
        <div className="mx-auto max-w-site px-5 text-center">
          <span className="lp-chip mx-auto reveal"><Search className="h-3.5 w-3.5" /> Find a deal</span>
          <h1 className="reveal mx-auto mt-5 max-w-3xl text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] md:text-[56px]">Open an existing <span className="text-gradient">XcrowHub deal.</span></h1>
          <p className="reveal mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[#B9B1A2] sm:text-[17px]">Paste the deal ID or shared link. XcrowHub will open the protected deal inside Nimiq Pay.</p>

          <form onSubmit={openDeal} className="reveal mx-auto mt-8 max-w-xl glass rounded-2xl p-4 text-left sm:p-5">
            <label htmlFor="public-deal-id" className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#B9B1A2]">Deal ID or link</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input id="public-deal-id" value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} maxLength={160} placeholder="PH-XXXX-XXXX" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-[15px] text-[#EDE7DA] outline-none placeholder:text-[#6F695C] focus:border-jade" />
              <button type="submit" className="btn-gold shrink-0 justify-center"><Search className="h-4 w-4" /> Open deal</button>
            </div>
            {error ? <p role="alert" className="mt-2 text-[13px] text-[#E08B88]">{error}</p> : null}
          </form>
        </div>
      </section>

      <section className="pb-24 sm:pb-28">
        <div className="mx-auto grid max-w-site gap-4 px-5 md:grid-cols-3">
          {[
            { icon: Link2, title: "Paste the shared link", body: "Private deal links contain the deal ID and open the correct protected order." },
            { icon: Search, title: "Enter the deal ID", body: "Use the identifier shown on the deal receipt, payment request or status screen." },
            { icon: QrCode, title: "Scan inside the app", body: "Open XcrowHub in Nimiq Pay to scan a deal QR code with your camera." },
          ].map(({ icon, title, body }, index) => (
            <article key={title} className="reveal glass rounded-2xl p-6" style={{ transitionDelay: `${index * 80}ms` }}>
              <FeatureIcon icon={icon} accent={index === 2 ? "gold" : "jade"} />
              <h2 className="mt-5 text-[18px] font-bold">{title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[#B9B1A2]">{body}</p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 flex max-w-xl items-center justify-center gap-2 px-5 text-center text-[13px] text-[#928B7D]"><ShieldCheck className="h-4 w-4 text-jade" /> Check the domain and deal terms before making a payment.</p>
      </section>
      <Footer />
    </div>
  );
}
