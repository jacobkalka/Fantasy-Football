"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import type { Confidence } from "@/lib/startsit/types";

const LEVELS: Confidence[] = ["Lean", "Solid", "Strong"];

const CAPTION: Record<Confidence, string> = {
  Lean: "Close call: either player is a reasonable start.",
  Solid: "A clear edge, but upsets happen.",
  Strong: "As clear as these get.",
};

/** Three segments that fill up to the confidence level, with the level spelled out (never colour alone). */
export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const level = LEVELS.indexOf(confidence);
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-fill]", { scaleX: 0, duration: 0.3, stagger: 0.12, ease: "power2.out", transformOrigin: "left" });
    },
    { scope: root, dependencies: [confidence] },
  );

  return (
    <div ref={root} className="flex flex-col gap-2">
      <div
        role="meter"
        aria-label="Confidence"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={level + 1}
        aria-valuetext={`${confidence} confidence`}
        className="grid grid-cols-3 gap-1.5"
      >
        {LEVELS.map((name, i) => (
          <div key={name} className="flex flex-col gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-well">
              {i <= level && <div data-fill="" className="h-full rounded-full bg-accent" />}
            </div>
            <span className={`text-[12px] ${i === level ? "font-medium text-ink" : "text-faint"}`}>{name}</span>
          </div>
        ))}
      </div>
      <p className="text-[14px] text-muted">
        <span className="font-medium text-ink">{confidence} confidence.</span> {CAPTION[confidence]}
      </p>
    </div>
  );
}
