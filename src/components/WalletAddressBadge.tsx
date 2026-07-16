import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

export function WalletAddressBadge({
  address,
  label,
  className,
  linkToProfile = true,
}: {
  address: string;
  label?: string;
  className?: string;
  linkToProfile?: boolean;
}) {
  const short = shortenAddress(address);
  const inner = (
    <>
      <Wallet className="h-3.5 w-3.5 text-muted" />
      {label ? (
        <span className="font-sans text-muted">{label}</span>
      ) : null}
      <span>{short}</span>
    </>
  );

  const cls = cn(
    "inline-flex items-center gap-2 rounded-lg border border-edge bg-bg px-2.5 py-1 font-mono text-[13px] text-ink",
    linkToProfile && "hover:border-accent/50 transition",
    className
  );

  if (linkToProfile) {
    return (
      <Link
        to={`/profile/${encodeURIComponent(address)}`}
        title={address}
        className={cls}
      >
        {inner}
      </Link>
    );
  }

  return (
    <span title={address} className={cls}>
      {inner}
    </span>
  );
}

function shortenAddress(addr: string) {
  const cleaned = addr.replace(/\s+/g, "");
  if (cleaned.length <= 14) return addr;
  return `${cleaned.slice(0, 6)}…${cleaned.slice(-4)}`;
}
