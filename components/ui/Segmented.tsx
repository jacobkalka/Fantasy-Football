"use client";

import { motion } from "motion/react";
import { useId } from "react";

/** A glass pill switch (e.g. Standard · Half · PPR). The highlight slides between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`glass-chip flex gap-1 rounded-2xl p-1 ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`relative flex-1 rounded-xl px-2.5 py-2 font-mono text-[11px] tracking-[0.06em] whitespace-nowrap uppercase transition-colors ${
              active ? "text-gain" : "text-muted hover:text-ink"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="glass-gain absolute inset-0 rounded-xl"
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                aria-hidden="true"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
