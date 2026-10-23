"use client";

import { useRef } from "react";
import { gsap, MOTION, useGSAP } from "@/lib/motion/gsap";
import { isHydrated } from "./hydration";

/**
 * Content that replaces its loading placeholder: the direct children rise 12px and fade
 * in, one after another. Only when the content appears after the page is on screen; on
 * the first paint it is simply there. Never leaves anything hidden if a script fails:
 * the starting state is set by GSAP itself, not by CSS.
 */
export function Reveal({
  children,
  className,
  stagger = true,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  as?: "div" | "section" | "ul" | "ol";
}) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || !isHydrated()) return;
      const items = stagger ? Array.from(root.children) : [root];
      if (!items.length) return;
      const mm = gsap.matchMedia();
      mm.add(
        { reduce: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const reduce = Boolean(context.conditions?.reduce);
          gsap.fromTo(
            items,
            { autoAlpha: 0, y: reduce ? 0 : 12 },
            {
              autoAlpha: 1,
              y: 0,
              duration: reduce ? MOTION.fast : MOTION.base,
              stagger: reduce ? 0 : Math.min(MOTION.stagger, 0.3 / items.length),
              clearProps: "transform,opacity,visibility",
            },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className}>
      {children}
    </Tag>
  );
}
