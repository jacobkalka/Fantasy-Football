"use client";

import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { TiltCard } from "@/components/motion/TiltCard";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Skeleton } from "@/components/ui/bits";
import { visibleTeamColor } from "@/lib/color";
import { kickoffLabel } from "@/lib/format";
import type { TeamLite } from "@/lib/live/types";
import type { RosterPlayer } from "@/lib/roster/lineup";
import { shortName, toughnessLabel } from "@/lib/startsit/model";
import type { PlayerVerdict } from "@/lib/startsit/types";
import { RangeBar } from "./RangeBar";

export type CardRole = "start" | "sit" | null;

const STAMP = { bye: "Bye", "no-game": "No game", out: "Out" } as const;

/** "Easy matchup" / "Tough matchup" in words, so it never relies on color. */
function MatchupChip({ verdict, compact }: { verdict: PlayerVerdict; compact: boolean }) {
  const m = verdict.matchup;
  if (!m) return null;
  const easy = m.rank > m.teams * 0.7;
  const tough = m.rank <= m.teams * 0.3;
  const word = easy ? "Easy" : tough ? "Tough" : "Average";
  const label = compact ? word : `${word} matchup`;
  const rank = toughnessLabel(m.rank, m.teams).replace("the ", "");
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-tight ring-1 ${
        easy ? "bg-gain/10 text-gain ring-gain/30" : tough ? "bg-loss/10 text-loss ring-loss/30" : "text-muted ring-line"
      }`}
      title={`${m.opponentAbbr} is ${toughnessLabel(m.rank, m.teams)} defense against ${verdict.position}s`}
    >
      {label}
      <span className="block text-[9px] whitespace-nowrap opacity-80">{compact ? rank : `${rank} vs ${verdict.position}`}</span>
    </span>
  );
}

/**
 * One side of the head-to-head: headshot in a team-color ring, the model's number,
 * floor/ceiling and the matchup. The recommended player glows lime and lifts forward.
 */
export function VersusCard({
  player,
  verdict,
  team,
  role,
  scaleMax,
  compact,
}: {
  player: RosterPlayer;
  verdict?: PlayerVerdict;
  team?: TeamLite;
  role: CardRole;
  /** Shared scale for the floor/ceiling bars. */
  scaleMax: number;
  /** Three players side by side: smaller type. */
  compact: boolean;
}) {
  const color = visibleTeamColor(team);
  const winner = role === "start";
  const game = verdict?.game;
  return (
    <motion.div
      className="relative"
      animate={{ y: winner ? -10 : 0, scale: winner ? 1.03 : role === "sit" ? 0.97 : 1, opacity: role === "sit" ? 0.8 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      {/* A soft lime aura behind the recommended player. */}
      <AnimatePresence>
        {winner && (
          <motion.div
            className="pointer-events-none absolute -inset-1 rounded-[1.75rem] bg-gain/25 blur-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <TiltCard
        max={9}
        className={`glass flex h-full flex-col items-center gap-2 text-center transition-shadow ${
          compact ? "px-2 pt-3 pb-3" : "px-3 pt-4 pb-4"
        } ${winner ? "ring-1 ring-gain/60" : ""}`}
        style={{ "--glow": winner ? "var(--color-gain)" : `${color}55` } as React.CSSProperties}
      >
        <div className="flex h-5 items-center justify-center gap-1.5" style={{ transform: "translateZ(30px)" }}>
          <AnimatePresence mode="popLayout">
            {role && (
              <motion.span
                key={role}
                initial={{ opacity: 0, y: -6, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] ${
                  winner ? "glass-gain text-gain" : "glass-chip text-muted"
                }`}
              >
                {winner ? "START" : "SIT"}
              </motion.span>
            )}
          </AnimatePresence>
          <InjuryBadge status={verdict?.injuryStatus ?? undefined} />
        </div>

        <div style={{ transform: "translateZ(40px)" }}>
          <PlayerAvatar name={player.name} headshot={player.headshot} teamColor={color} size={compact ? 56 : 76} />
        </div>

        <div className="w-full min-w-0">
          <h3
            className={`truncate font-display leading-none font-bold tracking-wide text-ink-strong uppercase ${compact ? "text-lg" : "text-2xl"}`}
            title={player.name}
          >
            {shortName(player.name)}
          </h3>
          <p className="mt-1 truncate font-mono text-[10px] text-muted uppercase">
            {player.position} · {team?.abbr ?? "FA"}
            {game && (
              <>
                {" "}
                {game.isHome ? "vs" : "@"} {game.opponentAbbr}
              </>
            )}
          </p>
          {game && <p className="truncate font-mono text-[10px] text-muted">{kickoffLabel(game.kickoff)}</p>}
        </div>

        {!verdict ? (
          <div className="flex w-full flex-col items-center gap-2 py-1">
            <Skeleton className="h-12 w-20" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : !verdict.playing ? (
          <div className="flex flex-col items-center gap-1 py-1">
            <span className="-rotate-6 rounded-lg border-2 border-loss-line px-3 py-0.5 font-display text-3xl font-bold tracking-wider text-loss uppercase">
              {STAMP[verdict.unavailable ?? "no-game"]}
            </span>
            <span className="font-mono text-[10px] text-muted uppercase">Scores 0 · auto sit</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center" style={{ transform: "translateZ(50px)" }}>
              {/* drop-shadow (not text-shadow): the rolling digits are clipped boxes, and a text-shadow would light up the whole box. */}
              <span
                className={`font-display leading-[0.85] font-bold ${compact ? "text-5xl" : "text-6xl"} ${
                  winner ? "text-gain [filter:drop-shadow(0_0_14px_var(--color-gain))]" : "text-ink-strong"
                }`}
              >
                <AnimatedNumber value={verdict.score} />
              </span>
              <span className="mt-1 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
                Proj pts
                {verdict.projection !== null && Math.abs(verdict.projection - verdict.score) >= 0.05 && (
                  <span className="block normal-case">ESPN {verdict.projection.toFixed(1)}</span>
                )}
              </span>
            </div>
            <RangeBar floor={verdict.floor} ceiling={verdict.ceiling} score={verdict.score} max={scaleMax} />
            <MatchupChip verdict={verdict} compact={compact} />
          </>
        )}
      </TiltCard>
    </motion.div>
  );
}
