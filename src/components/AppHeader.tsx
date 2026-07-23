import { Link, useLocation, useNavigate } from "react-router-dom";
import { Wallet, Bell, LogOut, Zap } from "lucide-react";
import { SkeletonDots } from "@/components/LoadingStates";
import { cn } from "@/lib/cn";
import { useAuthStore, useIsAdmin } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { isSupabaseConfiguredForClient } from "@/lib/supabase";
import { useState, useRef, useEffect } from "react";
import { CopyButton } from "@/components/CopyButton";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";

function shortenAddr(addr: string) {
  const c = addr.replace(/\s+/g, "");
  return c.length <= 10 ? addr : `${c.slice(0, 5)}…${c.slice(-4)}`;
}

function NotificationBell() {
  const navigate = useNavigate();
  const { unreadCount, notifications, markAllRead, markRead } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle() {
    if (!open && unreadCount > 0) markAllRead();
    setOpen((s) => !s);
  }

  function goTo(url: string, id: string) {
    markRead(id);
    setOpen(false);
    navigate(url);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "relative grid h-8 w-8 place-items-center rounded-lg border border-edge bg-surface text-muted transition hover:text-ink",
          open && "border-accent/40 bg-accent-soft text-accent"
        )}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-edge bg-surface shadow-lift overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <p className="text-[13px] font-semibold text-ink">Notifications</p>
            {notifications.length > 0 && (
              <button type="button" onClick={markAllRead} className="text-[12px] text-muted hover:text-accent transition">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted">No notifications yet</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-edge">
              {notifications.slice(0, 10).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => goTo(n.url, n.id)}
                    className={cn("w-full text-left px-4 py-3 hover:bg-bg transition space-y-0.5", !n.read && "bg-accent-soft/40")}
                  >
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />}
                      <p className="text-[13px] font-semibold text-ink truncate">{n.title}</p>
                    </div>
                    <p className="text-[12px] text-muted line-clamp-2">{n.body}</p>
                    <p className="text-[11px] text-muted/60">
                      {new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function WalletMenu({ address }: { address: string }) {
  const { disconnect } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleDisconnect() {
    setOpen(false);
    disconnect();
    navigate("/", { replace: true });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label="Wallet"
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent-soft text-accent-ink transition",
          open && "border-accent bg-accent/10 text-accent"
        )}
      >
        <Wallet className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-edge bg-surface shadow-lift overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(`/profile/${encodeURIComponent(address)}`);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] text-ink hover:bg-bg transition border-b border-edge"
          >
            <Wallet className="h-3.5 w-3.5 text-muted shrink-0" />
            <span className="truncate font-mono text-[12px] text-muted">{shortenAddr(address)}</span>
          </button>
          <div className="flex w-full items-center gap-2.5 px-4 py-3 border-b border-edge">
            <CopyButton text={address} size="sm" />
            <span className="text-[13px] text-ink">Copy address</span>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] text-danger hover:bg-danger/5 transition"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, loading, connect } = useAuthStore();
  const supConfigured = isSupabaseConfiguredForClient();
  const isAdmin = useIsAdmin();
  const onAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    if (isAdmin && pathname === "/") navigate("/admin", { replace: true });
  }, [isAdmin, pathname, navigate]);

  return (
    <header className="mx-auto flex w-full max-w-app items-center justify-between gap-3 px-5 pt-5 lg:max-w-site lg:px-6 lg:pt-6">
      <Link to={isAdmin ? "/admin" : "/"} className="flex items-center gap-2 min-w-0">
        <img src="/logo-icon.png" alt="XcrowHub" className="h-9 w-9 shrink-0 rounded-card lg:h-10 lg:w-10" />
        <span className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-ink lg:text-[17px]">XcrowHub</span>
        <span className="shrink-0 rounded-[4px] border border-warning/30 bg-warning/10 px-1 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-warning">
          beta
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        {session ? (
          <>
            <WalletMenu address={session.address} />
            <NotificationBell />
            {isAdmin && (
              <Link
                to={onAdmin ? "/" : "/admin"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition",
                  onAdmin
                    ? "border-accent bg-accent text-white"
                    : "border-accent/60 bg-accent-soft text-accent hover:bg-accent hover:text-white"
                )}
                title={onAdmin ? "Exit admin" : "Admin dashboard"}
              >
                <Zap className="h-3 w-3" />
                {onAdmin ? "Exit admin" : "Admin"}
              </Link>
            )}
          </>
        ) : supConfigured ? (
          <button
            type="button"
            onClick={() => connect()}
            disabled={loading}
            className="pill border-accent/40 bg-accent-soft text-accent-ink transition hover:bg-accent/10"
          >
            {loading ? <SkeletonDots label="Connecting wallet" /> : <Wallet className="h-3.5 w-3.5" />}
            <span>{loading ? "Connecting…" : "Connect"}</span>
          </button>
        ) : null}
        <ThemeToggleButton />
      </div>
    </header>
  );
}
