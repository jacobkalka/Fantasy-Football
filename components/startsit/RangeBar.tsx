"use client";

import { motion } from "motion/react";

/**
 * A player's likely range this week: a bar from floor (a bad week) to ceiling (a
 * great week) with a tick at the model's number. Every card uses the same scale
 * (`max`), so the bars can be compared side by side.
 */
export function RangeBar({ floor, ceiling, score, max }: { floor: number; ceiling: number; score: number; max: number }) {
  const at = (value: number) => `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
  const spring = { type: "spring", stiffness: 160, damping: 24 } as const;
  return (
    <div className="w-full" role="img" aria-label={`Likely range ${floor.toFixed(1)} to ${ceiling.toFixed(1)} points`}>
      <div className="relative h-2 w-full rounded-full bg-white/8">
        <motion.div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-gain/30 to-gain/80"
          initial={false}
          animate={{ left: at(floor), width: `calc(${at(ceiling)} - ${at(floor)})` }}
          transition={spring}
        />
        <motion.div
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-ink-strong shadow-[0_0_8px_var(--color-ink-strong)]"
          initial={false}
          animate={{ left: at(score) }}
          transition={spring}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted uppercase">
        <span>
          Floor <span className="text-ink-soft">{floor.toFixed(1)}</span>
        </span>
        <span>
          Ceil <span className="text-ink-soft">{ceiling.toFixed(1)}</span>
        </span>
      </div>
    </div>
  );
}
