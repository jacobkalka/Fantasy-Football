"use client";

import { motion } from "motion/react";
import type { Confidence } from "@/lib/startsit/types";

const LEVELS: Confidence[] = ["Lean", "Solid", "Strong"];

const CAPTION: Record<Confidence, string> = {
  Lean: "Close call: either player is a reasonable start.",
  Solid: "A clear edge, but upsets happen.",
  Strong: "As clear as these get.",
};

/** Three bars that fill up to the confidence level, with the level spelled out (never color alone). */
export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const level = LEVELS.indexOf(confidence);
  return (
    <div className="flex flex-col gap-2">
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
            <div className="relative h-2.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="absolute inset-0 origin-left rounded-full bg-gain shadow-[0_0_10px_var(--color-gain)]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: i <= level ? 1 : 0 }}
                transition={{ type: "spring", stiffness: 140, damping: 20, delay: i <= level ? 0.15 + i * 0.18 : 0 }}
              />
            </div>
            <span
              className={`font-mono text-[10px] tracking-[0.1em] uppercase ${i === level ? "font-bold text-gain" : "text-muted"}`}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[13px] text-ink-soft">
        <span className="font-semibold text-ink-strong">{confidence} confidence.</span> {CAPTION[confidence]}
      </p>
    </div>
  );
}
