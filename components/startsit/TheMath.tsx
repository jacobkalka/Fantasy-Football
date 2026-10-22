"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { shortName } from "@/lib/startsit/model";
import type { PlayerVerdict } from "@/lib/startsit/types";

function pts(value: number) {
  if (Math.abs(value) < 0.05) return "0.0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

/** "How the numbers add up": every factor for every player, with what it was worth. */
export function TheMath({ players }: { players: PlayerVerdict[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="glass p-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between rounded-[1.4rem] px-4 py-3 font-mono text-[11px] tracking-[0.1em] text-ink uppercase"
      >
        How the numbers add up
        <motion.span animate={{ rotate: open ? 180 : 0 }} aria-hidden="true" className="text-muted">
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
              {players.map((p) => {
                const inputs = p.factors.filter((f) => f.key !== "availability");
                const known = inputs.filter((f) => f.available && f.key !== "weather").length;
                const total = inputs.filter((f) => f.key !== "weather").length;
                return (
                  <div key={p.playerId}>
                    <div className="flex items-baseline justify-between border-b border-line pb-1.5">
                      <h3 className="font-display text-xl font-bold tracking-wide text-ink-strong uppercase">{shortName(p.name)}</h3>
                      <span className="font-display text-2xl font-bold text-ink-strong">{p.score.toFixed(1)}</span>
                    </div>
                    <dl className="mt-2 flex flex-col gap-2">
                      {p.factors.map((f) => (
                        <div key={f.key} className={f.available ? "" : "opacity-60"}>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="font-mono text-[11px] text-muted uppercase">{f.label}</dt>
                            <dd
                              className={`font-mono text-[12px] ${
                                f.key === "projection" || !f.available
                                  ? "text-ink"
                                  : f.points > 0.04
                                    ? "text-gain"
                                    : f.points < -0.04
                                      ? "text-loss"
                                      : "text-muted"
                              }`}
                            >
                              {f.key === "projection" ? f.points.toFixed(1) : f.key === "availability" ? "0.0" : f.available ? pts(f.points) : "n/a"}
                            </dd>
                          </div>
                          <p className="text-[12px] leading-snug text-ink-soft">{f.detail}</p>
                        </div>
                      ))}
                    </dl>
                    {p.playing && (
                      <p className="mt-2 font-mono text-[10px] text-muted uppercase">
                        {known} of {total} inputs had data
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-[12px] leading-relaxed text-muted">
                We start from ESPN&apos;s projection and nudge it by small, capped amounts: matchup up to ±8%, recent form
                ±6%, Vegas game total ±6%, weather (passing only) and injury risk. Floor and ceiling show a typical bad and
                good week.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
