"use client";

import { useRef } from "react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";

/**
 * A number that rolls from its old value to its new one when it changes (a team
 * rating after a trade, live points). The real value is always in the markup, so the
 * first paint and screen readers get the right number; only changes animate.
 */
export function CountUp({
  value,
  decimals = 0,
  className,
  prefix = "",
  signed = false,
}: {
  value: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  /** Show a + on positive numbers (for changes). */
  signed?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);

  const format = (n: number) => {
    const fixed = n.toFixed(decimals);
    const clean = Number(fixed) === 0 ? (0).toFixed(decimals) : fixed;
    const sign = signed && Number(clean) > 0 ? "+" : "";
    return `${prefix}${sign}${clean.replace("-", "−")}`;
  };

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || shown.current === value) return;
      const reduce = prefersReducedMotion();
      const proxy = { n: shown.current };
      shown.current = value;
      if (reduce) {
        el.textContent = format(value);
        return;
      }
      gsap.to(proxy, {
        n: value,
        duration: MOTION.slow,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = format(proxy.n);
        },
      });
    },
    { dependencies: [value] },
  );

  return (
    <span ref={ref} className={`tabular ${className ?? ""}`}>
      {format(value)}
    </span>
  );
}
