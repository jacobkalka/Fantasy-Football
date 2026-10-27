"use client";

import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { WeekPicker } from "@/components/team/WeekPicker";
import { Notice, SectionLabel } from "@/components/ui/bits";
import type { Stamped } from "@/lib/data/sports";
import { dayLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { usePoll } from "@/lib/hooks/usePoll";
import type { Game, Scoreboard } from "@/lib/providers/types";
import { GameCard } from "./GameCard";

/** Poll fast while games are on, slower just before kickoff, rarely otherwise. */
export function scoreboardInterval(board: Scoreboard | undefined) {
  if (!board) return 30_000;
  if (board.games.some((g) => g.state === "in")) return 8_000;
  const soon = board.games.some((g) => {
    const until = new Date(g.kickoff).getTime() - Date.now();
    return g.state === "pre" && until < 30 * 60_000;
  });
  return soon ? 30_000 : 5 * 60_000;
}

function groupUpcoming(games: Game[], hydrated: boolean) {
  const groups = new Map<string, Game[]>();
  for (const game of games) {
    // Day names depend on the viewer's time zone, so they wait until we're in the browser.
    const key = hydrated ? dayLabel(game.kickoff) : "Upcoming";
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  return [...groups.entries()];
}

/** The cards arrive with the page (PageEnter animates every card). */
function GameList({ games }: { games: Game[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {games.map((game) => (
        <li key={game.id} className="min-w-0">
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  );
}

export function GamesBoard({ initial, currentWeek }: { initial: Stamped<Scoreboard>; currentWeek: number }) {
  const hydrated = useHydrated();
  const pastWeek = initial.week !== currentWeek;
  const { data, error, receivedAt } = usePoll<Stamped<Scoreboard> & { servedAt?: string }>(`/api/scoreboard${pastWeek ? `?week=${initial.week}` : ""}`, {
    initial,
    intervalMs: scoreboardInterval,
  });
  const board = data ?? initial;
  const live = board.games.filter((g) => g.state === "in");
  const upcoming = board.games.filter((g) => g.state === "pre");
  const final = board.games.filter((g) => g.state === "post").reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <WeekPicker currentWeek={currentWeek} week={board.week} />
        <UpdatedAgo stamps={data} receivedAt={receivedAt} error={error} live={live.length > 0} />
      </div>

      {board.games.length === 0 && (
        <Notice title="No games this week">ESPN hasn&apos;t posted a schedule for this week yet.</Notice>
      )}

      {live.length > 0 && (
        <section>
          <SectionLabel className="text-live">Live now</SectionLabel>
          <GameList games={live} />
        </section>
      )}

      {groupUpcoming(upcoming, hydrated).map(([day, games]) => (
        <section key={day}>
          <SectionLabel>{day}</SectionLabel>
          <GameList games={games} />
        </section>
      ))}

      {final.length > 0 && (
        <section>
          <SectionLabel>Final</SectionLabel>
          <GameList games={final} />
        </section>
      )}
    </div>
  );
}
