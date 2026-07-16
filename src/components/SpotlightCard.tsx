import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import "./SpotlightCard.css";

type SpotlightCardProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  spotlightColor?: string;
};

export function SpotlightCard({
  children,
  className = "",
  style,
  spotlightColor = "rgba(79, 209, 165, 0.25)",
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = divRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    el.style.setProperty("--mouse-x", `${x}px`);
    el.style.setProperty("--mouse-y", `${y}px`);
    el.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      className={`card-spotlight ${className}`}
      style={{ ...style, "--spotlight-color": spotlightColor } as CSSProperties}
    >
      {children}
    </div>
  );
}