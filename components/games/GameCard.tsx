"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { TiltCard } from "@/components/motion/TiltCard";
import { LiveDot } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import type { Game, GameSide } from "@/lib/providers/types";
import { Football } from "./Football";

function SideRow({
  side,
  hasBall,
  leading,
  showScore,
}: {
  side: GameSide;
  hasBall: boolean;
  leading: boolean;
  showScore: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ transform: "translateZ(28px)" }}>
        <TeamLogo abbr={side.team.abbr} logo={side.team.logo} color={side.team.color} size={38} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`font-display text-2xl leading-none font-bold tracking-wide ${
            leading || !showScore ? "text-ink-strong" : "text-muted"
          }`}
        >
          {side.team.abbr}
        </span>
        {side.record && <span className="font-mono text-[10px] text-muted">{side.record}</span>}
        {hasBall && <Football />}
      </div>
      {showScore && (
        <span
          className={`font-display text-4xl leading-none font-bold ${leading ? "text-ink-strong" : "text-muted"}`}
          style={{ transform: "translateZ(20px)" }}
        >
          <AnimatedNumber value={side.score} decimals={0} />
        </span>
      )}
    </div>
  );
}

/** A game on the scoreboard: a glass card that tilts toward your finger and opens Game Center. */
export function GameCard({ game }: { game: Game }) {
  const hydrated = useHydrated();
  const live = game.state === "in";
  const showScore = game.state !== "pre";
  const possession = game.situation?.possessionTeamId;
  const redZone = live && game.situation?.isRedZone;
  const homeLeads = game.home.score > game.away.score;
  const awayLeads = game.away.score > game.home.score;
  const glowTeam = possession === game.away.team.id ? game.away.team : game.home.team;

  const status = live ? (
    <span className="inline-flex items-center gap-1.5 text-gain">
      <LiveDot />
      {game.statusText}
    </span>
  ) : game.state === "pre" ? (
    <span className="text-ink-soft">{hydrated ? kickoffLabel(game.kickoff) : game.statusText}</span>
  ) : (
    <span className="text-muted">{game.statusText}</span>
  );

  return (
    <Link href={`/games/${game.id}`} transitionTypes={["nav-forward"]} className="block">
      <TiltCard
        className="glass flex flex-col gap-3 p-4"
        style={{ "--glow": live ? `${glowTeam.color}cc` : "transparent" } as React.CSSProperties}
      >
        <ViewTransition name={`game-${game.id}`} share="morph" default="none">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.06em] uppercase">
              {status}
              <span className="text-muted">
                {game.state === "pre"
                  ? [game.odds?.details, game.odds?.overUnder ? `O/U ${game.odds.overUnder}` : null]
                      .filter(Boolean)
                      .join(" · ")
                  : game.broadcast}
              </span>
            </div>
            <SideRow side={game.away} hasBall={live && possession === game.away.team.id} leading={awayLeads} showScore={showScore} />
            <SideRow side={game.home} hasBall={live && possession === game.home.team.id} leading={homeLeads} showScore={showScore} />
          </div>
        </ViewTransition>
        {live && (game.situation?.downDistance || redZone) && (
          <div className="flex items-center gap-2 border-t border-line-soft pt-2.5 font-mono text-[11px] text-ink-soft">
            {redZone && (
              <span className="rounded-md bg-redzone/20 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.1em] text-redzone uppercase ring-1 ring-redzone/50">
                Red zone
              </span>
            )}
            <span className="truncate">{game.situation?.downDistance}</span>
          </div>
        )}
      </TiltCard>
    </Link>
  );
}
