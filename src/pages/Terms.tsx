import { useState } from "react";
import { useParallax, useReveal, Nav, Footer } from "@/pages/landing/shared";

const EFFECTIVE = "20 June 2026";

export default function Terms() {
  useReveal();
  const scrollY = useParallax();
  const [scrolled, setScrolled] = useState(false);
  useState(() => { setScrolled(scrollY > 12); });

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />

      <div className="mx-auto max-w-[780px] px-5 pb-24 pt-36 sm:pt-44">
        <div className="reveal mb-10">
          <span className="lp-chip mb-4 inline-flex">Legal</span>
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            Terms of Service
          </h1>
          <p className="mt-3 text-[14px] text-[#928B7D]">
            Effective date: {EFFECTIVE} &nbsp;·&nbsp; Last updated: {EFFECTIVE}
          </p>
        </div>

        <div className="reveal prose-lp space-y-10 text-[15px] leading-relaxed text-[#C8C0B2]">

          <Section title="1. Agreement to Terms">
            <p>
              By accessing or using XcrowHub ("the Service", "we", "us", "our"), available at
              xcrowhub.com and app.xcrowhub.com, you agree to be bound by these Terms of Service.
              If you do not agree, do not use the Service.
            </p>
            <p>
              XcrowHub is a non-custodial escrow facilitation layer built on the Nimiq Pay
              infrastructure. We do not hold your funds, act as a financial institution, or
              provide investment advice.
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>You must meet all of the following to use XcrowHub:</p>
            <ul>
              <li>Be at least 18 years of age.</li>
              <li>Have the legal capacity to enter into binding contracts in your jurisdiction.</li>
              <li>
                Not be located in, or a national or resident of, any country subject to
                comprehensive sanctions by the UN, EU, US OFAC, or equivalent authority.
              </li>
              <li>Not be listed on any government prohibited-party or sanctions list.</li>
            </ul>
            <p>
              By using the Service, you represent and warrant that you satisfy all eligibility
              requirements above.
            </p>
          </Section>

          <Section title="3. Description of Service">
            <p>
              XcrowHub provides a peer-to-peer escrow facilitation service. When a deal is created:
            </p>
            <ul>
              <li>
                The buyer sends funds (NIM or USDT) to a custody address associated with the deal.
              </li>
              <li>The seller delivers the agreed goods or services.</li>
              <li>
                Funds are released to the seller upon the buyer's confirmation of satisfactory
                delivery, or following a proof-based dispute resolution process.
              </li>
            </ul>
            <p>
              XcrowHub does not guarantee delivery, quality, legality, or fitness for purpose of
              any goods or services exchanged through the platform. We facilitate the escrow
              mechanism only.
            </p>
          </Section>

          <Section title="4. Prohibited Items and Activities">
            <p>
              The following are strictly prohibited on XcrowHub. Deals or listings involving
              prohibited items will be terminated without notice and may be reported to relevant
              authorities.
            </p>

            <SubSection title="4.1 Illegal Goods and Controlled Substances">
              <ul>
                <li>Narcotics, controlled substances, or precursor chemicals of any kind.</li>
                <li>Prescription medications without a valid prescription.</li>
                <li>Firearms, ammunition, explosives, or components thereof, where prohibited by law.</li>
                <li>Stolen property, counterfeit goods, or goods infringing intellectual property rights.</li>
                <li>Wildlife, endangered species, or products derived from them.</li>
              </ul>
            </SubSection>

            <SubSection title="4.2 Harmful Digital Content">
              <ul>
                <li>
                  Any content that sexually exploits minors (CSAM). This is an absolute prohibition.
                  We will report all such activity to law enforcement without exception.
                </li>
                <li>Malware, ransomware, spyware, or any software designed to cause harm.</li>
                <li>
                  Hacking tools, exploit kits, credential stuffing lists, or any service designed
                  to gain unauthorised access to systems.
                </li>
                <li>Doxxing packages, stalkerware, or surveillance tools targeting individuals.</li>
                <li>Deepfakes or synthetic media created without subject consent for harmful purposes.</li>
              </ul>
            </SubSection>

            <SubSection title="4.3 Financial Crime">
              <ul>
                <li>Money laundering or layering of funds through the escrow mechanism.</li>
                <li>Fraud, scam services, or listings designed to deceive buyers.</li>
                <li>Phishing kits, fake invoice services, or impersonation tools.</li>
                <li>
                  Ponzi schemes, pump-and-dump coordination, or any market manipulation service.
                </li>
                <li>Sale of bank accounts, payment credentials, or identity documents.</li>
              </ul>
            </SubSection>

            <SubSection title="4.4 Sanctioned or Regulated Activities">
              <ul>
                <li>
                  Any transaction that would violate applicable export control laws, trade sanctions,
                  or embargoes.
                </li>
                <li>
                  Services that constitute unlicensed money transmission, securities brokerage, or
                  investment advice in the user's jurisdiction.
                </li>
                <li>Human trafficking, forced labour, or any form of exploitation.</li>
              </ul>
            </SubSection>

            <SubSection title="4.5 Platform Abuse">
              <ul>
                <li>Creating fake deals to manipulate dispute outcomes or reputation.</li>
                <li>Submitting fraudulent proof in a dispute.</li>
                <li>Automated scraping, denial-of-service attacks, or attempts to compromise platform infrastructure.</li>
                <li>Impersonating XcrowHub, its team, or any other user.</li>
              </ul>
            </SubSection>
          </Section>

          <Section title="5. Marketplace Listings">
            <p>
              Sellers who publish listings on the XcrowHub marketplace represent and warrant that:
            </p>
            <ul>
              <li>
                The listed item or service is legal in both the seller's and buyer's jurisdiction.
              </li>
              <li>The listing description is accurate and not misleading.</li>
              <li>
                They have the full right to sell the item (no infringement of third-party IP,
                licence, or contractual restriction).
              </li>
              <li>Digital goods delivered will be functional and as described.</li>
            </ul>
            <p>
              XcrowHub reserves the right to remove any listing at its sole discretion, without
              notice or liability.
            </p>
          </Section>

          <Section title="6. Fees">
            <p>
              <strong>Private deals:</strong> XcrowHub charges no platform fee. The buyer pays
              exactly the agreed deal amount and the seller receives exactly the agreed deal
              amount.
            </p>
            <p>
              <strong>Marketplace sales:</strong> A 1% platform fee is deducted from the seller's
              proceeds on a successful release — the seller keeps 99% of the listed amount. The
              buyer always pays exactly the listed price; the fee never applies to refunds or
              cancellations. Fee rates will not change without updating these Terms with at
              least 30 days' notice.
            </p>
            <p>
              Network transaction fees (gas, on-chain fees) are determined by the respective
              blockchain and are outside our control.
            </p>
          </Section>

          <Section title="7. Dispute Resolution">
            <p>
              If a buyer and seller cannot resolve a delivery dispute between themselves, either
              party may escalate the dispute to XcrowHub. Our review process:
            </p>
            <ul>
              <li>Both parties submit evidence (screenshots, files, communications).</li>
              <li>
                XcrowHub reviews the submitted proof and makes a non-binding recommendation
                within 5 business days.
              </li>
              <li>
                In cases where the smart-contract or custody mechanism permits, the outcome of the
                review may trigger fund release or refund.
              </li>
            </ul>
            <p>
              XcrowHub's dispute decision is final within the platform. It does not constitute
              legal arbitration and does not waive either party's right to pursue legal remedies.
              We are not liable for losses arising from our dispute decisions.
            </p>
          </Section>

          <Section title="8. Intellectual Property">
            <p>
              All content, code, design, trademarks, and logos on XcrowHub are the property of
              XcrowHub or its licensors. You may not copy, reproduce, or distribute any part of
              the Service without prior written permission.
            </p>
            <p>
              By submitting content to the platform (listing descriptions, proof files, etc.) you
              grant XcrowHub a non-exclusive, royalty-free licence to display and process that
              content solely for operating the Service.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>
              To the fullest extent permitted by law, XcrowHub, its founders, employees, and
              contractors shall not be liable for:
            </p>
            <ul>
              <li>Loss of funds due to user error, wallet compromise, or blockchain failure.</li>
              <li>Non-delivery or fraudulent delivery of goods or services by a counterparty.</li>
              <li>Indirect, consequential, incidental, or punitive damages of any kind.</li>
              <li>Service downtime, smart-contract bugs, or third-party infrastructure failures.</li>
            </ul>
            <p>
              Our total aggregate liability to you for any claim shall not exceed the amount of
              fees you have paid us in the 12 months preceding the claim (which, given our zero-fee
              model, is zero).
            </p>
          </Section>

          <Section title="10. Disclaimers">
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind,
              express or implied, including but not limited to merchantability, fitness for a
              particular purpose, and non-infringement.
            </p>
            <p>
              Cryptocurrency values are volatile. XcrowHub makes no representation regarding the
              value of NIM, USDT, or any other asset at any point in time.
            </p>
          </Section>

          <Section title="11. Termination">
            <p>
              We may suspend or terminate your access to the Service at any time, with or without
              notice, if we believe you have violated these Terms or applicable law. Upon
              termination, any open deals will be handled in accordance with their current on-chain
              state.
            </p>
          </Section>

          <Section title="12. Governing Law">
            <p>
              These Terms are governed by and construed in accordance with applicable international
              law. Any disputes arising out of or relating to these Terms shall first be attempted
              to be resolved through good-faith negotiation. If unresolved, disputes shall be
              submitted to binding arbitration under the rules of a mutually agreed arbitration
              institution.
            </p>
          </Section>

          <Section title="13. Changes to Terms">
            <p>
              We may update these Terms from time to time. Material changes will be notified via
              the platform or by updating the effective date above. Continued use of the Service
              after changes constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              For questions about these Terms, prohibited content reports, or legal notices,
              contact us at:{" "}
              <a href="mailto:official@xcrowhub.com" className="text-gold hover:underline">
                official@xcrowhub.com
              </a>
            </p>
          </Section>

        </div>
      </div>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="reveal space-y-4">
      <h2 className="text-[20px] font-bold text-[#EDE7DA] sm:text-[22px]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pl-4 border-l border-white/10">
      <h3 className="text-[15px] font-semibold text-[#EDE7DA]">{title}</h3>
      {children}
    </div>
  );
}
