"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap, MOTION } from "@/lib/motion/gsap";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number whose digits roll like an odometer when it changes ("104.6" → "113.0"),
 * used for live points. Screen readers get the plain value. The first value is drawn
 * in place (no roll on load); with "reduce motion" digits change without rolling.
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
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    columns.forEach((column) => {
      const y = `${-Number(column.dataset.digit)}em`;
      if (first.current || reduce) gsap.set(column, { y });
      else gsap.to(column, { y, duration: MOTION.slow, ease: "power3.out" });
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
