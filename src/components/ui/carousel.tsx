"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  type PanInfo,
  useMotionValue,
  useTransform,
} from "motion/react";
import type { ReactNode } from "react";

/* Adapted from reactbits.dev Carousel — themed to the app tokens (surface/edge/
   accent), responsive width (fills its container), and lucide-friendly icon
   slots. Swipe on touch, arrow-key + dot navigation, optional autoplay/loop. */

export interface CarouselItem {
  id: number;
  title: string;
  description: string;
  icon: ReactNode;
}

const GAP = 16;
const DRAG_BUFFER = 0;
const VELOCITY_THRESHOLD = 500;
const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

export function Carousel({
  items,
  autoplay = false,
  autoplayDelay = 4000,
  loop = true,
}: {
  items: CarouselItem[];
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [itemWidth, setItemWidth] = useState(280);

  // Measure the container so the track fills the available width (mini-app is
  // a single narrow column — no fixed baseWidth).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setItemWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trackItemOffset = itemWidth + GAP;

  const itemsForRender = useMemo(() => {
    if (!loop || items.length === 0) return items;
    return [items[items.length - 1], ...items, items[0]];
  }, [items, loop]);

  const [position, setPosition] = useState(loop ? 1 : 0);
  const x = useMotionValue(0);
  const [isJumping, setIsJumping] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const start = loop ? 1 : 0;
    setPosition(start);
    x.set(-start * trackItemOffset);
  }, [items.length, loop, trackItemOffset, x]);

  useEffect(() => {
    if (!autoplay || itemsForRender.length <= 1) return;
    const timer = setInterval(() => {
      setPosition((p) => Math.min(p + 1, itemsForRender.length - 1));
    }, autoplayDelay);
    return () => clearInterval(timer);
  }, [autoplay, autoplayDelay, itemsForRender.length]);

  const effectiveTransition = isJumping ? { duration: 0 } : SPRING;

  function handleAnimationComplete() {
    if (!loop || itemsForRender.length <= 1) {
      setIsAnimating(false);
      return;
    }
    const lastClone = itemsForRender.length - 1;
    if (position === lastClone) {
      setIsJumping(true);
      setPosition(1);
      x.set(-1 * trackItemOffset);
      requestAnimationFrame(() => {
        setIsJumping(false);
        setIsAnimating(false);
      });
      return;
    }
    if (position === 0) {
      setIsJumping(true);
      setPosition(items.length);
      x.set(-items.length * trackItemOffset);
      requestAnimationFrame(() => {
        setIsJumping(false);
        setIsAnimating(false);
      });
      return;
    }
    setIsAnimating(false);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    const dir =
      offset.x < -DRAG_BUFFER || velocity.x < -VELOCITY_THRESHOLD
        ? 1
        : offset.x > DRAG_BUFFER || velocity.x > VELOCITY_THRESHOLD
          ? -1
          : 0;
    if (dir === 0) return;
    setPosition((p) =>
      Math.max(0, Math.min(p + dir, itemsForRender.length - 1))
    );
  }

  const dragProps = loop
    ? {}
    : {
        dragConstraints: {
          left: -trackItemOffset * Math.max(itemsForRender.length - 1, 0),
          right: 0,
        },
      };

  const activeIndex =
    items.length === 0
      ? 0
      : loop
        ? (position - 1 + items.length) % items.length
        : Math.min(position, items.length - 1);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="overflow-hidden">
        <motion.div
          className="flex"
          drag={isAnimating ? false : "x"}
          {...dragProps}
          style={{ gap: `${GAP}px`, x }}
          onDragEnd={handleDragEnd}
          animate={{ x: -(position * trackItemOffset) }}
          transition={effectiveTransition}
          onAnimationStart={() => setIsAnimating(true)}
          onAnimationComplete={handleAnimationComplete}
        >
          {itemsForRender.map((item, index) => (
            <Slide
              key={`${item.id}-${index}`}
              item={item}
              index={index}
              itemWidth={itemWidth}
              trackItemOffset={trackItemOffset}
              x={x}
              transition={effectiveTransition}
            />
          ))}
        </motion.div>
      </div>

      <div className="flex justify-center gap-2">
        {items.map((_, index) => (
          <motion.button
            type="button"
            key={index}
            aria-label={`Go to step ${index + 1}`}
            aria-current={activeIndex === index}
            onClick={() => setPosition(loop ? index + 1 : index)}
            animate={{ scale: activeIndex === index ? 1.3 : 1 }}
            transition={{ duration: 0.15 }}
            className={`h-2 w-2 rounded-full transition-colors ${
              activeIndex === index ? "bg-accent" : "bg-edge"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Slide({
  item,
  index,
  itemWidth,
  trackItemOffset,
  x,
  transition,
}: {
  item: CarouselItem;
  index: number;
  itemWidth: number;
  trackItemOffset: number;
  x: ReturnType<typeof useMotionValue<number>>;
  transition: object;
}) {
  const range = [
    -(index + 1) * trackItemOffset,
    -index * trackItemOffset,
    -(index - 1) * trackItemOffset,
  ];
  const rotateY = useTransform(x, range, [42, 0, -42], { clamp: false });

  return (
    <motion.div
      className="relative flex shrink-0 select-none flex-col justify-between overflow-hidden rounded-card border border-edge bg-surface shadow-receipt"
      style={{ width: itemWidth, rotateY }}
      transition={transition}
    >
      <div className="flex items-center gap-3 px-5 pt-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          {item.icon}
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[13px] font-bold text-white">
          {item.id}
        </span>
      </div>
      <div className="space-y-1.5 p-5">
        <h3 className="text-[16px] font-bold tracking-tight text-ink">
          {item.title}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted">
          {item.description}
        </p>
      </div>
    </motion.div>
  );
}
