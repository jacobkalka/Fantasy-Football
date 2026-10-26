"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/States";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import { shortName } from "@/lib/startsit/model";
import type { StartSitResult } from "@/lib/startsit/types";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { PlayerLink } from "@/components/player/PlayerLink";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;

/**
 * The answer: "Start J. Chase over T. McLaurin", how sure we are, and the reasons with
 * their numbers. When a player in the comparison isn't on your team, it says what that
 * means (you'd have to pick him up first), and never implies he's yours.
 */
export function Verdict({
  result,
  updating,
  aiSummary,
  aiLoading,
  outsideIds,
}: {
  result: StartSitResult;
  /** The picks changed and a new answer is on its way. */
  updating: boolean;
  aiSummary: string | null;
  aiLoading: boolean;
  /** Players in the comparison who aren't on the user's roster. */
  outsideIds: string[];
}) {
  const rec = result.recommendation;
  const root = useRef<HTMLDivElement>(null);
  const name = (id: string | null) => {
    const p = result.players.find((x) => x.playerId === id);
    return p ? shortName(p.name) : "";
  };

  // A new pick slides in; the reasons follow one after another.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-answer]", { autoAlpha: 0, y: 12, duration: 0.3, clearProps: "all" });
      gsap.from("[data-reason]", { autoAlpha: 0, y: 8, duration: 0.24, stagger: 0.05, delay: 0.1, clearProps: "all" });
    },
    { scope: root, dependencies: [rec?.startId, rec?.overId] },
  );

  const startIsOutside = rec ? outsideIds.includes(rec.startId) : false;
  const overIsOutside = rec ? outsideIds.includes(rec.overId) : false;

  return (
    <Card
      as="section"
      className={`flex flex-col gap-5 transition-opacity duration-300 ${updating ? "opacity-50" : ""}`}
      aria-live="polite"
      aria-busy={updating}
    >
      <div ref={root} className="flex flex-col gap-5">
        <p className="text-[13px] text-muted">
          Recommendation · Week {result.week} · {FORMAT_LABEL[result.format]}
        </p>

        {!rec ? (
          <p className="text-[20px] leading-7 font-semibold">{result.noRecommendation}</p>
        ) : (
          <>
            <div data-answer="">
              <h2 className="text-[28px] leading-9 font-semibold tracking-[-0.015em]">
                Start{" "}
                <PlayerLink id={rec.startId} className="text-accent hover:underline">
                  {name(rec.startId)}
                </PlayerLink>
              </h2>
              <p className="mt-1 text-[15px] text-muted">
                over{" "}
                <PlayerLink id={rec.overId} className="text-ink hover:underline">
                  {name(rec.overId)}
                </PlayerLink>
                {result.players.length > 2 && " (the next-best option)"}
              </p>
            </div>

            {(startIsOutside || overIsOutside) && (
              <p className="rounded-xl bg-warning-soft px-4 py-3 text-[14px] leading-5 text-warning">
                {startIsOutside
                  ? `${name(rec.startId)} isn't on your team. To start him you'd need to pick him up first (if he's available in your league) and drop someone.`
                  : `${name(rec.overId)} isn't on your team, and your player is the better start this week. No need to chase him.`}
              </p>
            )}

            <ConfidenceMeter confidence={rec.confidence} />

            {(aiSummary || aiLoading) && (
              <div className="rounded-[var(--radius-inner)] bg-raised p-4">
                <p className="text-[13px] font-medium text-muted">In plain English</p>
                {aiSummary ? (
                  <p className="mt-1.5 text-[15px] leading-6">{aiSummary}</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-1.5" aria-label="Writing a summary">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                )}
                <p className="mt-2 text-[12px] text-faint">Written by Claude from the numbers below</p>
              </div>
            )}

            <div>
              <h3 className="mb-3 text-[15px] font-semibold">Why</h3>
              <ol className="flex flex-col gap-3">
                {rec.reasons.map((reason, i) => (
                  <li key={`${rec.startId}-${reason.key}`} data-reason="" className="flex gap-3">
                    <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-well text-[12px] text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-5">{reason.text}</p>
                      {reason.favors && reason.impact >= 0.05 && (
                        <p
                          className={`tabular mt-0.5 text-[12px] ${
                            reason.favors === rec.startId ? "text-positive" : "text-warning"
                          }`}
                        >
                          Edge {name(reason.favors)} ·{" "}
                          {reason.key === "availability" ? "won't score" : `${reason.impact.toFixed(1)} pts`}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {rec.notes.length > 0 && (
              <div className="rounded-[var(--radius-inner)] bg-raised p-4">
                <h3 className="text-[13px] font-medium text-muted">Good to know</h3>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {rec.notes.map((note) => (
                    <li key={note} className="text-[14px] leading-5">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export function VerdictSkeleton() {
  return (
    <Card className="flex flex-col gap-4" aria-label="Working it out">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </Card>
  );
}
