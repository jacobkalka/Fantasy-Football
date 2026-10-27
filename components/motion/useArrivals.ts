"use client";

import { useRef } from "react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";

/**
 * Animates list items that weren't there before (a new play, a new row) into place. Items need
 * a `data-key`. Nothing moves on the first render or when items just update.
 */
export function useArrivals<T extends HTMLElement>(keys: string[], { from = { y: -10 } }: { from?: gsap.TweenVars } = {}) {
  const scope = useRef<T>(null);
  const seen = useRef<Set<string> | null>(null);
  const signature = keys.join("|");
  useGSAP(
    () => {
      const known = seen.current;
      seen.current = new Set(keys);
      if (!known || !scope.current || prefersReducedMotion()) return;
      const fresh = keys.filter((k) => !known.has(k));
      if (fresh.length === 0 || fresh.length > 20) return;
      const nodes = fresh
        .map((k) => scope.current!.querySelector(`[data-key="${CSS.escape(k)}"]`))
        .filter((n): n is Element => n !== null);
      gsap.from(nodes, { autoAlpha: 0, yPercent: 0, ...from, duration: MOTION.base, ease: "power2.out", stagger: MOTION.stagger, clearProps: "all" });
    },
    { dependencies: [signature], scope },
  );
  return scope;
}
