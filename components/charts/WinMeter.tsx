"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";

/**
 * Win probability as a tug-of-war bar: your share from the left in the brand colour, the
 * opponent's from the right. The number is always written out (never colour alone), with
 * whose estimate it is ("ESPN" or "FantasyLab estimate").
 */
export function WinMeter({
  probability,
  source,
  meLabel = "You",
  themLabel = "Opponent",
  size = "md",
}: {
  /** Your chance, 0-1. */
  probability: number;
  source: "espn" | "estimate";
  meLabel?: string;
  themLabel?: string;
  size?: "sm" | "md";
}) {
  const fill = useRef<HTMLSpanElement>(null);
  const pct = Math.round(probability * 100);
  useLayoutEffect(() => {
    if (!fill.current) return;
    if (prefersReducedMotion()) gsap.set(fill.current, { width: `${pct}%` });
    else gsap.to(fill.current, { width: `${pct}%`, duration: MOTION.slow, ease: "power3.out" });
  }, [pct]);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-ink">
          {meLabel} <span className="tabular">{pct}%</span>
        </span>
        <span className="text-muted">
          <span className="tabular">{100 - pct}%</span> {themLabel}
        </span>
      </div>
      <div
        className={`mt-1.5 flex overflow-hidden rounded-full bg-well ${size === "sm" ? "h-1.5" : "h-2.5"}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Chance to win: ${pct}%`}
      >
        <span ref={fill} className="block h-full rounded-full bg-accent" style={{ width: "50%" }} />
      </div>
      <p className="mt-1 text-[11px] text-faint">{source === "espn" ? "Win probability from ESPN" : "FantasyLab estimate"}</p>
    </div>
  );
}
