"use client";

import type { NewsArticle } from "@/lib/providers/types";
import { useLive } from "@/lib/sync/useLive";
import { useActiveTeam } from "@/lib/teams/store";

export type NewsResponse = { articles: NewsArticle[]; fetchedAt: string; servedAt: string };

/** ESPN's league-wide NFL news, shared by Home and News, refreshed every few minutes. */
export function useLeagueNews(enabled = true) {
  return useLive<NewsResponse>(enabled ? "/api/news" : null, { interval: 4 * 60_000 });
}

/** Fantasy news about the active team's players (D/STs have none). */
export function useMyPlayersNews(enabled = true) {
  const { team, ready } = useActiveTeam();
  const ids = team.players
    .filter((p) => !p.playerId.startsWith("-"))
    .map((p) => p.playerId)
    .sort()
    .slice(0, 20);
  const url = enabled && ready && ids.length ? `/api/news?ids=${ids.join(",")}` : null;
  return { ...useLive<NewsResponse>(url, { interval: 4 * 60_000 }), team, hasPlayers: ids.length > 0 };
}
