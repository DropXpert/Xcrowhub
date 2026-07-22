import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { listingImageUrl } from "@/lib/listingImages";

export function ListingImage({
  imagePath,
  title,
  className,
  eager = false,
}: {
  imagePath?: string | null;
  title: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = listingImageUrl(imagePath);

  useEffect(() => setFailed(false), [imagePath]);
  if (!src || failed) return null;

  return (
    <div className={cn("overflow-hidden bg-bg", className)}>
      <img
        src={src}
        alt={`${title} product`}
        className="h-full w-full object-cover"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
