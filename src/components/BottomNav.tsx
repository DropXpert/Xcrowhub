import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Briefcase,
  Store,
  User,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { useProfileStore } from "@/store/profileStore";
import { resolveDealRole, isParticipant, dealNeedsAction } from "@/lib/dealRole";
import { ProfileAvatar } from "./ProfileAvatar";

function useActionCount() {
  const deals = useDealStore((s) => s.deals);
  const session = useAuthStore((s) => s.session);
  const addr = session?.address;
  if (!addr) return 0;
  return Object.values(deals).filter(
    (d) => isParticipant(d, addr) && dealNeedsAction(d, resolveDealRole(d, session))
  ).length;
}

export function BottomNav() {
  const { pathname } = useLocation();
  const actionCount = useActionCount();
  const { session } = useAuthStore();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("xcrow.desktop-sidebar-collapsed") === "true";
  });
  const getProfile = useProfileStore((s) => s.getProfile);
  const avatarDataUrl = session ? getProfile(session.address).avatarDataUrl : null;

  useEffect(() => {
    document.documentElement.classList.toggle("desktop-sidebar-collapsed", collapsed);
    window.localStorage.setItem("xcrow.desktop-sidebar-collapsed", String(collapsed));
    return () => document.documentElement.classList.remove("desktop-sidebar-collapsed");
  }, [collapsed]);

  function isActive(to: string) {
    if (to === "/") return pathname === "/";
    return pathname.startsWith(to);
  }

  const tabs = [
    { to: "/",         icon: Home,          label: "Home",    public: true,  tour: "nav-home"    },
    { to: "/create",   icon: Briefcase,     label: "Deals",   public: false, tour: "nav-deals"   },
    { to: "/listings", icon: Store,         label: "Market",  public: true,  tour: "nav-market"  },
    { to: "/support",  icon: MessageCircle, label: "Support", public: false, tour: "nav-support" },
    { to: "/profile",  icon: User,          label: "Profile", public: false, tour: "nav-profile" },
  ];

  return (
    <nav
      data-bottom-nav
      data-collapsed={collapsed}
      className="desktop-navigation fixed inset-x-0 bottom-0 z-50 flex justify-center lg:block"
    >
      <div className="desktop-navigation-panel w-full max-w-app border-t border-edge bg-surface/95 backdrop-blur-sm lg:flex lg:max-w-none lg:flex-col">
        <div className="desktop-sidebar-header hidden lg:flex">
          <Link to="/" className="desktop-sidebar-brand" aria-label="XcrowHub home">
            <span className="desktop-sidebar-logo">
              <img src="/logo-icon.png" alt="" className="h-8 w-8 rounded-xl" />
            </span>
            <span className="desktop-sidebar-brand-copy">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-bold tracking-tight text-white">XcrowHub</span>
                <span className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/70">
                  beta
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] font-medium text-white/45">Secure deal workspace</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="desktop-sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <div className="desktop-sidebar-label hidden lg:block">Navigation</div>
        <ul className="flex items-stretch lg:flex-1 lg:flex-col lg:gap-1.5 lg:px-3 lg:py-2">
          {tabs.map(({ to, icon: Icon, label, public: isPublic, tour }) => {
            const isProfile = to === "/profile";
            const isHome = to === "/";
            const active = isActive(to);
            const badge = isHome && actionCount > 0 ? actionCount : 0;
            const locked = !isPublic && !session;

            return (
              <li key={to} className="flex-1 lg:flex-none" data-tour={tour}>
                <Link
                  to={isProfile && session ? `/profile/${encodeURIComponent(session.address)}` : to}
                  data-active={active && !locked}
                  data-locked={locked}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "desktop-nav-link flex w-full flex-col items-center justify-center gap-1 py-2.5 transition lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:py-2.5",
                    active ? "text-accent" : locked ? "text-muted/50" : "text-muted hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "desktop-nav-icon relative grid h-7 w-7 place-items-center rounded-lg transition lg:h-9 lg:w-9 lg:rounded-xl",
                      active && !locked && "bg-accent-soft"
                    )}
                  >
                    {isProfile && session ? (
                      <ProfileAvatar
                        address={session.address}
                        size="sm"
                        className="h-5 w-5 text-[10px]"
                        avatarDataUrl={avatarDataUrl}
                      />
                    ) : (
                      <Icon
                        className={cn("h-5 w-5", active && !locked && "stroke-[2.25]")}
                        strokeWidth={active && !locked ? 2.25 : 1.75}
                      />
                    )}
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className={cn("desktop-nav-label text-[11px] font-medium tracking-wide lg:text-[13.5px] lg:font-semibold", active && !locked && "text-accent")}>
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="desktop-sidebar-footer hidden lg:flex">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="desktop-sidebar-footer-copy min-w-0">
            <span className="block text-[11px] font-semibold text-white/80">Protected escrow</span>
            <span className="mt-0.5 block text-[9.5px] leading-snug text-white/40">Wallet-secured transactions</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
