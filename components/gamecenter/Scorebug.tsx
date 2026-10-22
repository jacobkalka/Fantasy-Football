"use client";

import { motion } from "motion/react";
import { ViewTransition } from "react";
import { Football } from "@/components/games/Football";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { TiltCard } from "@/components/motion/TiltCard";
import { LiveDot } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { visibleTeamColor } from "@/lib/color";
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
      <span style={{ transform: "translateZ(40px)" }}>
        <TeamLogo abbr={side.team.abbr} logo={side.team.logo} color={side.team.color} size={58} />
      </span>
      <div className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="font-display text-2xl leading-none font-bold tracking-wide">{side.team.abbr}</span>
        {hasBall && <Football />}
      </div>
      {side.record && <span className="font-mono text-[10px] text-muted">{side.record}</span>}
      {showScore && (
        <span
          className={`font-display text-[64px] leading-[0.85] font-bold ${leading ? "text-ink-strong" : "text-muted"}`}
          style={{ transform: "translateZ(30px)" }}
        >
          <AnimatedNumber value={score} decimals={0} />
        </span>
      )}
    </div>
  );
}

/** The big score header. It morphs out of the game's card on the Games screen. */
export function Scorebug({ game, state }: { game: Game; state: ScoreState }) {
  const hydrated = useHydrated();
  const showScore = game.state !== "pre" || state.replay;
  const glowTeam = state.possessionTeamId === game.away.team.id ? game.away.team : game.home.team;
  const glow = state.isRedZone ? "#ff4d5e" : state.live ? visibleTeamColor(glowTeam) : "transparent";
  return (
    <TiltCard className="glass p-5" max={6} style={{ "--glow": `${glow}cc` } as React.CSSProperties}>
      <ViewTransition name={`game-${game.id}`} share="morph" default="none">
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
              <span className="rounded-md bg-sky/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] text-sky ring-1 ring-sky/40">
                REPLAY
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 font-mono text-[12px] tracking-[0.06em] uppercase ${
                state.live ? "text-gain" : "text-ink-soft"
              }`}
            >
              {state.live && <LiveDot />}
              {game.state === "pre" && !state.replay && hydrated ? kickoffLabel(game.kickoff) : state.status}
            </span>
            {state.live && state.downDistance && (
              <span className="font-mono text-[11px] leading-snug text-muted">{state.downDistance}</span>
            )}
            {state.isRedZone && state.live && (
              <motion.span
                className="rounded-md bg-redzone/20 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] text-redzone ring-1 ring-redzone/50"
                animate={{ opacity: [1, 0.55, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                RED ZONE
              </motion.span>
            )}
            {game.state === "pre" && game.odds?.details && (
              <span className="font-mono text-[11px] text-muted">
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
      </ViewTransition>
      {(game.venue || game.broadcast) && (
        <p className="mt-4 border-t border-line-soft pt-3 text-center font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
          {[game.venue?.name, game.venue?.city, game.broadcast, game.weather?.temperature !== undefined && !game.venue?.indoor ? `${game.weather.temperature}°` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </TiltCard>
  );
}

