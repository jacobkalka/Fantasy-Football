"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
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
          className={`text-[20px] leading-7 font-semibold ${ leading || !showScore ? "text-ink" : "text-muted" }`}
        >
          {side.team.abbr}
        </span>
        {side.record && <span className="text-[12px] text-muted">{side.record}</span>}
        {hasBall && <Football />}
      </div>
      {showScore && (
        <span
          className={`tabular text-[26px] leading-8 font-semibold ${leading ? "text-ink" : "text-muted"}`}
          style={{ transform: "translateZ(20px)" }}
        >
          <AnimatedNumber value={side.score} decimals={0} />
        </span>
      )}
    </div>
  );
}

/** A game on the scoreboard: score, clock and who has the ball. Opens Game Center. */
export function GameCard({ game }: { game: Game }) {
  const hydrated = useHydrated();
  const live = game.state === "in";
  const showScore = game.state !== "pre";
  const possession = game.situation?.possessionTeamId;
  const redZone = live && game.situation?.isRedZone;
  const homeLeads = game.home.score > game.away.score;
  const awayLeads = game.away.score > game.home.score;

  const status = live ? (
    <span className="inline-flex items-center gap-1.5 text-live">
      <LiveDot />
      {game.statusText}
    </span>
  ) : game.state === "pre" ? (
    <span className="text-muted">{hydrated ? kickoffLabel(game.kickoff) : game.statusText}</span>
  ) : (
    <span className="text-muted">{game.statusText}</span>
  );

  return (
    <Link href={`/games/${game.id}`} className="pressable block rounded-[20px]">
      <div className="card flex flex-col gap-3 p-4 transition-colors hover:bg-raised">
        <>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[12px]">
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
        </>
        {live && (game.situation?.downDistance || redZone) && (
          <div className="flex items-center gap-2 border-t border-rule pt-2.5 text-[12px] text-muted">
            {redZone && (
              <span className="rounded-md bg-negative-soft px-1.5 py-0.5 text-[12px] font-semibold text-negative">
                Red zone
              </span>
            )}
            <span className="truncate">{game.situation?.downDistance}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
