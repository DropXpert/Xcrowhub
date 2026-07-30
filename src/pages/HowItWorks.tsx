import { Link } from "react-router-dom";
import {
  FilePlus2,
  CheckCircle2,
  Scale,
  Lock,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { HowItWorksCarousel } from "@/components/HowItWorksCarousel";

const GUARANTEES = [
  {
    icon: <Lock className="h-4 w-4" />,
    title: "The rail is always visible",
    body: "NIM uses XcrowHub managed custody. USDT uses the rail shown on the deal; smart-contract deals lock funds on Polygon.",
  },
  {
    icon: <CheckCircle2 className="h-4 w-4" />,
    title: "Released only on confirm",
    body: "The buyer confirms delivery. NIM then uses the managed signer; USDT calls the escrow contract directly.",
  },
  {
    icon: <Scale className="h-4 w-4" />,
    title: "Disputes need proof",
    body: "Both sides submit evidence. For disputed USDT, XcrowHub and one participant must sign the same release, refund, or split.",
  },
];

export default function HowItWorks() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Guide"
        title="How escrow works"
        back="/"
      />

      <p className="text-[14px] leading-relaxed text-muted">
        XcrowHub protects the buyer's payment until the deal is done. NIM uses
        managed custody; USDT deals show whether managed custody or the Polygon
        smart contract applies.
      </p>

      {/* Step-by-step carousel */}
      <HowItWorksCarousel />

      {/* Why it's safe */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink">Why it's safe</h2>
        <ul className="space-y-2">
          {GUARANTEES.map((g) => (
            <li
              key={g.title}
              className="card flex items-start gap-3 px-4 py-3.5"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                {g.icon}
              </span>
              <div className="space-y-0.5">
                <p className="text-[14px] font-semibold text-ink">{g.title}</p>
                <p className="text-[13px] leading-relaxed text-muted">
                  {g.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <div className="grid grid-cols-2 gap-2">
        <Link to="/create/new" className="btn-primary w-full">
          <FilePlus2 className="h-4 w-4" />
          Create a deal
        </Link>
        <Link to="/listings" className="btn-secondary w-full">
          Browse services
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
