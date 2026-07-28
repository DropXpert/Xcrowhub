import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <ShieldAlert className="h-8 w-8 text-muted/50" />
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-ink">Connect your wallet</p>
          <p className="text-[13px] text-muted">Admin access requires a connected wallet.</p>
        </div>
        <Link to="/" className="btn-secondary">Back to home</Link>
      </div>
    );
  }

  if (session.role !== "admin") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <ShieldAlert className="h-8 w-8 text-danger/60" />
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-ink">Access denied</p>
          <p className="text-[13px] text-muted">This area is restricted to admin accounts only.</p>
        </div>
        <Link to="/" className="btn-secondary">Back to home</Link>
      </div>
    );
  }

  return <>{children}</>;
}
