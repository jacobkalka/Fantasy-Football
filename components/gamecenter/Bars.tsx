"use client";

import { Football } from "@/components/games/Football";
import { useTweenTo } from "@/components/motion/useTweenTo";
import { visibleTeamColor } from "@/lib/color";
import type { FieldPosition } from "@/lib/live/game-view";
import type { Team } from "@/lib/providers/types";

/** Who's likely to win, as a two-color bar that slides as the game swings. */
export function WinProbabilityBar({ away, home, homeWinPct }: { away: Team; home: Team; homeWinPct: number }) {
  const homePct = Math.round(homeWinPct * 100);
  const awayPct = 100 - homePct;
  const bar = useTweenTo<HTMLDivElement>({ width: `${awayPct}%` }, [awayPct]);
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between text-[12px]">
        <span className={`tabular ${awayPct >= homePct ? "text-ink" : "text-muted"}`}>
          {away.abbr} {awayPct}%
        </span>
        <span className="text-muted">Win probability</span>
        <span className={`tabular ${homePct > awayPct ? "text-ink" : "text-muted"}`}>
          {homePct}% {home.abbr}
        </span>
      </div>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-well"
        role="img"
        aria-label={`${away.abbr} ${awayPct} percent, ${home.abbr} ${homePct} percent chance to win`}
      >
        <div ref={bar} className="h-full rounded-l-full" style={{ background: visibleTeamColor(away) }} />
        <div className="h-full flex-1 rounded-r-full" style={{ background: visibleTeamColor(home) }} />
      </div>
    </div>
  );
}

/** A side-on field with the ball where it is right now. Away goal on the left, home goal on the right. */
export function FieldBar({ away, home, field }: { away: Team; home: Team; field: FieldPosition }) {
  const attackingHome = field.possessionTeamId === away.id; // the away offense drives toward the home goal
  const yardsToGo = attackingHome ? 100 - field.ballOn : field.ballOn;
  const redZone = yardsToGo <= 20;
  const ball = useTweenTo<HTMLDivElement>({ left: `${8 + field.ballOn * 0.84}%` }, [field.ballOn]);
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>Ball on the field</span>
        <span className={redZone ? "text-negative" : ""}>{yardsToGo} yds to the end zone</span>
      </div>
      <div className="relative h-12 overflow-hidden rounded-xl" style={{ perspective: 400 }}>
        <div
          className="absolute inset-0"
          style={{ transform: "rotateX(28deg)", transformOrigin: "50% 100%", background: "var(--color-well)" }}
        >
          {/* Yard lines every 10 yards on the nested-panel grey (no green turf: colour is for data). */}
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} aria-hidden="true" className="absolute inset-y-0 w-px bg-control" style={{ left: `${8 + (i + 1) * 8.4}%` }} />
          ))}
          <div className="absolute inset-y-0 left-0 w-[8%]" style={{ background: `${visibleTeamColor(away)}99` }} />
          <div className="absolute inset-y-0 right-0 w-[8%]" style={{ background: `${visibleTeamColor(home)}99` }} />
          {/* Red zone shading near the goal the offense is attacking. */}
          {redZone && (
            <div
              className={`absolute inset-y-0 w-[17%] bg-negative-soft ${attackingHome ? "right-[8%]" : "left-[8%]"}`}
              aria-hidden="true"
            />
          )}
        </div>
        <div ref={ball} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Football />
        </div>
      </div>
      <div className="flex justify-between text-[12px] text-muted">
        <span>{away.abbr} goal</span>
        <span>50</span>
        <span>{home.abbr} goal</span>
      </div>
    </div>
  );
}
