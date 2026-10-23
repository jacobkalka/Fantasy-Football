/**
 * Player research fetchers: bio, career, this season, team schedule and depth chart.
 * Each ESPN page is optional where the others can stand in for it, so one slow
 * page doesn't blank the whole profile.
 */
import type {
  CareerSeason,
  DepthChart,
  PlayerBio,
  PlayerGame,
  PlayerSeason,
  TeamSchedule,
} from "@/lib/providers/types";
import { NO_ADVANCED, NO_SPLITS, parseAthleteBio, parseCareer, parseGameLog, parseSeasonAdvanced, parseSplits, type GameLogEntry } from "./athlete";
import { ESPN, espnJson, ProviderError } from "./http";
import { parsePlayerFantasy, playerFantasyRequest, type PlayerFantasyFeed } from "./player-fantasy";
import { dstTeamId } from "./stats";
import { parseDepthChart, parseTeamSchedule } from "./team-pages";

/** Team defenses (negative fantasy ids like "-16012") have no athlete pages. */
function isTeamDefense(playerId: string) {
  return playerId.startsWith("-");
}

export async function fetchPlayerBio(playerId: string): Promise<PlayerBio | null> {
  if (isTeamDefense(playerId)) return null;
  const id = encodeURIComponent(playerId);
  const [web, core] = await Promise.all([
    espnJson(`${ESPN.siteWeb}/athletes/${id}`),
    // Structured birth date, height, weight, experience and draft. The web page's display strings are the fallback.
    espnJson(`${ESPN.core}/athletes/${id}`).catch(() => null),
  ]);
  return parseAthleteBio(web, core);
}

export async function fetchPlayerCareer(playerId: string): Promise<CareerSeason[]> {
  if (isTeamDefense(playerId)) return [];
  return parseCareer(await espnJson(`${ESPN.siteWeb}/athletes/${encodeURIComponent(playerId)}/stats`));
}

/**
 * One row per game: the fantasy feed knows every game (even ones he missed) and
 * has exact fantasy stats; the game log adds opponent, score and box-score extras
 * for games he played. Where they disagree, a game in the game log was played.
 */
export function mergePlayerSeason(
  playerId: string,
  season: number,
  fantasy: PlayerFantasyFeed | null,
  log: GameLogEntry[],
): PlayerGame[] {
  const byGame = new Map<string, PlayerGame>();
  const blank = (gameId: string, week: number): PlayerGame => ({
    gameId,
    week,
    date: null,
    teamId: null,
    opponentId: null,
    opponentAbbr: null,
    home: null,
    result: null,
    teamScore: null,
    opponentScore: null,
    played: false,
    stats: {},
    statsSource: null,
    projection: null,
    extras: {},
  });
  for (const w of fantasy?.weeks ?? []) {
    byGame.set(w.gameId, {
      ...blank(w.gameId, w.week),
      played: w.played,
      stats: w.stats,
      statsSource: w.played ? "fantasy" : null,
    });
  }
  for (const g of log) {
    const row = byGame.get(g.gameId) ?? blank(g.gameId, g.week);
    const fromFantasy = row.statsSource === "fantasy";
    byGame.set(g.gameId, {
      ...row,
      week: g.week || row.week,
      date: g.date,
      teamId: g.teamId,
      opponentId: g.opponentId,
      opponentAbbr: g.opponentAbbr,
      home: g.home,
      result: g.result,
      teamScore: g.teamScore,
      opponentScore: g.opponentScore,
      played: true,
      stats: fromFantasy ? row.stats : g.stats,
      statsSource: fromFantasy ? "fantasy" : "boxscore",
      extras: g.extras,
    });
  }
  return [...byGame.values()]
    .map((g) => ({ ...g, projection: fantasy?.projections[g.week] ?? null }))
    .sort((a, b) => a.week - b.week);
}

export async function fetchPlayerSeason(playerId: string, season: number, week: number): Promise<PlayerSeason> {
  const id = encodeURIComponent(playerId);
  const defense = isTeamDefense(playerId);
  const { url, headers } = playerFantasyRequest(playerId, season, week);
  const [fantasyRaw, logRaw, splitsRaw, advancedRaw] = await Promise.all([
    espnJson(url, { headers }).catch(() => null),
    defense ? null : espnJson(`${ESPN.siteWeb}/athletes/${id}/gamelog?season=${season}`).catch(() => null),
    // ESPN's splits page only serves the current season (it rejects ?season=); parseSplits checks which season came back.
    defense ? null : espnJson(`${ESPN.siteWeb}/athletes/${id}/splits`).catch(() => null),
    // 404 for players with no snaps this season.
    defense ? null : espnJson(`${ESPN.core}/seasons/${season}/types/2/athletes/${id}/statistics`).catch(() => null),
  ]);
  const fantasy = fantasyRaw ? parsePlayerFantasy(fantasyRaw, playerId, season, week) : null;
  if (!fantasy && !logRaw) throw new ProviderError("No season data for this player");
  const log = logRaw ? parseGameLog(logRaw) : [];
  return {
    playerId,
    season,
    teamId: (defense ? dstTeamId(playerId) : null) ?? fantasy?.teamId ?? null,
    games: mergePlayerSeason(playerId, season, fantasy, log),
    splits: splitsRaw ? parseSplits(splitsRaw, season) : NO_SPLITS,
    advanced: advancedRaw ? parseSeasonAdvanced(advancedRaw) : NO_ADVANCED,
    fantasy: fantasy?.info ?? {
      injuryStatus: null,
      percentOwned: null,
      percentStarted: null,
      seasonOutlook: null,
      weekOutlook: null,
      projection: null,
      seasonProjection: null,
      seasonTotals: [],
    },
  };
}

export async function fetchTeamSchedule(teamId: string, season: number): Promise<TeamSchedule> {
  const raw = await espnJson(`${ESPN.site}/teams/${encodeURIComponent(teamId)}/schedule?season=${season}`, { timeoutMs: 10000 });
  return parseTeamSchedule(raw, teamId, season);
}

export async function fetchDepthChart(teamId: string, season: number): Promise<DepthChart> {
  // The core API's depth chart is ~20 KB; the site API's version of the same chart is ~200 KB.
  const raw = await espnJson(`${ESPN.core}/seasons/${season}/teams/${encodeURIComponent(teamId)}/depthcharts`);
  return parseDepthChart(raw, teamId);
}
