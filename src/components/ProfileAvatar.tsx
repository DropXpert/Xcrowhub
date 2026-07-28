import { cn } from "@/lib/cn";

function addressToHue(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 360;
}

const sizeClasses = {
  sm: "h-8 w-8 text-[13px]",
  md: "h-12 w-12 text-[16px]",
  lg: "h-16 w-16 text-[22px]",
};

export function ProfileAvatar({
  address,
  size = "md",
  className,
  avatarDataUrl,
}: {
  address: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  avatarDataUrl?: string | null;
}) {
  const hue = addressToHue(address);
  const initials = address.replace(/\s/g, "").slice(2, 4).toUpperCase();

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt="Profile"
        className={cn(
          "rounded-full object-cover select-none",
          sizeClasses[size],
          className
        )}
        title={address}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white select-none",
        sizeClasses[size],
        className
      )}
      style={{ background: `hsl(${hue} 55% 48%)` }}
      title={address}
    >
      {initials}
    </span>
  );
}
