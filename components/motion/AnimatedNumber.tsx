"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number whose digits roll like an odometer: up from zero when it first appears, and
 * from the old value to the new one when it changes ("104.6" → "113.0"). Screen readers
 * get the plain value; with animations reduced, digits simply change.
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
  const root = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const columns = root.current?.querySelectorAll<HTMLElement>("[data-digit]");
    if (!columns) return;
    const reduce = prefersReducedMotion();
    columns.forEach((column, i) => {
      const y = `${-Number(column.dataset.digit)}em`;
      if (reduce) gsap.set(column, { y });
      else if (first.current) {
        // Spin up from zero, the left digits settling last like a slot machine.
        gsap.fromTo(column, { y: 0 }, { y, duration: 0.9 + (columns.length - i) * 0.08, ease: "power3.out", delay: 0.15 });
      } else gsap.to(column, { y, duration: MOTION.slow, ease: "power3.out" });
    });
    first.current = false;
  }, [text]);

  return (
    <span ref={root} className={`tabular inline-flex ${className}`} aria-label={text} role="img">
      {chars.map((char, index) => {
        // Key from the right so the ones digit stays the ones digit when the number grows.
        const key = chars.length - index;
        const digit = DIGITS.indexOf(char);
        if (digit === -1) {
          return (
            <span key={`s${key}`} aria-hidden="true">
              {char === "-" ? "−" : char}
            </span>
          );
        }
        return (
          <span key={`d${key}`} aria-hidden="true" className="relative inline-block h-[1em] overflow-hidden leading-none">
            <span className="invisible">0</span>
            <span
              data-digit={digit}
              className="absolute inset-x-0 top-0 flex flex-col"
              style={{ transform: `translateY(${-digit}em)` }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
