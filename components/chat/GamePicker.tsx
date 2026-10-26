"use client";

import { Sheet } from "@/components/ui/Sheet";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Skeleton } from "@/components/ui/bits";
import { useScoreboard } from "@/lib/fantasy/context";
import { kickoffLabel } from "@/lib/format";

const ORDER = { in: 0, pre: 1, post: 2 } as const;

/** Pick one of this week's games to attach. */
export function GamePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (gameId: string) => void }) {
  const { data } = useScoreboard();
  const games = [...(data?.games ?? [])].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.kickoff.localeCompare(b.kickoff));
  return (
    <Sheet open={open} onClose={onClose} title="Attach a game" description={data ? `Week ${data.week}` : undefined}>
      {!data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="text-[14px] text-muted">No games on the schedule this week.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {games.map((game) => (
            <li key={game.id}>
              <button type="button" onClick={() => onPick(game.id)} className="tile flex w-full items-center gap-3 p-3 text-left">
                <span className="flex -space-x-1.5" aria-hidden="true">
                  <TeamLogo abbr={game.away.team.abbr} logo={game.away.team.logo} color={game.away.team.color} size={26} />
                  <TeamLogo abbr={game.home.team.abbr} logo={game.home.team.logo} color={game.home.team.color} size={26} />
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-medium">
                  {game.away.team.abbr} @ {game.home.team.abbr}
                </span>
                <span className="tabular shrink-0 text-[12px] text-muted">
                  {game.state === "pre" ? kickoffLabel(game.kickoff) : `${game.away.score}–${game.home.score} · ${game.statusText}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
