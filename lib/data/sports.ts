/**
 * Cached access to sports data for server code (pages and API routes).
 *
 * Every function here is shared by all visitors: when 1,000 people watch the same
 * game, ESPN is still asked at most once every few seconds. "use cache: remote"
 * keeps one shared copy across all of Vercel's servers.
 */
import { cacheLife, cacheTag } from "next/cache";
import { sports } from "@/lib/providers";

/** Data plus the moment it was fetched from ESPN, for "Updated 6s ago". */
export type Stamped<T> = T & { fetchedAt: string };

function stamp<T extends object>(data: T): Stamped<T> {
  return { ...data, fetchedAt: new Date().toISOString() };
}

export async function getScoreboard(week?: number, season?: number) {
  "use cache: remote";
  cacheLife("live");
  cacheTag("scoreboard");
  return stamp(await sports.getScoreboard(week ? { week, season } : {}));
}

export async function getGameDetail(gameId: string) {
  "use cache: remote";
  const detail = await sports.getGameDetail(gameId);
  if (detail.game.state === "post") cacheLife("final");
  else cacheLife("live");
  cacheTag(`game-${gameId}`);
  return stamp(detail);
}

export async function getTeams() {
  "use cache: remote";
  cacheLife("reference");
  return sports.getTeams();
}

export async function getPlayers(season: number) {
  "use cache: remote";
  cacheLife("reference");
  return sports.getPlayers(season);
}

export async function getByeWeeks(season: number) {
  "use cache: remote";
  cacheLife("reference");
  return sports.getByeWeeks(season);
}

/** Pass ids sorted so the same roster always hits the same cache entry. */
export async function getPlayerOutlooks(sortedIds: string[], season: number, week: number) {
  "use cache: remote";
  cacheLife("outlook");
  return sports.getPlayerOutlooks(sortedIds, season, week);
}

export async function getPlayerNews(playerId: string) {
  "use cache: remote";
  cacheLife("outlook");
  return sports.getPlayerNews(playerId);
}

export async function getLeagueNews() {
  "use cache: remote";
  cacheLife("outlook");
  return sports.getLeagueNews();
}

export async function getInjuries() {
  "use cache: remote";
  cacheLife("outlook");
  return sports.getInjuries();
}
