"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { usePlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import { useRoster } from "@/lib/roster/store";
import { useSettings } from "@/lib/settings/store";
import { PlayerList } from "./PlayerList";

/** Players you've starred, newest first, with their current team, status and % rostered. */
export function WatchlistScreen() {
  const { value: settings, ready } = useSettings();
  const { players, error, retry } = usePlayers(settings.watchlist.length > 0);
  const teams = useTeams();
  const { roster } = useRoster();
  const mine = useMemo(() => new Set(roster.players.map((p) => p.playerId)), [roster.players]);
  const watched = useMemo(() => new Set(settings.watchlist), [settings.watchlist]);

  const list = useMemo(() => {
    if (!players) return [];
    const byId = new Map(players.map((p) => [p.id, p]));
    return settings.watchlist.map((id) => byId.get(id)).filter((p) => p !== undefined);
  }, [players, settings.watchlist]);

  if (!ready) {
    return (
      <Card>
        <SkeletonRows rows={4} height={64} />
      </Card>
    );
  }
  if (settings.watchlist.length === 0) {
    return (
      <EmptyState title="No players on your watchlist yet" icon="star" action={{ label: "Find players", href: "/players" }}>
        Tap the star next to any player to keep an eye on them: injury news, role changes, or a waiver target for later.
      </EmptyState>
    );
  }
  return (
    <Card>
      {error && <ErrorState what="Couldn't load player details." onRetry={retry} />}
      {!players && !error && <SkeletonRows rows={Math.min(6, settings.watchlist.length)} height={64} />}
      {players && <PlayerList players={list} teams={teams} mine={mine} watched={watched} />}
      {players && list.length < settings.watchlist.length && (
        <p className="mt-2 text-[13px] text-faint">
          {settings.watchlist.length - list.length} watched player(s) are no longer listed by ESPN.
        </p>
      )}
    </Card>
  );
}
