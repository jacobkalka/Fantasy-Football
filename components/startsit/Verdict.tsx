"use client";

import { AnimatePresence, motion } from "motion/react";
import { Skeleton } from "@/components/ui/bits";
import { shortName } from "@/lib/startsit/model";
import type { StartSitResult } from "@/lib/startsit/types";
import { ConfidenceMeter } from "./ConfidenceMeter";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;

/** The answer: "START J. CHASE", how sure we are, and the reasons with their numbers. */
export function Verdict({
  result,
  updating,
  aiSummary,
  aiLoading,
}: {
  result: StartSitResult;
  /** The picks changed and a new answer is on its way. */
  updating: boolean;
  aiSummary: string | null;
  aiLoading: boolean;
}) {
  const rec = result.recommendation;
  const name = (id: string | null) => {
    const p = result.players.find((x) => x.playerId === id);
    return p ? shortName(p.name) : "";
  };

  return (
    <section
      className={`glass flex flex-col gap-5 p-5 transition-opacity duration-300 ${updating ? "opacity-50" : ""}`}
      aria-live="polite"
      aria-busy={updating}
    >
      <p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        Recommendation · Week {result.week} · {FORMAT_LABEL[result.format]}
      </p>

      {!rec ? (
        <p className="font-display text-3xl leading-tight font-bold text-ink-strong uppercase">{result.noRecommendation}</p>
      ) : (
        <>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={rec.startId}
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="font-display leading-[0.88] font-bold uppercase">
                <span className="block text-2xl tracking-[0.2em] text-ink-soft">Start</span>
                <span className="block text-[clamp(2.75rem,14vw,4.5rem)] break-words text-gain [text-shadow:0_0_36px_var(--color-gain)]">
                  {name(rec.startId)}
                </span>
              </h2>
              <p className="mt-2 text-[15px] text-ink-soft">
                over <span className="font-semibold text-ink">{name(rec.overId)}</span>
                {result.players.length > 2 && " (the next-best option)"}
              </p>
            </motion.div>
          </AnimatePresence>

          <ConfidenceMeter key={`${rec.startId}-${rec.confidence}`} confidence={rec.confidence} />

          {(aiSummary || aiLoading) && (
            <div className="glass-chip rounded-2xl p-3.5">
              <p className="font-mono text-[10px] tracking-[0.1em] text-sky uppercase">In plain English</p>
              {aiSummary ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-1.5 text-[15px] leading-relaxed text-ink"
                >
                  {aiSummary}
                </motion.p>
              ) : (
                <div className="mt-2 flex flex-col gap-1.5" aria-label="Writing a summary">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              )}
              <p className="mt-2 font-mono text-[9px] text-muted uppercase">Written by Claude from the numbers below</p>
            </div>
          )}

          <div>
            <h3 className="pb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Why</h3>
            <ol className="flex flex-col gap-2.5">
              {rec.reasons.map((reason, i) => (
                <motion.li
                  key={`${rec.startId}-${reason.key}`}
                  className="flex gap-3"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                >
                  <span className="glass-chip grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] text-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug text-ink-soft">{reason.text}</p>
                    {reason.favors && reason.impact >= 0.05 && (
                      <p
                        className={`mt-1 font-mono text-[10px] uppercase ${
                          reason.favors === rec.startId ? "text-gain" : "text-alert"
                        }`}
                      >
                        {reason.favors === rec.startId ? "▲" : "▼"} Edge {name(reason.favors)} ·{" "}
                        {reason.key === "availability" ? "won't score" : `${reason.impact.toFixed(1)} pts`}
                      </p>
                    )}
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>

          {rec.notes.length > 0 && (
            <div className="rounded-2xl bg-sky/8 p-3.5 ring-1 ring-sky/25">
              <h3 className="font-mono text-[10px] tracking-[0.1em] text-sky uppercase">Good to know</h3>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {rec.notes.map((note) => (
                  <li key={note} className="text-[13px] leading-snug text-ink-soft">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function VerdictSkeleton() {
  return (
    <div className="glass flex flex-col gap-4 p-5" aria-label="Working it out">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
