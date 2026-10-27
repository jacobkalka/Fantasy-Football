"use client";

import { useRef } from "react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";

/**
 * Glides an element to new CSS values whenever they change (a bar's width, a ball's place on
 * the field). The first values are set without movement, so nothing animates on page load.
 */
export function useTweenTo<T extends HTMLElement>(vars: gsap.TweenVars, deps: unknown[]) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useGSAP(
    () => {
      if (!ref.current) return;
      if (first.current || prefersReducedMotion()) {
        first.current = false;
        gsap.set(ref.current, vars);
        return;
      }
      gsap.to(ref.current, { ...vars, duration: MOTION.slow, ease: "power3.out", overwrite: "auto" });
    },
    { dependencies: deps },
  );
  return ref;
}
