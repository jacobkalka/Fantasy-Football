"use client";

import { motion, useReducedMotion } from "motion/react";

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const distance = 46 + (i % 3) * 14;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, delay: (i % 4) * 0.02 };
});

/** A quick burst of sparks and a "TOUCHDOWN" stamp, played once when a TD arrives. */
export function TouchdownBurst({ color = "#c8ff2e" }: { color?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-visible" aria-hidden="true">
      {SPARKS.map((spark, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rounded-full"
          style={{ background: i % 2 ? color : "#c8ff2e", boxShadow: `0 0 10px ${color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: spark.x, y: spark.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.9, delay: spark.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
      <motion.span
        className="absolute text-3xl font-bold text-gain"
        initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
        animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 0], rotate: 0 }}
        transition={{ duration: 1.4, times: [0, 0.25, 1] }}
      >
        TOUCHDOWN
      </motion.span>
    </div>
  );
}
