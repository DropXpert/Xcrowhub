import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { listingImageUrl } from "@/lib/listingImages";

export function ListingImage({
  imagePath,
  title,
  className,
  eager = false,
  variant = "cover",
  placeholder = false,
}: {
  imagePath?: string | null;
  title: string;
  className?: string;
  eager?: boolean;
  variant?: "cover" | "avatar";
  placeholder?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = listingImageUrl(imagePath);

  useEffect(() => setFailed(false), [imagePath]);
  if ((!src || failed) && variant === "cover" && !placeholder) return null;

  if (variant === "avatar") {
    return (
      <div
        className={cn(
          "relative isolate grid shrink-0 place-items-center rounded-full",
          "before:absolute before:-inset-1 before:-z-10 before:rounded-full",
          "before:bg-accent/25 before:blur-md",
          className,
        )}
        title={src && !failed ? title : "No image"}
      >
        <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-surface shadow-[0_0_0_2px_rgba(79,209,165,0.22),0_0_14px_rgba(79,209,165,0.28)]">
          {src && !failed ? (
            <img
              src={src ?? undefined}
              alt={`${title} product`}
              className="h-full w-full object-cover"
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="flex flex-col items-center justify-center gap-0.5 text-muted">
              <ImageOff className="h-4 w-4" />
              <span className="text-[7px] font-semibold uppercase tracking-wide">No image</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden bg-bg", className)}>
      <img
        src={src ?? undefined}
        alt={`${title} product`}
        className="h-full w-full object-cover"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
