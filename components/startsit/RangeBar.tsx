"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";

/**
 * A player's likely range this week: a bar from floor (a bad week) to ceiling (a great
 * week) with a tick at the model's number. Every card uses the same scale (`max`), so the
 * bars compare side by side. Changes slide; the first draw is in place.
 */
export function RangeBar({ floor, ceiling, score, max }: { floor: number; ceiling: number; score: number; max: number }) {
  const at = (value: number) => Math.min(100, Math.max(0, (value / max) * 100));
  const band = useRef<HTMLDivElement>(null);
  const tick = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const to = { band: { left: `${at(floor)}%`, width: `${at(ceiling) - at(floor)}%` }, tick: { left: `${at(score)}%` } };
    const reduce = prefersReducedMotion();
    if (first.current || reduce) {
      gsap.set(band.current, to.band);
      gsap.set(tick.current, to.tick);
    } else {
      gsap.to(band.current, { ...to.band, duration: MOTION.slow });
      gsap.to(tick.current, { ...to.tick, duration: MOTION.slow });
    }
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, ceiling, score, max]);

  return (
    <div className="w-full" role="img" aria-label={`Likely range ${floor.toFixed(1)} to ${ceiling.toFixed(1)} points`}>
      <div className="relative h-1.5 w-full rounded-full bg-well">
        <div ref={band} className="absolute inset-y-0 rounded-full bg-accent/60" />
        <div ref={tick} className="absolute -top-1 h-3.5 w-[3px] -translate-x-1/2 rounded-full bg-ink" />
      </div>
      <div className="tabular mt-1.5 flex justify-between text-[12px] text-faint">
        <span>
          Floor <span className="text-muted">{floor.toFixed(1)}</span>
        </span>
        <span>
          Ceiling <span className="text-muted">{ceiling.toFixed(1)}</span>
        </span>
      </div>
    </div>
  );
}
