import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { isNimiqPayHost } from "@/lib/host";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { useSupportStore } from "@/store/supportStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useThemeStore } from "@/store/themeStore";
import { BottomNav } from "@/components/BottomNav";
import { ConnectWelcomeModal } from "@/components/ConnectWelcomeModal";
import { OnboardingCoordinator } from "@/components/OnboardingCoordinator";
import { AdminGuard } from "@/components/AdminGuard";
import { AuthGuard } from "@/components/AuthGuard";
import { PageLoader } from "@/components/PageLoader";
import { OpenInNimiqPay } from "@/components/OpenInNimiqPay";
import { StarsBackground } from "@/components/StarsBackground";

const Landing = lazy(() => import("@/pages/Landing"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Docs = lazy(() => import("@/pages/Docs"));
const OpenInApp = lazy(() => import("@/pages/OpenInApp"));
const Home = lazy(() => import("@/pages/Home"));
const CreateDeal = lazy(() => import("@/pages/CreateDeal"));
const YourDeals = lazy(() => import("@/pages/YourDeals"));
const FindDeal = lazy(() => import("@/pages/FindDeal"));
const HowItWorks = lazy(() => import("@/pages/HowItWorks"));
const ScanDeal = lazy(() => import("@/pages/ScanDeal"));
const DealDetail = lazy(() => import("@/pages/DealDetail"));
const PayDeal = lazy(() => import("@/pages/PayDeal"));
const DealStatus = lazy(() => import("@/pages/DealStatus"));
const SellerDelivery = lazy(() => import("@/pages/SellerDelivery"));
const BuyerConfirm = lazy(() => import("@/pages/BuyerConfirm"));
const RaiseQuery = lazy(() => import("@/pages/RaiseQuery"));
const SubmitProof = lazy(() => import("@/pages/SubmitProof"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminReview = lazy(() => import("@/pages/AdminReview"));
const AdminSupport = lazy(() => import("@/pages/AdminSupport"));
const Profile = lazy(() => import("@/pages/Profile"));
const Referral = lazy(() => import("@/pages/Referral"));
const LeaveFeedback = lazy(() => import("@/pages/LeaveFeedback"));
const Support = lazy(() => import("@/pages/Support"));
const BugReport = lazy(() => import("@/pages/BugReport"));
const Listings = lazy(() => import("@/pages/Listings"));
const CreateListing = lazy(() => import("@/pages/CreateListing"));
const ListingDetail = lazy(() => import("@/pages/ListingDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// ─── Maintenance mode ────────────────────────────────────────────────────────
// Set to true to show the maintenance screen inside Nimiq Pay.
// Flip back to false when the app is ready to go live.
const MAINTENANCE = false;
// ─────────────────────────────────────────────────────────────────────────────

function RouteFallback() {
  return <PageLoader title="Opening" detail="Loading XcrowHub." />;
}

function PublicRouteFallback() {
  // Render nothing — the inline #splash in index.html is still on top and
  // stays visible until <SplashHider /> mounts inside the resolved route.
  // Rendering a second loader here caused a visible double-loader flash on
  // the landing page (green splash → dark wordmark loader → landing).
  return null;
}

function SplashHider() {
  useEffect(() => {
    (window as any).__hideSplash?.();
  }, []);
  return null;
}

function ComingSoon() {
  useEffect(() => {
    (window as any).__hideSplash?.();
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#F8F3EA", colorScheme: "only light",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: "20px", fontFamily: "system-ui, sans-serif",
      textAlign: "center", padding: "20px"
    }}>
      <img
        src="/logo-icon.png"
        alt="XcrowHub"
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: "#FFFDF8",
          boxShadow: "0 1px 0 rgba(23,20,17,0.04), 0 10px 28px -18px rgba(23,20,17,0.35)",
        }}
      />
      <div>
        <p style={{ color: "#2F6F5E", fontSize: 13, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>
          XcrowHub
        </p>
        <h1 style={{ color: "#171411", fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.5px" }}>
          Coming Soon
        </h1>
        <p style={{ color: "#71695F", fontSize: 15, maxWidth: 320, lineHeight: 1.6, margin: "0 auto 24px" }}>
          The app is under maintenance. The landing page is live at{" "}
          <a href="https://www.xcrowhub.com" style={{ color: "#2F6F5E" }}>xcrowhub.com</a>.
        </p>
      </div>
      <div style={{ width: 40, height: 3, borderRadius: 99, background: "#E4D8C7", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: "40%", background: "#2F6F5E", borderRadius: 99,
          animation: "sl 1.4s ease-in-out infinite"
        }} />
      </div>
      <style>{`@keyframes sl{0%{transform:translateX(-150%)}50%{transform:translateX(200%)}100%{transform:translateX(200%)}}`}</style>
    </div>
  );
}

function BrowserMiniAppGate() {
  useEffect(() => {
    (window as any).__hideSplash?.();
  }, []);

  return (
    <div className="min-h-full bg-bg">
      <OpenInNimiqPay />
    </div>
  );
}

function isAppSubdomain() {
  return typeof window !== "undefined" && window.location.hostname === "app.xcrowhub.com";
}

function initialHostState(): "checking" | "host" | "browser" {
  if (isNimiqPayHost()) return "host";
  if (!isAppSubdomain()) return "browser";
  return "checking";
}

function currentMiniAppPath() {
  if (typeof window === "undefined") return "";
  if (window.location.pathname === "/open") {
    const to = new URLSearchParams(window.location.search).get("to") ?? "";
    return to.startsWith("/") ? to : "";
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export default function App() {
  // Gate the app to the Nimiq Pay host. `nimiqPay` is injected synchronously,
  // but allow a short grace in case the provider attaches a beat later.
  const [hostState, setHostState] = useState<"checking" | "host" | "browser">(
    initialHostState
  );
  useEffect(() => {
    if (hostState !== "checking") return;
    let tries = 0;
    const id = setInterval(() => {
      if (isNimiqPayHost()) {
        setHostState("host");
        clearInterval(id);
      } else if (++tries >= 25) {
        setHostState("browser");
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [hostState]);

  // Splash is now hidden by the <SplashHider /> mounted inside each resolved
  // route (and by the 4s safety net in index.html if a chunk hangs). We used
  // to fire __hideSplash eagerly here, but that ripped the splash away before
  // the lazy route chunk resolved — leaving a blank flash between the inline
  // splash and the landing paint. Suspense fallbacks now render null so the
  // splash remains visible until the real page is ready.

  // Outside Nimiq Pay: app.xcrowhub.com shows the "Open in Nimiq Pay" gate;
  // www.xcrowhub.com (and any other host) shows the public marketing site.
  if (hostState === "browser") {
    if (isAppSubdomain()) {
      const path = currentMiniAppPath();
      if (path && path !== "/") {
        return (
          <Suspense fallback={<PublicRouteFallback />}>
            <SplashHider />
            <OpenInApp to={path} />
          </Suspense>
        );
      }

      return <BrowserMiniAppGate />;
    }

    return (
      <Suspense fallback={<PublicRouteFallback />}>
        <SplashHider />
        <Routes>
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/open" element={<OpenInApp />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    );
  }
  if (hostState === "checking") {
    return (
      <PageLoader
        title="Opening XcrowHub"
        detail="Preparing the mini app."
      />
    );
  }

  // Show maintenance screen inside Nimiq Pay when the flag is on.
  if (MAINTENANCE) return <ComingSoon />;

  return <MiniAppShell />;
}

function MiniAppShell() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const session = useAuthStore((s) => s.session);
  const theme = useThemeStore((s) => s.theme);
  const myTickets = useSupportStore((s) => s.myTickets);
  const loadMyTickets = useSupportStore((s) => s.loadMyTickets);
  const startListening = useNotificationStore((s) => s.startListening);
  const startNotificationFeed = useNotificationStore((s) => s.startNotificationFeed);
  useEffect(() => {
    const init = async () => {
      await restoreSession();
      const store = useDealStore.getState();
      store.reconcileDeadlines();
      if (typeof (store as any).loadFromSupabase === "function") {
        await (store as any).loadFromSupabase().catch(() => {});
      }
    };
    init();
  }, [restoreSession]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const store = useDealStore.getState();
      if (typeof (store as any).loadFromSupabase === "function") {
        (store as any).loadFromSupabase().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!session?.address) return;
    loadMyTickets(session.address);
  }, [session?.address, loadMyTickets]);

  useEffect(() => {
    if (!session?.address) return;
    const currentAddress = session.address.replace(/\s+/g, "").toLowerCase();
    const ids = myTickets
      .filter(
        (ticket) =>
          ticket.openerAddr.replace(/\s+/g, "").toLowerCase() === currentAddress
      )
      .map((ticket) => ticket.id);
    if (ids.length === 0) return;
    const unsub = startListening(ids);
    return unsub;
  }, [session?.address, myTickets, startListening]);

  useEffect(() => {
    if (!session?.address) return;
    const unsub = startNotificationFeed(session.address);
    return unsub;
  }, [session?.address, startNotificationFeed]);

  return (
    <div className="min-h-full">
      {theme === "dark" && <StarsBackground />}
      <div className="relative z-10 min-h-full">
        <AppHeader />
        <main className="app-shell">
          <Suspense fallback={<RouteFallback />}>
            <SplashHider />
            <Routes>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/find" element={<FindDeal />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/scan" element={<ScanDeal />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/listings/:id" element={<ListingDetail />} />
              <Route path="/deal/:id/pay" element={<PayDeal />} />
              <Route path="/bug-report" element={<BugReport />} />

              {/* Auth required */}
              <Route path="/create" element={<AuthGuard><YourDeals /></AuthGuard>} />
              <Route path="/create/new" element={<AuthGuard><CreateDeal /></AuthGuard>} />
              <Route path="/listings/new" element={<AuthGuard><CreateListing /></AuthGuard>} />
              <Route path="/deal/:id" element={<AuthGuard><DealDetail /></AuthGuard>} />
              <Route path="/deal/:id/status" element={<AuthGuard><DealStatus /></AuthGuard>} />
              <Route path="/deal/:id/seller" element={<AuthGuard><SellerDelivery /></AuthGuard>} />
              <Route path="/deal/:id/confirm" element={<AuthGuard><BuyerConfirm /></AuthGuard>} />
              <Route path="/deal/:id/query" element={<AuthGuard><RaiseQuery /></AuthGuard>} />
              <Route path="/deal/:id/proof" element={<AuthGuard><SubmitProof /></AuthGuard>} />
              <Route path="/deal/:id/feedback" element={<AuthGuard><LeaveFeedback /></AuthGuard>} />
              <Route path="/support" element={<AuthGuard><Support /></AuthGuard>} />
              <Route path="/referral" element={<AuthGuard><Referral /></AuthGuard>} />
              <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
              <Route path="/profile/:address" element={<AuthGuard><Profile /></AuthGuard>} />

              {/* Admin only */}
              <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
              <Route path="/admin/deal/:id" element={<AdminGuard><AdminReview /></AdminGuard>} />
              <Route path="/admin/support" element={<AdminGuard><AdminSupport /></AdminGuard>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <BottomNav />
        <ConnectWelcomeModal />
        <OnboardingCoordinator />
      </div>
    </div>
  );
}
