"use client";

import { motion } from "motion/react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number whose digits roll like an odometer when it changes ("104.6" → "113.0").
 * Screen readers get the plain value.
 */
export function AnimatedNumber({
  value,
  decimals = 1,
  className = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const text = value.toFixed(decimals);
  const chars = text.split("");
  return (
    <span className={`tabular inline-flex ${className}`} aria-label={text} role="img">
      {chars.map((char, index) => {
        // Key from the right so the ones digit stays the ones digit when the number grows.
        const key = chars.length - index;
        const digit = DIGITS.indexOf(char);
        if (digit === -1) {
          return (
            <span key={`s${key}`} aria-hidden="true">
              {char}
            </span>
          );
        }
        return (
          <span key={`d${key}`} aria-hidden="true" className="relative inline-block h-[1em] overflow-hidden leading-none">
            <span className="invisible">0</span>
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${-digit}em` }}
              transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.8 }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
