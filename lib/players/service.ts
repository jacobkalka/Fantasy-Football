/**
 * Server-side: gathers a player's profile from the shared caches (each piece has
 * its own lifetime, see lib/data/sports.ts) and runs the analysis. A piece that
 * fails is left out instead of failing the page, except the season itself.
 */
import {
  getDepthChart,
  getPlayerBio,
  getPlayerCareer,
  getPlayerNews,
  getPlayers,
  getPlayerSeason,
  getScoreboard,
  getTeamSchedule,
  getTeams,
} from "@/lib/data/sports";
import type { ScoringFormat } from "@/lib/scoring";
import { analyzePlayer } from "./analysis";
import { buildPlayerProfile } from "./profile";
import type { PlayerAnalysis, PlayerProfile } from "./types";

/** The id isn't a player ESPN knows. */
export class PlayerNotFoundError extends Error {}

function logged<T>(label: string, fallback: T) {
  return (error: unknown) => {
    console.error(`player profile: ${label} unavailable`, error);
    return fallback;
  };
}

/** Regular-season week to read: the current one, the last (18) in the postseason, 1 in the preseason. */
function regularSeasonWeek(seasonType: number, week: number) {
  return seasonType === 3 ? 18 : seasonType === 1 ? 1 : Math.max(1, Math.min(week, 18));
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile> {
  const board = await getScoreboard();
  const { season } = board;
  const week = regularSeasonWeek(board.seasonType, board.week);
  const isDefense = playerId.startsWith("-");

  const [bio, career, seasonData, players, teams, news] = await Promise.all([
    // Errors from cached functions arrive wrapped (no status), so any failure here, an
    // unknown id included, means "no bio": the player list below decides whether he exists.
    getPlayerBio(playerId).catch(logged("bio", null)),
    getPlayerCareer(playerId).catch(logged("career", [])),
    getPlayerSeason(playerId, season, week).catch((error: unknown) => ({ error })),
    getPlayers(season).catch(logged("player list", [])),
    getTeams().catch(logged("teams", [])),
    isDefense ? Promise.resolve([]) : getPlayerNews(playerId).catch(logged("news", [])),
  ]);
  const listed = players.find((p) => p.id === playerId) ?? null;
  if (!bio && !listed) throw new PlayerNotFoundError(`No player ${playerId}`);
  if ("error" in seasonData) throw seasonData.error;

  const teamId = bio ? bio.teamId : (seasonData.teamId ?? listed?.teamId ?? null);
  const [schedule, depth] = await Promise.all([
    teamId ? getTeamSchedule(teamId, season).catch(logged("schedule", null)) : null,
    teamId && !isDefense ? getDepthChart(teamId, season).catch(logged("depth chart", null)) : null,
  ]);

  return buildPlayerProfile({ playerId, season, week, listed, bio, career, seasonData, schedule, depth, teams, news });
}

export async function getPlayerResearch(
  playerId: string,
  format: ScoringFormat,
): Promise<{ profile: PlayerProfile; analysis: PlayerAnalysis }> {
  const profile = await getPlayerProfile(playerId);
  return { profile, analysis: analyzePlayer(profile, format) };
}
