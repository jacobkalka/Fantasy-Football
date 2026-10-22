"use client";

import { motion } from "motion/react";
import { Football } from "@/components/games/Football";
import { visibleTeamColor } from "@/lib/color";
import type { FieldPosition } from "@/lib/live/game-view";
import type { Team } from "@/lib/providers/types";

const spring = { type: "spring" as const, stiffness: 120, damping: 20 };

/** Who's likely to win, as a two-color bar that slides as the game swings. */
export function WinProbabilityBar({ away, home, homeWinPct }: { away: Team; home: Team; homeWinPct: number }) {
  const homePct = Math.round(homeWinPct * 100);
  const awayPct = 100 - homePct;
  return (
    <div className="glass flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.06em] uppercase">
        <span className={awayPct >= homePct ? "text-ink-strong" : "text-muted"}>
          {away.abbr} {awayPct}%
        </span>
        <span className="text-muted">Win probability</span>
        <span className={homePct > awayPct ? "text-ink-strong" : "text-muted"}>
          {homePct}% {home.abbr}
        </span>
      </div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-white/5 ring-1 ring-line"
        role="img"
        aria-label={`${away.abbr} ${awayPct} percent, ${home.abbr} ${homePct} percent chance to win`}
      >
        <motion.div
          className="h-full"
          style={{ background: visibleTeamColor(away), boxShadow: `0 0 16px ${visibleTeamColor(away)}` }}
          initial={false}
          animate={{ width: `${awayPct}%` }}
          transition={spring}
        />
        <motion.div
          className="h-full flex-1"
          style={{ background: visibleTeamColor(home), boxShadow: `0 0 16px ${visibleTeamColor(home)}` }}
        />
      </div>
    </div>
  );
}

/** A side-on field with the ball where it is right now. Away goal on the left, home goal on the right. */
export function FieldBar({ away, home, field }: { away: Team; home: Team; field: FieldPosition }) {
  const attackingHome = field.possessionTeamId === away.id; // the away offense drives toward the home goal
  const yardsToGo = attackingHome ? 100 - field.ballOn : field.ballOn;
  const redZone = yardsToGo <= 20;
  return (
    <div className="glass flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        <span>Ball on the field</span>
        <span className={redZone ? "text-redzone" : ""}>{yardsToGo} yds to the end zone</span>
      </div>
      <div className="relative h-12 overflow-hidden rounded-xl ring-1 ring-line" style={{ perspective: 400 }}>
        <div
          className="absolute inset-0"
          style={{
            transform: "rotateX(28deg)",
            transformOrigin: "50% 100%",
            background:
              "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.14) 0 1px, transparent 1px 10%), linear-gradient(180deg, #123a1e, #0c2a15)",
          }}
        >
          <div className="absolute inset-y-0 left-0 w-[8%]" style={{ background: `${visibleTeamColor(away)}99` }} />
          <div className="absolute inset-y-0 right-0 w-[8%]" style={{ background: `${visibleTeamColor(home)}99` }} />
          {/* Red zone shading near the goal the offense is attacking. */}
          {redZone && (
            <div
              className={`absolute inset-y-0 w-[17%] bg-redzone/20 ${attackingHome ? "right-[8%]" : "left-[8%]"}`}
              aria-hidden="true"
            />
          )}
        </div>
        <motion.div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_8px_rgb(255_255_255/0.6)]"
          initial={false}
          animate={{ left: `${8 + field.ballOn * 0.84}%` }}
          transition={spring}
        >
          <Football />
        </motion.div>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted">
        <span>{away.abbr} goal</span>
        <span>50</span>
        <span>{home.abbr} goal</span>
      </div>
    </div>
  );
}
