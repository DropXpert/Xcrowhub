import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-6 w-6" };

export function StarRating({ value, onChange, size = "md", className }: StarRatingProps) {
  const readonly = !onChange;
  return (
    <span className={cn("inline-flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={cn(
            "transition",
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"
          )}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              sizeMap[size],
              n <= value ? "fill-warning stroke-warning" : "fill-none stroke-edge"
            )}
          />
        </button>
      ))}
    </span>
  );
}

export function ratingLabel(avg: number): string {
  if (avg >= 4.8) return "Exceptional";
  if (avg >= 4.0) return "Great";
  if (avg >= 3.0) return "Good";
  if (avg >= 2.0) return "Fair";
  return "Poor";
}
