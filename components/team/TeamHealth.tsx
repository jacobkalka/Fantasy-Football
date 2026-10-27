"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { slotLabel, type StartingSlot } from "@/lib/analysis/settings";
import { SLOT_ORDER } from "@/lib/analysis/settings";
import type { TeamRating, Weakness } from "@/lib/analysis";
import { gradeLabel } from "@/lib/analysis/scale";

const TONE: Record<string, "negative" | "warning" | "neutral"> = { High: "negative", Medium: "warning", Low: "neutral" };

/** One hue for the whole chart; the number and the average line carry the meaning. */
function barColor() {
  return "var(--color-chart-1)";
}

/**
 * Team health: the 0-100 rating (50 = an average team in a league your size), each starting
 * spot's strength as a bar, the biggest weakness and strongest spot in words, and the moves
 * that would fix things. All from lib/analysis (rest-of-season projections + real results).
 */
export function TeamHealth({
  rating,
  weaknesses,
  loading,
  error,
  onRetry,
  compact = false,
}: {
  rating: TeamRating | null;
  weaknesses: Weakness[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  compact?: boolean;
}) {
  if (error && !rating) return <ErrorState what="Couldn't load player projections to rate your team." onRetry={onRetry} />;
  if (!rating) {
    return loading ? (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-inner)]" />
      </div>
    ) : (
      <p className="text-[14px] text-muted">Add players to see how your team rates.</p>
    );
  }
  const slots = SLOT_ORDER.filter((s) => rating.grades[s] && rating.grades[s].score !== null) as StartingSlot[];
  const graded = slots.map((s) => ({ slot: s, score: rating.grades[s].score ?? 0, grade: rating.grades[s] }));
  const strongest = [...graded].sort((a, b) => b.score - a.score)[0];
  const top = weaknesses[0];
  const concerns = weaknesses.filter((w) => w.area === "INJURIES" || w.area === "BYES");

  return (
    <div className="@container flex flex-col gap-4">
      {/* A narrow card (phone, desktop side column): the rating, then the two tiles in their own row. A wide card: side by side. */}
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-end @lg:gap-6">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">Team rating</p>
          <p className="flex items-baseline gap-2">
            <span className="text-accent text-[40px] leading-[44px] font-semibold tracking-[-0.03em]">{rating.overall.toFixed(1)}</span>
            <span className="text-[14px] font-medium text-ink">{rating.label}</span>
          </p>
          <p className="text-[12px] text-faint">50 = an average team in your league</p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 @lg:min-w-[260px] @lg:flex-1">
          {strongest && (
            <div className="well min-w-0 p-3">
              <p className="flex items-center gap-1 text-[12px] whitespace-nowrap text-positive">
                <Icon name="arrowUp" size={14} /> Strongest
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{slotLabel(strongest.slot)}</p>
              <p className="text-[11px] text-faint">{gradeLabel(strongest.score)}</p>
            </div>
          )}
          {top && (
            <div className="well min-w-0 p-3">
              <p className="flex items-center gap-1 text-[12px] whitespace-nowrap text-negative">
                <Icon name="arrowDown" size={14} /> Biggest need
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{top.fix?.positions.map((p) => slotLabel(p)).join("/") || top.title}</p>
              <p className="text-[11px] text-faint">{top.priority} priority</p>
            </div>
          )}
        </div>
      </div>

      {/* Position strength: one bar per starting spot, 0-100 with the average marked. */}
      <div className="flex flex-col gap-1.5" role="list" aria-label="Strength by position, 0 to 100, 50 is average">
        {graded.map(({ slot, score, grade }) => (
          <div key={slot} role="listitem" className="flex items-center gap-3 text-[12px]" title={grade.why}>
            <span className="w-11 shrink-0 font-semibold text-muted">{slotLabel(slot)}</span>
            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-well">
              <span className="absolute inset-y-0 left-1/2 w-px bg-white/25" aria-hidden="true" />
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, score)}%`, background: barColor() }} />
            </span>
            <span className="tabular w-9 text-right font-medium text-ink">{Math.round(score)}</span>
          </div>
        ))}
      </div>

      {!compact && weaknesses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {weaknesses.slice(0, 4).map((w) => (
            <li key={w.area + w.title} className="well flex flex-col gap-1 p-3">
              <div className="flex items-center gap-2">
                <Pill tone={TONE[w.priority]}>{w.priority}</Pill>
                <p className="text-[14px] font-medium">{w.title}</p>
              </div>
              <p className="text-[13px] leading-5 text-muted">{w.why}</p>
              {w.fix && (
                <p className="text-[13px] leading-5 text-ink">
                  <span className="text-accent">Fix: </span>
                  {w.fix.text}{" "}
                  {w.fix.positions.length > 0 && w.area !== "INJURIES" && (
                    <>
                      <Link href={`/team/pickups?pos=${w.fix.positions[0]}`} className="text-accent hover:underline">
                        Find a pickup
                      </Link>{" "}
                      ·{" "}
                      <Link href="/team/trades" className="text-accent hover:underline">
                        Trade for one
                      </Link>
                    </>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {compact && concerns.length > 0 && <p className="text-[13px] text-warning">{concerns.map((c) => c.title).join(" · ")}</p>}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/team/pickups" icon="plus" size="sm">
            Pickups
          </ButtonLink>
          <ButtonLink href="/team/trades" icon="trades" size="sm">
            Trade ideas
          </ButtonLink>
        </div>
      )}
      {!compact && (
        <details className="text-[12px] text-faint">
          <summary className="cursor-pointer">How the rating works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {rating.method.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
