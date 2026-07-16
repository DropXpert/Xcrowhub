import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ShieldCheck,
  Rocket,
  Link2,
  Store,
  GitBranch,
  Wallet,
  Scale,
  BadgeDollarSign,
  Gift,
  Fingerprint,
  HelpCircle,
  Check,
  ChevronRight,
  Info,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Lock,
  Coins,
  Bell,
  Send,
  FileCheck2,
} from "lucide-react";

import { Nav, Footer, useReveal, useParallax, deeplink } from "@/pages/landing/shared";

/* ───────────────────────────────────────────────────────────────────────────
   Docs: the public, browser-facing documentation page (xcrowhub.com/docs).

   Standalone like the rest of the marketing surface — no app stores, wallet, or
   router guards. Reuses the landing design system so it feels native.
─────────────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "concepts", label: "Core concepts", icon: ShieldCheck },
  { id: "getting-started", label: "Getting started", icon: Rocket },
  { id: "private-deals", label: "Private deals", icon: Link2 },
  { id: "marketplace", label: "Marketplace & bidding", icon: Store },
  { id: "lifecycle", label: "Deal lifecycle", icon: GitBranch },
  { id: "payments", label: "Payments & verification", icon: Wallet },
  { id: "disputes", label: "Disputes & proof", icon: Scale },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "fees", label: "Fees", icon: BadgeDollarSign },
  { id: "referrals", label: "Referrals", icon: Gift },
  { id: "security", label: "Security model", icon: Fingerprint },
  { id: "faq", label: "FAQ", icon: HelpCircle },
] as const;

const SECTION_IDS = SECTIONS.map((s) => s.id);

export default function Docs() {
  useReveal();
  const scrollY = useParallax();
  const [scrolled, setScrolled] = useState(false);
  const active = useScrollSpy(SECTION_IDS);

  useEffect(() => {
    setScrolled(scrollY > 12);
  }, [scrollY]);

  return (
    <div className="lp relative min-h-screen overflow-x-clip">
      <Nav scrolled={scrolled} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden pt-28 pb-8 sm:pt-36 sm:pb-12">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div
            className="lp-aurora animate-aurora h-[34rem] w-[34rem] -left-40 -top-44"
            style={{ background: "radial-gradient(circle, rgba(79,209,165,0.30), transparent 60%)" }}
          />
          <div
            className="lp-aurora animate-aurora h-[30rem] w-[30rem] right-[-10rem] -top-20"
            style={{ background: "radial-gradient(circle, rgba(232,185,100,0.26), transparent 60%)", animationDelay: "-7s" }}
          />
        </div>
        <div aria-hidden className="lp-grid absolute inset-0 -z-10 opacity-70" />

        <div className="mx-auto max-w-[1100px] px-5">
          <div className="reveal max-w-2xl">
            <span className="lp-chip">Documentation</span>
            <h1 className="mt-5 text-[34px] font-extrabold leading-[1.08] tracking-tight sm:text-[48px]">
              How <span className="text-gradient">XcrowHub</span> works
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#B9B1A2] sm:text-[16px]">
              A complete guide to protected peer-to-peer crypto deals — escrow, the marketplace,
              the deal lifecycle, on-chain verification, disputes, fees, and referrals. Everything
              you need to deal safely on Nimiq Pay.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={deeplink} className="btn-gold w-full justify-center sm:w-auto">
                <Wallet className="h-[18px] w-[18px]" />
                Launch app
              </a>
              <Link to="/marketplace" className="btn-glass w-full justify-center sm:w-auto">
                <Store className="h-[18px] w-[18px]" />
                Browse marketplace
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Body: sticky sidebar + content */}
      <div className="mx-auto grid max-w-[1100px] gap-10 px-5 pb-24 pt-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14">
        <Sidebar active={active} />

        <main className="min-w-0 space-y-16 sm:space-y-20">
          <DocSection id="overview" icon={BookOpen} chip="Start here" title="What is XcrowHub?">
            <Lede>
              XcrowHub is a <strong className="text-[#EDE7DA] font-semibold">protected-payments layer</strong> for
              peer-to-peer crypto deals, running as a mini app inside Nimiq Pay. The buyer's money is locked
              in a protected hold and only released to the seller once delivery is confirmed — or resolved
              through a fair, proof-based dispute.
            </Lede>
            <P>There are two ways to deal, and both run through the same escrow protection:</P>
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniCard icon={Link2} title="Private deals" accent="jade">
                Create a deal with your own terms and share a private link with one buyer. Nobody else
                can see it. Best for freelance work, custom orders, and one-time transactions.
              </MiniCard>
              <MiniCard icon={Store} title="Marketplace" accent="gold">
                Publish a listing once. Buyers pay the listed price instantly or send you a custom offer
                to accept or reject. Every sale still goes through protected escrow.
              </MiniCard>
            </div>
            <Callout kind="info" title="Pays in NIM or USDT">
              Deals can be priced in <strong className="text-[#EDE7DA] font-semibold">NIM</strong> (Nimiq's
              native coin) or <strong className="text-[#EDE7DA] font-semibold">USDT</strong> on Polygon.
              You choose per deal.
            </Callout>
          </DocSection>

          <DocSection id="concepts" icon={ShieldCheck} chip="Core concepts" title="The ideas behind every deal">
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniCard icon={Lock} title="Protected hold (escrow)">
                Funds sit in a deal-specific custody address — never with the seller directly — until the
                buyer confirms delivery. Both sides can see the held amount at all times.
              </MiniCard>
              <MiniCard icon={ShieldCheck} title="On-chain verified">
                A deal only becomes <State>Funds held</State> after the payment is confirmed on-chain, for
                both NIM and USDT. A seller never delivers against a payment that didn't actually settle.
              </MiniCard>
              <MiniCard icon={Fingerprint} title="Wallet-signed">
                Your wallet address is your identity. Every action is authorized by a Nimiq Pay signature —
                there are no passwords and no signup forms.
              </MiniCard>
              <MiniCard icon={Scale} title="Proof-based disputes">
                If something goes wrong, outcomes are decided by evidence inside a fixed proof window —
                transparent and fair to both sides.
              </MiniCard>
            </div>
          </DocSection>

          <DocSection id="getting-started" icon={Rocket} chip="Getting started" title="Your first deal in three steps">
            <div className="space-y-6">
              <Step n={1} title="Open XcrowHub inside Nimiq Pay">
                XcrowHub runs as a mini app. Launch it from the button above, or from any
                {" "}<span className="text-[#EDE7DA]">Launch app</span> link — it opens directly inside your
                Nimiq Pay wallet.
              </Step>
              <Step n={2} title="Connect — no signup">
                Your wallet is your account. The first action you take asks for a signature to prove the
                address is yours. That's it: no email, no password.
              </Step>
              <Step n={3} title="Create a deal or browse listings">
                Start a private deal and share the link, or open the marketplace to buy, bid, or publish
                a listing of your own.
              </Step>
            </div>
            <Callout kind="tip" title="Buyer or seller — same flow">
              Whether you're paying into a hold or delivering against one, the steps and protections are
              identical. The deal page always shows you exactly what to do next.
            </Callout>
          </DocSection>

          <DocSection id="private-deals" icon={Link2} chip="Private deals" title="Direct deals over a shareable link">
            <P>
              Most deals on XcrowHub start here. You set the terms; only your buyer ever sees them.
            </P>
            <Bullets
              items={[
                <>Set the item, price (NIM or USDT), and delivery terms.</>,
                <>Get a private link and send it to exactly one buyer.</>,
                <>Only the two of you can access the deal — there's no public listing.</>,
                <>The buyer pays into a protected hold, not directly to you.</>,
                <><strong className="text-[#EDE7DA] font-semibold">Zero fees</strong> — you receive the full amount on release.</>,
              ]}
            />
            <Callout kind="info" title="Best for">
              Freelance work, custom orders, and one-time transactions where you already know who you're
              dealing with.
            </Callout>
          </DocSection>

          <DocSection id="marketplace" icon={Store} chip="Marketplace" title="List once, sell or take offers">
            <P>
              Publish your services or digital products and let buyers come to you. Every marketplace sale
              still settles through protected escrow.
            </P>
            <div className="space-y-6">
              <Step n={1} title="Publish a reusable listing">
                Describe the item, set a price, and post it. Your listing stays live for repeat buyers.
              </Step>
              <Step n={2} title="Buyers buy now — or bid">
                A buyer can pay the listed price instantly, or send you a <strong className="text-[#EDE7DA] font-semibold">custom offer</strong>.
              </Step>
              <Step n={3} title="You accept or reject offers">
                When you accept a bid, a protected deal is created automatically at the agreed amount.
              </Step>
              <Step n={4} title="Deliver through escrow">
                From there it's the standard lifecycle — funds are held until the buyer confirms.
              </Step>
            </div>
            <Callout kind="warn" title="Marketplace sales carry a 1% fee">
              Unlike private deals, marketplace sales include a small platform fee taken from the seller's
              side. See <a href="#fees" className="text-gold hover:underline">Fees</a> for the exact split.
            </Callout>
          </DocSection>

          <DocSection id="lifecycle" icon={GitBranch} chip="Lifecycle" title="The journey of a deal">
            <P>
              Every deal moves through a clear set of states. The happy path is four confirmations from
              payment to release. If a problem comes up, the deal branches into dispute resolution.
            </P>

            <FlowCard title="Happy path" tone="jade">
              <Flow
                steps={[
                  { label: "Awaiting payment", tone: "muted" },
                  { label: "Funds held", tone: "jade" },
                  { label: "Delivered", tone: "jade" },
                  { label: "Received", tone: "jade" },
                  { label: "Released", tone: "gold" },
                ]}
              />
            </FlowCard>

            <FlowCard title="If a dispute is raised" tone="warn">
              <Flow
                steps={[
                  { label: "Query opened", tone: "warn" },
                  { label: "24h proof window", tone: "warn" },
                  { label: "Admin review", tone: "muted" },
                  { label: "Refund / Partial / Release", tone: "gold" },
                ]}
              />
            </FlowCard>

            <Callout kind="info" title="States are honest">
              The state you see is the real on-chain reality of the deal — payment isn't marked
              {" "}<State>Funds held</State> until it's verified, and release/refund only show once the
              payout has been broadcast.
            </Callout>
          </DocSection>

          <DocSection id="payments" icon={Wallet} chip="Payments" title="Payments & on-chain verification">
            <P>
              XcrowHub supports <strong className="text-[#EDE7DA] font-semibold">NIM</strong> and{" "}
              <strong className="text-[#EDE7DA] font-semibold">USDT (Polygon)</strong>. Here's exactly how
              money moves:
            </P>
            <div className="space-y-6">
              <Step n={1} title="Buyer pays into the hold">
                The buyer sends the deal amount to the custody address tied to that specific deal.
              </Step>
              <Step n={2} title="The payment is verified on-chain">
                Before the deal flips to <State>Funds held</State>, the server checks the transaction on
                the blockchain — confirming the correct recipient and exact amount. A dropped or short
                payment never marks the deal as paid.
              </Step>
              <Step n={3} title="Funds are released from custody">
                On confirmation (or a dispute outcome), the payout is signed and broadcast — to the seller
                on release, or back to the buyer on refund.
              </Step>
            </div>
            <Callout kind="tip" title="Why verification matters">
              This is what lets a seller safely start work: the <State>Funds held</State> badge is backed
              by a real, settled on-chain payment — not just a click.
            </Callout>
          </DocSection>

          <DocSection id="disputes" icon={Scale} chip="Disputes" title="What happens if something goes wrong">
            <P>
              If a buyer and seller can't resolve a delivery problem between themselves, either side can
              raise a query. A <strong className="text-[#EDE7DA] font-semibold">proof window</strong> opens
              where both can submit evidence — then a real person reviews it.
            </P>
            <div className="grid gap-4 sm:grid-cols-3">
              <OutcomeCard icon={FileCheck2} tone="jade" title="Raise a query">
                A proof window opens and both sides are alerted to respond.
              </OutcomeCard>
              <OutcomeCard icon={Scale} tone="gold" title="Add your evidence">
                Screenshots, files, transaction hashes — whatever backs your side.
              </OutcomeCard>
              <OutcomeCard icon={ShieldCheck} tone="warn" title="An admin decides">
                A human reviews and resolves it: release, refund, or a fair split.
              </OutcomeCard>
            </div>
            <Callout kind="tip" title="No one wins by default">
              A dispute is never auto-decided by the other side staying silent. Every contested deal is
              settled by a person on the evidence — so a missed notification can't cost you the deal.
            </Callout>
          </DocSection>

          <DocSection id="notifications" icon={Bell} chip="Notifications" title="Never miss a deal">
            <P>
              XcrowHub keeps you in the loop two ways — in the app, and on Telegram so you hear about
              things the moment they happen, even when the app is closed.
            </P>
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniCard icon={Bell} title="In-app bell">
                Every deal, offer, message and dispute lands in your notification bell and stays there
                until you read it.
              </MiniCard>
              <MiniCard icon={Send} title="Telegram alerts" accent="jade">
                Link your account once and get an instant Telegram message when something needs you —
                real push, even on Android where the wallet can't notify you.
              </MiniCard>
            </div>
            <P>You'll be notified about:</P>
            <Bullets
              items={[
                <>Payments into a deal, delivery, release and refunds.</>,
                <>New offers — and when one is accepted, countered or declined.</>,
                <>New messages on a deal.</>,
                <>Disputes — opened, proof submitted, and the final decision.</>,
              ]}
            />
            <Callout kind="info" title="Turn on Telegram">
              Open <strong className="text-[#EDE7DA] font-semibold">Profile → Connect Telegram</strong> and
              tap through to the bot. It's opt-in — unlink anytime by sending <strong className="text-[#EDE7DA] font-semibold">/stop</strong>.
            </Callout>
          </DocSection>

          <DocSection id="fees" icon={BadgeDollarSign} chip="Fees" title="Simple, honest pricing">
            <div className="grid gap-4 sm:grid-cols-2">
              <PriceCard tone="jade" big="0%" label="Private deals" sub="No platform fee. The seller receives the full agreed amount." />
              <PriceCard tone="gold" big="1%" label="Marketplace sales" sub="A 1% fee is taken from the seller's proceeds on a successful release — the seller keeps 99%." />
            </div>
            <Bullets
              items={[
                <>The fee applies only to <strong className="text-[#EDE7DA] font-semibold">successful</strong> marketplace sales — never to private deals, refunds, or cancellations.</>,
                <>It comes out of the seller's side; the buyer always pays exactly the listed amount.</>,
                <>Network / gas fees are set by the blockchain and are separate from XcrowHub.</>,
              ]}
            />
          </DocSection>

          <DocSection id="referrals" icon={Gift} chip="Referrals" title="Refer & earn">
            <P>
              Invite people to XcrowHub and earn a share of the platform fee on their marketplace sales —
              automatically.
            </P>
            <div className="space-y-6">
              <Step n={1} title="Share your link">
                Every account gets a short referral code and a link that opens the app.
              </Step>
              <Step n={2} title="They join through it">
                When someone signs up via your link, they're attributed to you on first touch.
              </Step>
              <Step n={3} title="You earn 10% of the fee">
                On their marketplace sales you earn <strong className="text-[#EDE7DA] font-semibold">10% of the 1% platform fee</strong>,
                accruing to a claimable balance.
              </Step>
              <Step n={4} title="Claim to your wallet">
                Cash out your balance to your Nimiq Pay wallet whenever you like.
              </Step>
            </div>
            <Callout kind="info" title="At a glance">
              <span className="inline-flex flex-wrap items-center gap-2">
                <Pill icon={Coins}>10% of the platform fee</Pill>
                <Pill icon={Gift}>Short referral code</Pill>
                <Pill icon={Wallet}>Claimable balance</Pill>
              </span>
            </Callout>
          </DocSection>

          <DocSection id="security" icon={Fingerprint} chip="Security" title="How your deal stays safe">
            <Bullets
              items={[
                <><strong className="text-[#EDE7DA] font-semibold">Wallet-signature auth.</strong> No passwords. Every sensitive action is signed by your wallet.</>,
                <><strong className="text-[#EDE7DA] font-semibold">On-chain verified payments.</strong> A deal is marked held only after the chain confirms the funds arrived.</>,
                <><strong className="text-[#EDE7DA] font-semibold">Custody keys stay server-side.</strong> Signing keys never touch your browser or the app bundle.</>,
                <><strong className="text-[#EDE7DA] font-semibold">Transparent disputes.</strong> Outcomes are driven by submitted proof inside a fixed window.</>,
              ]}
            />
          </DocSection>

          <DocSection id="faq" icon={HelpCircle} chip="FAQ" title="Common questions">
            <div className="space-y-3">
              <Faq q="Does XcrowHub hold my money?">
                Funds sit in a deal-specific custody hold during a deal and are released to the seller once
                you confirm delivery — or returned/split through a dispute. They never go straight to the seller.
              </Faq>
              <Faq q="What if the seller never delivers?">
                Raise a query. A 24-hour proof window opens; if the seller can't show delivery and you can,
                the deal resolves in your favour, up to a full refund.
              </Faq>
              <Faq q="Which currencies can I use?">
                NIM (Nimiq's native coin) and USDT on Polygon. You pick the currency when the deal is created.
              </Faq>
              <Faq q="Is there a fee?">
                Private deals are free. Marketplace sales carry a 1% fee on the seller's side (the seller keeps 99%).
              </Faq>
              <Faq q="Where does XcrowHub run?">
                As a mini app inside Nimiq Pay. The marketing site lives at xcrowhub.com; the app opens in your wallet.
              </Faq>
            </div>

            <div className="reveal mt-10 overflow-hidden rounded-3xl">
              <div className="glass relative overflow-hidden rounded-3xl px-6 py-10 text-center sm:px-10 sm:py-12">
                <div aria-hidden className="lp-grid absolute inset-0 opacity-50" />
                <div className="relative">
                  <h3 className="text-[22px] font-extrabold tracking-tight sm:text-[28px]">
                    Ready to deal <span className="text-gradient">safely?</span>
                  </h3>
                  <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-[#B9B1A2]">
                    Open XcrowHub inside Nimiq Pay and start with a private deal or a marketplace listing.
                  </p>
                  <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <a href={deeplink} className="btn-gold w-full justify-center sm:w-auto">
                      <Wallet className="h-[18px] w-[18px]" />
                      Launch app
                    </a>
                    <Link to="/marketplace" className="btn-glass w-full justify-center sm:w-auto">
                      Browse marketplace <ArrowRight className="h-[18px] w-[18px]" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </DocSection>
        </main>
      </div>

      <Footer />
    </div>
  );
}

/* ── scroll-spy ───────────────────────────────────────────────────────────── */
function useScrollSpy(ids: readonly string[]): string {
  const [active, setActive] = useState<string>(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .forEach((e) => setActive(e.target.id));
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/* ── sidebar ──────────────────────────────────────────────────────────────── */
function Sidebar({ active }: { active: string }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28 space-y-1.5">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6F695C]">
          On this page
        </p>
        {SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition ${
                on
                  ? "bg-white/[0.05] font-semibold text-[#EDE7DA] ring-1 ring-white/10"
                  : "text-[#928B7D] hover:text-[#EDE7DA]"
              }`}
            >
              <s.icon className={`h-4 w-4 shrink-0 ${on ? "text-gold" : "text-[#5C5648] group-hover:text-[#928B7D]"}`} />
              {s.label}
            </a>
          );
        })}
      </div>
    </aside>
  );
}

/* ── section + content primitives ─────────────────────────────────────────── */
function DocSection({
  id,
  icon: Icon,
  chip,
  title,
  children,
}: {
  id: string;
  icon: typeof BookOpen;
  chip: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="reveal scroll-mt-28">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-gold-soft/25 to-gold/10 text-gold ring-1 ring-white/10">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="lp-chip">{chip}</span>
      </div>
      <h2 className="mt-4 text-[24px] font-extrabold tracking-tight text-[#EDE7DA] sm:text-[30px]">
        {title}
      </h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="text-[16px] leading-relaxed text-[#C8C0B2] sm:text-[17px]">{children}</p>;
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[14.5px] leading-relaxed text-[#C8C0B2] ${className}`}>{children}</p>;
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-[#B9B1A2]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-jade" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-soft to-gold text-[13px] font-bold text-night">
        {n}
      </span>
      <div className="space-y-1 pt-0.5">
        <p className="text-[15px] font-bold text-[#EDE7DA]">{title}</p>
        <p className="text-[14px] leading-relaxed text-[#B9B1A2]">{children}</p>
      </div>
    </div>
  );
}

const ACCENT = {
  gold: "from-gold-soft/25 to-gold/10 text-gold",
  jade: "from-jade/25 to-jade/10 text-jade",
} as const;

function MiniCard({
  icon: Icon,
  title,
  accent = "gold",
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  accent?: keyof typeof ACCENT;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-soft rounded-2xl p-5">
      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/10 ${ACCENT[accent]}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <h3 className="mt-4 text-[15.5px] font-bold text-[#EDE7DA]">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#B9B1A2]">{children}</p>
    </div>
  );
}

/* Inline state token, e.g. “Funds held”. */
function State({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1.5 rounded-pill bg-jade/12 px-2 py-0.5 align-middle text-[12.5px] font-semibold text-jade ring-1 ring-jade/20">
      <span className="h-1.5 w-1.5 rounded-full bg-jade" />
      {children}
    </span>
  );
}

function Pill({ icon: Icon, children }: { icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-semibold text-[#EDE7DA] ring-1 ring-white/10">
      <Icon className="h-3.5 w-3.5 text-gold" />
      {children}
    </span>
  );
}

/* ── callouts ─────────────────────────────────────────────────────────────── */
const CALLOUT = {
  info: { icon: Info, text: "text-jade", ring: "ring-jade/25", bg: "bg-jade/[0.06]" },
  tip: { icon: Lightbulb, text: "text-gold", ring: "ring-gold/25", bg: "bg-gold/[0.06]" },
  warn: { icon: AlertTriangle, text: "text-[#E5B567]", ring: "ring-[#E5B567]/25", bg: "bg-[#E5B567]/[0.07]" },
} as const;

function Callout({
  kind = "info",
  title,
  children,
}: {
  kind?: keyof typeof CALLOUT;
  title?: string;
  children: React.ReactNode;
}) {
  const c = CALLOUT[kind];
  const Icon = c.icon;
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${c.bg} ${c.ring}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${c.text}`} />
      <div className="space-y-1">
        {title && <p className="text-[14px] font-semibold text-[#EDE7DA]">{title}</p>}
        <div className="text-[13.5px] leading-relaxed text-[#B9B1A2]">{children}</div>
      </div>
    </div>
  );
}

/* ── lifecycle flow ───────────────────────────────────────────────────────── */
const TONE_DOT = {
  muted: "bg-[#5C5648]",
  jade: "bg-jade",
  gold: "bg-gold",
  warn: "bg-[#E5B567]",
} as const;

function FlowCard({ title, tone, children }: { title: string; tone: keyof typeof TONE_DOT; children: React.ReactNode }) {
  return (
    <div className="glass-soft rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-[#928B7D]">
        <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Flow({ steps }: { steps: { label: string; tone: keyof typeof TONE_DOT }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-x-2">
          <span className="inline-flex items-center gap-2 rounded-pill bg-white/[0.04] px-3.5 py-2 text-[13px] font-semibold text-[#EDE7DA] ring-1 ring-white/10">
            <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[s.tone]}`} />
            {s.label}
          </span>
          {i < steps.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />}
        </div>
      ))}
    </div>
  );
}

/* ── dispute outcomes ─────────────────────────────────────────────────────── */
const OUTCOME = {
  jade: "from-jade/25 to-jade/10 text-jade",
  gold: "from-gold-soft/25 to-gold/10 text-gold",
  warn: "from-[#E5B567]/25 to-[#E5B567]/10 text-[#E5B567]",
} as const;

function OutcomeCard({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof BookOpen;
  tone: keyof typeof OUTCOME;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-soft h-full rounded-2xl p-5">
      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/10 ${OUTCOME[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <h3 className="mt-3.5 text-[14.5px] font-bold text-[#EDE7DA]">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#B9B1A2]">{children}</p>
    </div>
  );
}

/* ── pricing ──────────────────────────────────────────────────────────────── */
function PriceCard({ tone, big, label, sub }: { tone: "jade" | "gold"; big: string; label: string; sub: string }) {
  return (
    <div className="glass-soft rounded-2xl p-6">
      <div className="flex items-baseline gap-2">
        <span className={`text-[40px] font-extrabold leading-none ${tone === "jade" ? "text-jade" : "text-gold"}`}>{big}</span>
        <span className="text-[14px] font-bold text-[#EDE7DA]">{label}</span>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[#B9B1A2]">{sub}</p>
    </div>
  );
}

/* ── faq ──────────────────────────────────────────────────────────────────── */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="glass-soft rounded-2xl p-5">
      <p className="text-[15px] font-bold text-[#EDE7DA]">{q}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#B9B1A2]">{children}</p>
    </div>
  );
}
