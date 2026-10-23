"use client";

import { useRef } from "react";
import { gsap, MOTION, useGSAP } from "@/lib/motion/gsap";
import { isHydrated } from "./hydration";

/**
 * Each screen arrives with a short fade and an 8px rise when you navigate to it
 * (app/template.tsx wraps every page in this). Not on the first page load, and with
 * "reduce motion" only a quick fade. The header and tab bars never move.
 */
export function PageEnter({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!isHydrated() || !ref.current) return;
      const mm = gsap.matchMedia();
      mm.add(
        { reduce: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const reduce = Boolean(context.conditions?.reduce);
          gsap.fromTo(
            ref.current,
            { autoAlpha: 0, y: reduce ? 0 : 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: reduce ? MOTION.fast : MOTION.base,
              // A leftover transform would trap position:fixed children inside this box.
              clearProps: "transform,opacity,visibility",
            },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: ref },
  );

  return <div ref={ref}>{children}</div>;
}
