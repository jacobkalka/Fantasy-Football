"use client";

import { LiveDot } from "@/components/ui/bits";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import type { PlayerGame, TeamLite } from "@/lib/live/types";

/** "Q3 4:12 · HOU 24–21", "Final · W 34–31 @ JAX", "Sun 1:00 PM vs BAL", "Bye week". */
export function GameStatus({
  game,
  onBye,
  teams,
}: {
  game: PlayerGame | null;
  onBye?: boolean;
  teams: Record<string, TeamLite>;
}) {
  const hydrated = useHydrated();
  if (!game) return <span className="text-muted">{onBye ? "Bye week" : "No game this week"}</span>;
  const opp = teams[game.opponentId]?.abbr ?? "OPP";
  const vs = game.isHome ? "vs" : "@";
  if (game.state === "pre") {
    return (
      <span className="text-muted">
        {hydrated ? kickoffLabel(game.kickoff) : game.statusText} {vs} {opp}
      </span>
    );
  }
  const score = `${game.teamScore}–${game.opponentScore}`;
  if (game.state === "post") {
    const result = game.teamScore > game.opponentScore ? "W" : game.teamScore < game.opponentScore ? "L" : "T";
    return (
      <span className="text-muted">
        Final · {result} {score} {vs} {opp}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-live">
      <LiveDot />
      {game.statusText} · {score} {vs} {opp}
      {game.isRedZone && (
        <span className="inline-flex h-[18px] items-center rounded-full bg-negative-soft px-1.5 text-[12px] font-semibold text-negative">
          Red zone
        </span>
      )}
    </span>
  );
}
