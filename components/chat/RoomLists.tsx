"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveDot, Notice, SectionLabel, Skeleton } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { roomHref } from "@/lib/chat/rooms";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { usePoll } from "@/lib/hooks/usePoll";
import type { Game, Scoreboard } from "@/lib/providers/types";
import { requireSupabase } from "@/lib/supabase/client";
import { fetchLeagueRosters } from "@/lib/supabase/rosters";

const ORDER = { in: 0, pre: 1, post: 2 } as const;

function GameRoomCard({ game }: { game: Game }) {
  const hydrated = useHydrated();
  const live = game.state === "in";
  const status = game.state === "pre" ? (hydrated ? kickoffLabel(game.kickoff) : "Upcoming") : game.statusText;
  return (
    <Link
      href={roomHref({ type: "game", gameId: game.id })}
      className="glass pressable flex min-h-16 items-center gap-3 px-4 py-3"
      style={{ "--glow": live ? "rgb(200 255 46 / 0.35)" : "transparent" } as React.CSSProperties}
    >
      <span className="flex -space-x-2" aria-hidden="true">
        <TeamLogo abbr={game.away.team.abbr} logo={game.away.team.logo} color={game.away.team.color} size={34} />
        <TeamLogo abbr={game.home.team.abbr} logo={game.home.team.logo} color={game.home.team.color} size={34} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xl leading-none font-bold text-ink">
          {game.away.team.abbr} @ {game.home.team.abbr}
          {game.state !== "pre" && (
            <span className="ml-2 text-muted">
              {game.away.score}–{game.home.score}
            </span>
          )}
        </span>
        <span className={`mt-1 flex items-center gap-1.5 text-[12px] ${live ? "text-gain" : "text-muted"}`}>
          {live && <LiveDot />}
          {status}
        </span>
      </span>
      <span className="text-[12px] text-muted" aria-hidden="true">
        Chat →
      </span>
    </Link>
  );
}

/** A room for every game this week, live ones first. */
export function GameRooms() {
  const { data, delayed } = usePoll<Scoreboard>("/api/scoreboard", { intervalMs: 60_000 });
  if (!data) {
    return delayed ? (
      <Notice title="Games unavailable" tone="warn">
        ESPN isn&apos;t responding right now, so the game rooms can&apos;t be listed. Try again in a minute.
      </Notice>
    ) : (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-3xl" />
        ))}
      </div>
    );
  }
  const games = [...data.games].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.kickoff.localeCompare(b.kickoff));
  if (games.length === 0) return <Notice title="No games this week">Game rooms open when the schedule does.</Notice>;
  return (
    <section>
      <SectionLabel>Week {data.week} · one room per game</SectionLabel>
      <ul className="flex flex-col gap-2.5">
        {games.map((game, i) => (
          <motion.li
            key={game.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28, delay: Math.min(i, 10) * 0.03 }}
          >
            <GameRoomCard game={game} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** League rooms, once an ESPN league has been imported (Phase 9). Until then, a note. */
export function LeagueRooms({ userId }: { userId: string }) {
  const [leagues, setLeagues] = useState<{ leagueId: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    requireSupabase()
      .then((supabase) => fetchLeagueRosters(supabase, userId))
      .then((rows) => alive && setLeagues(rows))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (failed) return <Notice title="Couldn't check your leagues" tone="warn">Try again in a moment.</Notice>;
  if (!leagues) return <Skeleton className="h-24 rounded-3xl" />;
  if (leagues.length === 0) {
    return (
      <Notice title="League chat · coming in phase 9">
        Import your ESPN league and you&apos;ll get a private room shared only with the people in it.
      </Notice>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {leagues.map((league) => (
        <li key={league.leagueId}>
          <Link
            href={roomHref({ type: "league", leagueId: league.leagueId })}
            className="glass pressable flex min-h-16 items-center justify-between gap-3 px-4 py-3"
          >
            <span className="text-xl font-bold text-ink">{league.name}</span>
            <span className="text-[12px] text-muted">Private · Chat →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
