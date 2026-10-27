"use client";

import { useRef } from "react";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";

/**
 * Plays a short entrance when it mounts. Give it a `key` that changes to replay it (a form's
 * next step). Respects reduced motion.
 */
export function Enter({
  children,
  from = { y: 8 },
  className,
}: {
  children: React.ReactNode;
  from?: gsap.TweenVars;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current || prefersReducedMotion()) return;
    gsap.from(ref.current, { autoAlpha: 0, yPercent: 0, ...from, duration: MOTION.base, ease: "power2.out", clearProps: "all" });
  });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
