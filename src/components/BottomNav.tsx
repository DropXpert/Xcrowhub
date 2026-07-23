import { Link, useLocation } from "react-router-dom";
import { Home, Briefcase, Store, User, MessageCircle } from "lucide-react";
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
  const getProfile = useProfileStore((s) => s.getProfile);
  const avatarDataUrl = session ? getProfile(session.address).avatarDataUrl : null;

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
    <nav data-bottom-nav className="desktop-navigation fixed inset-x-0 bottom-0 z-50 flex justify-center lg:block">
      <div className="w-full max-w-app border-t border-edge bg-surface/95 backdrop-blur-sm lg:max-w-none lg:overflow-hidden lg:rounded-2xl lg:border lg:shadow-lift">
        <div className="hidden border-b border-edge px-4 py-3 lg:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Workspace</p>
          <p className="mt-0.5 text-[13px] font-semibold text-ink">XcrowHub account</p>
        </div>
        <ul className="flex items-stretch lg:flex-col lg:gap-1 lg:p-2">
          {tabs.map(({ to, icon: Icon, label, public: isPublic, tour }) => {
            const isProfile = to === "/profile";
            const isHome = to === "/";
            const active = isActive(to);
            const badge = isHome && actionCount > 0 ? actionCount : 0;
            const locked = !isPublic && !session;

            return (
              <li key={to} className="flex-1" data-tour={tour}>
                <Link
                  to={isProfile && session ? `/profile/${encodeURIComponent(session.address)}` : to}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-1 py-2.5 transition lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:py-3",
                    active ? "text-accent" : locked ? "text-muted/50" : "text-muted hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "relative grid h-7 w-7 place-items-center rounded-lg transition lg:h-8 lg:w-8",
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
                  <span className={cn("text-[11px] font-medium tracking-wide lg:text-[13px]", active && !locked && "text-accent")}>
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
