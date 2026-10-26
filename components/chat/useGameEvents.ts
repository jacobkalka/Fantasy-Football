"use client";

import type { ChatEvent } from "@/lib/chat/merge";
import type { GameView } from "@/lib/live/game-view";
import { useLive } from "@/lib/sync/useLive";

/**
 * A game room's scoring plays from ESPN's play-by-play, as timeline events. Refreshed every
 * 20 seconds while the game is on. Plays without a real time stamp are left out rather than
 * placed at a guessed time.
 */
export function useGameEvents(gameId: string | null): ChatEvent[] {
  const { data } = useLive<GameView>(gameId ? `/api/games/${gameId}` : null, {
    interval: (d) => (d?.game.state === "in" ? 20_000 : d?.game.state === "pre" ? 300_000 : 1_800_000),
  });
  if (!data) return [];
  const away = data.game.away.team.abbr;
  const home = data.game.home.team.abbr;
  return data.plays
    .filter((p) => p.scoring && p.wallclock && !Number.isNaN(Date.parse(p.wallclock)))
    .map((p) => ({
      id: p.id,
      at: new Date(p.wallclock!).toISOString(),
      title: p.isTouchdown ? "Touchdown" : p.scoreValue === 3 ? "Field goal" : p.scoreValue === 2 ? "Safety or two-point" : p.type || "Score",
      text: p.text,
      detail: `${away} ${p.awayScore}–${p.homeScore} ${home}`,
    }));
}
