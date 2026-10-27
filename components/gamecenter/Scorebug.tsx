"use client";

import { Football } from "@/components/games/Football";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { LiveDot } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import type { Game, GameSide } from "@/lib/providers/types";

export interface ScoreState {
  awayScore: number;
  homeScore: number;
  /** "Q3 4:12", "Final", "Sun 1:00 PM"... */
  status: string;
  live: boolean;
  replay: boolean;
  possessionTeamId?: string;
  downDistance?: string;
  isRedZone: boolean;
}

export function scoreStateFor(game: Game): ScoreState {
  return {
    awayScore: game.away.score,
    homeScore: game.home.score,
    status: game.statusText,
    live: game.state === "in",
    replay: false,
    possessionTeamId: game.situation?.possessionTeamId,
    downDistance: game.situation?.downDistance,
    isRedZone: game.situation?.isRedZone ?? false,
  };
}

function Side({ side, score, showScore, leading, hasBall, align }: {
  side: GameSide;
  score: number;
  showScore: boolean;
  leading: boolean;
  hasBall: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`flex flex-col gap-2 ${align === "right" ? "items-end text-right" : "items-start"}`}>
      <TeamLogo abbr={side.team.abbr} logo={side.team.logo} color={side.team.color} size={58} />
      <div className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="text-[18px] leading-6 font-semibold">{side.team.abbr}</span>
        {hasBall && <Football />}
      </div>
      {side.record && <span className="text-[12px] text-muted">{side.record}</span>}
      {showScore && (
        <span
          className={`tabular text-[44px] leading-[48px] font-semibold tracking-[-0.02em] ${leading ? "text-ink" : "text-muted"}`}
        >
          <AnimatedNumber value={score} decimals={0} />
        </span>
      )}
    </div>
  );
}

/** The big score header: both teams, the score, the clock, and who has the ball. */
export function Scorebug({ game, state }: { game: Game; state: ScoreState }) {
  const hydrated = useHydrated();
  const showScore = game.state !== "pre" || state.replay;
  return (
    <div className="card p-5">
      <>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <Side
            side={game.away}
            score={state.awayScore}
            showScore={showScore}
            leading={state.awayScore > state.homeScore}
            hasBall={state.live && state.possessionTeamId === game.away.team.id}
            align="left"
          />
          <div className="flex min-w-24 flex-col items-center gap-2 pt-4 text-center">
            {state.replay && (
              <span className="rounded-md bg-well px-2 py-0.5 text-[12px] font-semibold text-muted">
                REPLAY
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] ${state.live ? "text-live" : "text-muted"}`}
            >
              {state.live && <LiveDot />}
              {game.state === "pre" && !state.replay && hydrated ? kickoffLabel(game.kickoff) : state.status}
            </span>
            {state.live && state.downDistance && (
              <span className="text-[12px] leading-snug text-muted">{state.downDistance}</span>
            )}
            {state.isRedZone && state.live && (
              <span className="rounded-md bg-negative-soft px-2 py-0.5 text-[12px] font-semibold text-negative">RED ZONE</span>
            )}
            {game.state === "pre" && game.odds?.details && (
              <span className="text-[12px] text-muted">
                {game.odds.details}
                {game.odds.overUnder ? ` · O/U ${game.odds.overUnder}` : ""}
              </span>
            )}
          </div>
          <Side
            side={game.home}
            score={state.homeScore}
            showScore={showScore}
            leading={state.homeScore > state.awayScore}
            hasBall={state.live && state.possessionTeamId === game.home.team.id}
            align="right"
          />
        </div>
      </>
      {(game.venue || game.broadcast) && (
        <p className="mt-4 border-t border-rule pt-3 text-center text-[12px] text-muted">
          {[game.venue?.name, game.venue?.city, game.broadcast, game.weather?.temperature !== undefined && !game.venue?.indoor ? `${game.weather.temperature}°` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

