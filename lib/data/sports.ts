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
  // The list carries injury status and % rostered, so it's refreshed like other news, not like team info.
  cacheLife("outlook");
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

/**
 * What each defense has allowed to QBs, RBs, WRs and TEs through `throughWeek`.
 * Only changes when games finish, and one copy serves every Start/Sit comparison.
 */
export async function getDefenseVsPosition(season: number, throughWeek: number) {
  "use cache: remote";
  cacheLife("outlook");
  return sports.getDefenseVsPosition(season, throughWeek);
}

/**
 * The ~650 most-rostered players with projections and weekly results, for team ratings,
 * trades and pickups. One shared copy for every visitor; injuries and % rostered move slowly.
 */
export async function getPlayerUniverse(season: number, week: number) {
  "use cache: remote";
  cacheLife("outlook");
  cacheTag("universe");
  return stamp(await sports.getPlayerUniverse(season, week));
}

// --- Player research (profile pages). Assembled in lib/players/service.ts. ---

/** Who a player is. Bio facts barely change; injury notes and trades are picked up within the hour. */
export async function getPlayerBio(playerId: string) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`player-${playerId}`);
  return sports.getPlayerBio(playerId);
}

/** Season-by-season career stats. Only the current season's row moves, once per game. */
export async function getPlayerCareer(playerId: string) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`player-${playerId}`);
  return sports.getPlayerCareer(playerId);
}

/** This season game by game. Changes after each game (and when projections/injuries update). */
export async function getPlayerSeason(playerId: string, season: number, week: number) {
  "use cache: remote";
  cacheLife("final");
  cacheTag(`player-${playerId}`);
  return stamp(await sports.getPlayerSeason(playerId, season, week));
}

/** One team's schedule and results, shared by every player on that team. */
export async function getTeamSchedule(teamId: string, season: number) {
  "use cache: remote";
  cacheLife("final");
  cacheTag(`schedule-${teamId}`);
  return sports.getTeamSchedule(teamId, season);
}

/** One team's depth chart, shared by every player on that team. Teams update it during the week. */
export async function getDepthChart(teamId: string, season: number) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(`depth-${teamId}`);
  return sports.getDepthChart(teamId, season);
}
