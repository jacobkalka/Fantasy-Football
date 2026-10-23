"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";

/**
 * A segmented switch (e.g. Standard · Half · PPR). The selected option sits on a raised
 * pill that slides to it. As wide as its options; full width only when asked.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
  size = "md",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = track.current;
    const pill = thumb.current;
    const target = root?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!root || !pill || !target) return;
    const move = { x: target.offsetLeft, width: target.offsetWidth };
    const reduce = prefersReducedMotion();
    if (!placed.current || reduce) {
      gsap.set(pill, move);
      placed.current = true;
    } else {
      gsap.to(pill, { ...move, duration: MOTION.base, ease: "power3.out" });
    }
  }, [value, options]);

  // Keep the pill under its option when the layout width changes.
  useLayoutEffect(() => {
    const root = track.current;
    if (!root) return;
    const observer = new ResizeObserver(() => {
      const target = root.querySelector<HTMLElement>('[aria-checked="true"]');
      if (target && thumb.current) gsap.set(thumb.current, { x: target.offsetLeft, width: target.offsetWidth });
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      className={`relative inline-flex rounded-full bg-surface p-1 ${className}`}
    >
      <span
        ref={thumb}
        className="absolute top-1 bottom-1 left-0 rounded-full bg-well"
        style={{ width: 0 }}
        aria-hidden="true"
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`relative flex-1 rounded-full whitespace-nowrap transition-colors ${ size === "sm" ? "h-7 px-3 text-[13px]" : "h-8 px-3.5 text-[14px]" } ${active ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
