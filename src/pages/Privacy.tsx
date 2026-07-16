import { useState } from "react";
import { useParallax, useReveal, Nav, Footer } from "@/pages/landing/shared";

const EFFECTIVE = "20 June 2026";

export default function Privacy() {
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
            Privacy Policy
          </h1>
          <p className="mt-3 text-[14px] text-[#928B7D]">
            Effective date: {EFFECTIVE} &nbsp;·&nbsp; Last updated: {EFFECTIVE}
          </p>
        </div>

        <div className="reveal space-y-10 text-[15px] leading-relaxed text-[#C8C0B2]">

          <Section title="1. Introduction">
            <p>
              XcrowHub ("we", "us", "our") operates xcrowhub.com and app.xcrowhub.com. This
              Privacy Policy explains what information we collect, how we use it, who we share it
              with, and your rights regarding it.
            </p>
            <p>
              We are built on a privacy-first principle: we do not require you to create an account,
              verify your identity, or share personal documents. You interact with XcrowHub using
              only your crypto wallet.
            </p>
          </Section>

          <Section title="2. Information We Collect">

            <SubSection title="2.1 Information You Provide">
              <ul>
                <li>
                  <strong className="text-[#EDE7DA]">Wallet address:</strong> Your Nimiq (NIM)
                  or Ethereum-compatible (EVM) wallet address is used to authenticate you and
                  associate deals with your account. This is a public blockchain identifier, not
                  a personal identifier in itself.
                </li>
                <li>
                  <strong className="text-[#EDE7DA]">Deal data:</strong> Title, description,
                  amount, currency, and status of deals you create or participate in.
                </li>
                <li>
                  <strong className="text-[#EDE7DA]">Listing data:</strong> Titles, descriptions,
                  prices, and category of marketplace listings you publish.
                </li>
                <li>
                  <strong className="text-[#EDE7DA]">Dispute evidence:</strong> Files, screenshots,
                  and written statements you submit during a dispute resolution process.
                </li>
                <li>
                  <strong className="text-[#EDE7DA]">Support messages:</strong> Content of support
                  tickets you submit.
                </li>
              </ul>
            </SubSection>

            <SubSection title="2.2 Information Collected Automatically">
              <ul>
                <li>
                  <strong className="text-[#EDE7DA]">Session data:</strong> A cryptographically
                  signed JWT token derived from your wallet signature. This token expires and
                  contains no sensitive personal data beyond your wallet address.
                </li>
                <li>
                  <strong className="text-[#EDE7DA]">Usage data:</strong> Standard server logs
                  may include IP addresses, browser type, and pages visited. These are retained
                  for a maximum of 30 days for security purposes.
                </li>
              </ul>
            </SubSection>

            <SubSection title="2.3 What We Do NOT Collect">
              <ul>
                <li>Your real name, date of birth, or government-issued ID.</li>
                <li>Email address (unless you voluntarily provide one for support).</li>
                <li>Phone number.</li>
                <li>Payment card or bank account details.</li>
                <li>Location data beyond general region inferred from IP.</li>
                <li>
                  Biometric data of any kind.
                </li>
              </ul>
            </SubSection>

          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect solely to:</p>
            <ul>
              <li>Authenticate your wallet and maintain your session.</li>
              <li>Create, track, and manage escrow deals you are party to.</li>
              <li>Display and manage marketplace listings you publish.</li>
              <li>Facilitate dispute review when escalated.</li>
              <li>Respond to support requests.</li>
              <li>Detect and prevent fraud, abuse, and prohibited activity.</li>
              <li>Comply with applicable legal obligations.</li>
            </ul>
            <p>
              We do not use your data for advertising, profiling, or sale to third parties.
            </p>
          </Section>

          <Section title="4. Legal Basis for Processing (GDPR)">
            <p>
              If you are located in the European Economic Area (EEA), we process your data under
              the following lawful bases:
            </p>
            <ul>
              <li>
                <strong className="text-[#EDE7DA]">Contract performance:</strong> Processing
                necessary to provide the escrow service you requested.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Legitimate interests:</strong> Fraud prevention,
                platform security, and abuse detection.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Legal obligation:</strong> Compliance with
                applicable laws, including reporting obligations for prohibited content.
              </li>
            </ul>
          </Section>

          <Section title="5. Data Storage and Third Parties">

            <SubSection title="5.1 Supabase">
              <p>
                Deal data, listing data, dispute evidence, and session tokens are stored in
                Supabase (supabase.com), a managed database platform. Supabase stores data in
                secure, encrypted databases. Their privacy policy is available at
                supabase.com/privacy.
              </p>
            </SubSection>

            <SubSection title="5.2 Nimiq Pay">
              <p>
                XcrowHub is a mini app running inside the Nimiq Pay wallet. Transaction signing
                and NIM payments are handled by Nimiq Pay. We do not have access to your private
                keys. Nimiq's privacy policy governs their data practices.
              </p>
            </SubSection>

            <SubSection title="5.3 Polygon / EVM">
              <p>
                USDT payments are settled on the Polygon network. On-chain transaction data is
                public and permanent by nature of the blockchain. We do not control or have
                special access to this data.
              </p>
            </SubSection>

            <SubSection title="5.4 Vercel">
              <p>
                Our web application is hosted on Vercel (vercel.com). Vercel may process
                standard request metadata (IP, user agent) for CDN and security purposes.
              </p>
            </SubSection>

            <p>
              We do not sell, rent, or trade your personal data to any third party for marketing
              or commercial purposes.
            </p>

          </Section>

          <Section title="6. Blockchain Data">
            <p>
              Transactions you make on the Nimiq or Polygon blockchain are permanently recorded
              on a public ledger. This is inherent to how blockchains work and is outside
              XcrowHub's control. Your on-chain wallet address and transaction amounts are
              publicly visible to anyone.
            </p>
            <p>
              XcrowHub does not link your blockchain address to any off-chain identity unless
              you voluntarily provide such information (e.g., in a listing description or
              support ticket).
            </p>
          </Section>

          <Section title="7. Data Retention">
            <ul>
              <li>
                <strong className="text-[#EDE7DA]">Active deal data:</strong> Retained for the
                lifetime of the deal plus 90 days after closure, to support dispute appeals.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Completed deal data:</strong> Retained for
                up to 2 years for fraud prevention and legal compliance, then deleted or
                anonymised.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Server logs:</strong> Deleted after 30 days.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Dispute evidence:</strong> Retained for 1
                year after dispute resolution, then deleted.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Listing data:</strong> Deleted upon listing
                removal by the seller, or within 30 days of account inactivity exceeding 2 years.
              </li>
            </ul>
          </Section>

          <Section title="8. Your Rights">
            <p>
              Depending on your location, you may have the following rights regarding your data:
            </p>
            <ul>
              <li>
                <strong className="text-[#EDE7DA]">Access:</strong> Request a copy of data we
                hold about your wallet address.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Correction:</strong> Request correction of
                inaccurate data.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Deletion:</strong> Request deletion of your
                data, subject to legal retention obligations.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Portability:</strong> Request your deal data
                in a machine-readable format.
              </li>
              <li>
                <strong className="text-[#EDE7DA]">Objection:</strong> Object to processing based
                on legitimate interests.
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:official@xcrowhub.com" className="text-gold hover:underline">
                official@xcrowhub.com
              </a>{" "}
              with the subject line "Privacy Request" and include your wallet address so we can
              locate your records. We will respond within 30 days.
            </p>
          </Section>

          <Section title="9. Security">
            <p>
              We implement industry-standard security measures including:
            </p>
            <ul>
              <li>TLS encryption for all data in transit.</li>
              <li>Wallet-signature authentication. No passwords to steal.</li>
              <li>Row-level security on the database. Users can only access their own deal data.</li>
              <li>Short-lived JWT tokens that expire automatically.</li>
            </ul>
            <p>
              No system is completely secure. If you believe your account has been compromised,
              contact us immediately at{" "}
              <a href="mailto:official@xcrowhub.com" className="text-gold hover:underline">
                official@xcrowhub.com
              </a>.
            </p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>
              XcrowHub is not directed to individuals under the age of 18. We do not knowingly
              collect data from minors. If you believe a minor has used our Service, contact us
              immediately and we will delete any associated data.
            </p>
          </Section>

          <Section title="11. International Transfers">
            <p>
              Your data may be processed in countries outside your own, including the United
              States, where our infrastructure providers operate. We ensure appropriate safeguards
              are in place as required by applicable law, including standard contractual clauses
              where required.
            </p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy periodically. Material changes will be signalled
              by updating the effective date above and, where practical, by a notice on the
              platform. Continued use of the Service after changes constitutes acceptance of the
              updated Policy.
            </p>
          </Section>

          <Section title="13. Contact Us">
            <p>
              For privacy questions, data requests, or concerns, email us at{" "}
              <a href="mailto:official@xcrowhub.com" className="text-gold hover:underline">
                official@xcrowhub.com
              </a>
              .
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
