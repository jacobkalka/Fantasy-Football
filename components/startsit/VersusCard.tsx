"use client";

import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { Pill } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Skeleton } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { kickoffLabel } from "@/lib/format";
import type { TeamLite } from "@/lib/live/types";
import { shortName, toughnessLabel } from "@/lib/startsit/model";
import type { PlayerVerdict } from "@/lib/startsit/types";
import type { Pickable } from "./PlayerPicker";
import { RangeBar } from "./RangeBar";

export type CardRole = "start" | "sit" | null;

const STAMP = { bye: "Bye week", "no-game": "No game", out: "Out" } as const;

/** "Easy matchup" / "Tough matchup" in words, so it never relies on colour. */
function MatchupLine({ verdict }: { verdict: PlayerVerdict }) {
  const m = verdict.matchup;
  if (!m) return <p className="text-[12px] text-faint">Matchup data not available yet</p>;
  const easy = m.rank > m.teams * 0.7;
  const tough = m.rank <= m.teams * 0.3;
  return (
    <p className="text-[12px] leading-4 text-muted" title={`${m.opponentAbbr} is ${toughnessLabel(m.rank, m.teams)} defense against ${verdict.position}s`}>
      <span className={easy ? "text-positive" : tough ? "text-negative" : "text-ink"}>
        {easy ? "Easy" : tough ? "Tough" : "Average"} matchup
      </span>
      <span className="block text-faint">
        {toughnessLabel(m.rank, m.teams).replace("the ", "")} vs {verdict.position}
      </span>
    </p>
  );
}

/**
 * One side of the head-to-head: who, the model's number, floor/ceiling and the
 * matchup. The recommended player's card is raised one step and labelled Start.
 */
export function VersusCard({
  player,
  verdict,
  team,
  role,
  scaleMax,
  compact,
}: {
  player: Pickable;
  verdict?: PlayerVerdict;
  team?: TeamLite;
  role: CardRole;
  /** Shared scale for the floor/ceiling bars. */
  scaleMax: number;
  /** Three players side by side: smaller type. */
  compact: boolean;
}) {
  const winner = role === "start";
  const game = verdict?.game;
  return (
    <article
      className={`flex h-full flex-col gap-3 rounded-[var(--radius-card)] transition-colors duration-300 ${
        compact ? "p-3" : "p-4"
      } ${winner ? "bg-well" : "bg-surface"}`}
      aria-label={`${player.name}${role ? `, ${role === "start" ? "start" : "sit"}` : ""}`}
    >
      <div className="flex h-[22px] flex-wrap items-center gap-1.5">
        {role && <Pill tone={winner ? "positive" : "neutral"}>{winner ? "Start" : "Sit"}</Pill>}
        {!player.onRoster && <Pill tone="warning">{compact ? "Not yours" : "Not on your team"}</Pill>}
        <InjuryBadge status={verdict?.injuryStatus ?? undefined} />
      </div>

      <div className={`flex gap-3 ${compact ? "flex-col items-start" : "flex-col items-start sm:flex-row sm:items-center"}`}>
        <PlayerAvatar name={player.name} headshot={player.headshot} teamColor={visibleTeamColor(team)} size={compact ? 44 : 52} />
        <div className="min-w-0">
          <h3 className={`truncate font-semibold ${compact ? "text-[14px]" : "text-[16px]"}`} title={player.name}>
            {shortName(player.name)}
          </h3>
          <p className="truncate text-[12px] text-muted">
            {player.position} · {team?.abbr ?? "FA"}
            {game && ` ${game.isHome ? "vs" : "@"} ${game.opponentAbbr}`}
          </p>
          {game && <p className="truncate text-[12px] text-faint">{kickoffLabel(game.kickoff)}</p>}
        </div>
      </div>

      {!verdict ? (
        <div className="flex flex-col gap-2 py-1">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ) : !verdict.playing ? (
        <div className="py-1">
          <p className="text-[20px] font-semibold text-negative">{STAMP[verdict.unavailable ?? "no-game"]}</p>
          <p className="text-[12px] text-muted">Scores 0 · automatic sit</p>
        </div>
      ) : (
        <>
          <div>
            <p
              className={`leading-none font-semibold tracking-[-0.02em] ${compact ? "text-[28px]" : "text-[34px]"} ${
                winner ? "text-accent" : "text-ink"
              }`}
            >
              <AnimatedNumber value={verdict.score} />
            </p>
            <p className="tabular mt-1 text-[12px] text-faint">
              projected pts
              {verdict.projection !== null && Math.abs(verdict.projection - verdict.score) >= 0.05 && (
                <> · ESPN {verdict.projection.toFixed(1)}</>
              )}
            </p>
          </div>
          <RangeBar floor={verdict.floor} ceiling={verdict.ceiling} score={verdict.score} max={scaleMax} />
          <MatchupLine verdict={verdict} />
        </>
      )}
    </article>
  );
}
