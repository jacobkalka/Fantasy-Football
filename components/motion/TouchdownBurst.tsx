"use client";

import { useRef } from "react";
import { playTouchdownSound } from "@/lib/sound/touchdown";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const distance = 46 + (i % 3) * 14;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, delay: (i % 4) * 0.02 };
});

/**
 * A quick burst of sparks and a "TOUCHDOWN" stamp, played once when a touchdown arrives, plus the
 * touchdown sound if it's switched on in Settings (`sound`). Sparks use the scoring team's colour
 * and the data blue; nothing glows.
 */
export function TouchdownBurst({ color, sound = false }: { color: string; sound?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (sound) playTouchdownSound();
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline();
      scope.current?.querySelectorAll<HTMLElement>("[data-spark]").forEach((el, i) => {
        const spark = SPARKS[i];
        tl.fromTo(el, { x: 0, y: 0, autoAlpha: 1, scale: 1 }, { x: spark.x, y: spark.y, autoAlpha: 0, scale: 0.3, duration: 0.9, ease: "expo.out" }, spark.delay);
      });
      tl.fromTo(
        "[data-stamp]",
        { scale: 0.4, autoAlpha: 0, rotation: -6 },
        { keyframes: [{ scale: 1.15, autoAlpha: 1, rotation: 0, duration: 0.35 }, { scale: 1, autoAlpha: 0, duration: 1.05 }] },
        0,
      );
    },
    { scope },
  );
  return (
    <div ref={scope} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-visible" aria-hidden="true">
      {SPARKS.map((_, i) => (
        <span
          key={i}
          data-spark
          className={`absolute size-1.5 rounded-full opacity-0 ${i % 2 ? "" : "bg-accent"}`}
          style={i % 2 ? { background: color } : undefined}
        />
      ))}
      <span data-stamp className="absolute text-[28px] font-semibold tracking-[-0.01em] text-ink opacity-0">
        TOUCHDOWN
      </span>
    </div>
  );
}
