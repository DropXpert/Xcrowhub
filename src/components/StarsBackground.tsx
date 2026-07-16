import { useState, useEffect, useRef, useCallback } from "react";

function generateBoxShadow(count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 4000) - 2000;
    const y = Math.floor(Math.random() * 4000) - 2000;
    parts.push(`${x}px ${y}px #fff`);
  }
  return parts.join(", ");
}

interface LayerProps {
  count: number;
  size: number;
  animationClass: string;
}

function StarLayer({ count, size, animationClass }: LayerProps) {
  const [shadow, setShadow] = useState("");

  useEffect(() => {
    setShadow(generateBoxShadow(count));
  }, [count]);

  const dot = { width: size, height: size, boxShadow: shadow };

  return (
    <div className={`absolute left-0 top-0 w-full ${animationClass}`} style={{ height: 2000 }}>
      <div className="absolute rounded-full bg-transparent" style={dot} />
      <div className="absolute rounded-full bg-transparent" style={{ ...dot, top: 2000 }} />
    </div>
  );
}

export function StarsBackground() {
  const innerRef = useRef<HTMLDivElement>(null);

  const onMove = useCallback((clientX: number, clientY: number) => {
    const el = innerRef.current;
    if (!el) return;
    const dx = -(clientX - window.innerWidth / 2) * 0.04;
    const dy = -(clientY - window.innerHeight / 2) * 0.04;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const handleMouse = useCallback((e: React.MouseEvent) => {
    onMove(e.clientX, e.clientY);
  }, [onMove]);

  const handleTouch = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) onMove(t.clientX, t.clientY);
  }, [onMove]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: "radial-gradient(ellipse at bottom, #0E1C16 0%, #060D09 100%)" }}
      onMouseMove={handleMouse}
      onTouchMove={handleTouch}
    >
      <div ref={innerRef} style={{ transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)" }}>
        <StarLayer count={1000} size={1} animationClass="animate-stars-scroll-sm" />
        <StarLayer count={400}  size={2} animationClass="animate-stars-scroll-md" />
        <StarLayer count={200}  size={3} animationClass="animate-stars-scroll-lg" />
      </div>
    </div>
  );
}
