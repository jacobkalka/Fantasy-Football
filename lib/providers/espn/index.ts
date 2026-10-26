/**
 * The ESPN data provider: the ONLY place in the app that knows ESPN's URLs and
 * response shapes. Everything returns the app's own types (lib/providers/types.ts).
 */
import type { DataProvider, GameDetail, Scoreboard, Team } from "@/lib/providers/types";
import { fetchDefenseVsPosition } from "./defense";
import {
  outlooksRequest,
  parseByeWeeks,
  parseOutlooks,
  parsePlayersList,
  playersListRequest,
} from "./fantasy";
import { ESPN, espnJson } from "./http";
import { fetchLeague, fetchLeagueOwnership } from "./league";
import { parseArticles, parseInjuries, parseNews, parsePlayerArticles, parsePlayerNews } from "./news";
import { parseScoreboard } from "./scoreboard";
import { parseBoxscore, parseCorePlays } from "./stats";
import { parseDrives, parseSummaryGame, parseTeamStats, parseWinProbability } from "./summary";
import { parseTeams } from "./teams";
import { fetchPlayerUniverse } from "./universe";
import { fetchDepthChart, fetchPlayerBio, fetchPlayerCareer, fetchPlayerSeason, fetchTeamSchedule } from "./player";

export { ProviderError } from "./http";

/** This week's scoreboard (ESPN decides which week is "current"), or a specific week. */
export async function fetchScoreboard(opts: { season?: number; week?: number } = {}): Promise<Scoreboard> {
  const params = new URLSearchParams();
  if (opts.week) {
    params.set("seasontype", "2");
    params.set("week", String(opts.week));
    if (opts.season) params.set("dates", String(opts.season));
  }
  const query = params.size ? `?${params.toString()}` : "";
  return parseScoreboard(await espnJson(`${ESPN.site}/scoreboard${query}`));
}

export async function fetchGameDetail(gameId: string): Promise<GameDetail> {
  const id = encodeURIComponent(gameId);
  const [summary, corePlays] = await Promise.all([
    espnJson(`${ESPN.site}/summary?event=${id}`),
    // Play-by-play with the players involved. If it fails we still show the box score.
    espnJson(`${ESPN.core}/events/${id}/competitions/${id}/plays?limit=1000`).catch(() => null),
  ]);
  return {
    game: parseSummaryGame(summary),
    drives: parseDrives(summary),
    plays: corePlays ? parseCorePlays(corePlays, gameId) : [],
    boxscore: parseBoxscore(summary),
    teamStats: parseTeamStats(summary),
    winProbability: parseWinProbability(summary),
  };
}

export async function fetchTeams(): Promise<Team[]> {
  return parseTeams(await espnJson(`${ESPN.site}/teams`));
}

export async function fetchPlayers(season: number) {
  const { url, headers } = playersListRequest(season);
  return parsePlayersList(await espnJson(url, { headers, timeoutMs: 12000 }));
}

export async function fetchPlayerOutlooks(playerIds: string[], season: number, week: number) {
  if (playerIds.length === 0) return [];
  const { url, headers } = outlooksRequest(playerIds, season, week);
  return parseOutlooks(await espnJson(url, { headers }), season, week);
}

export async function fetchByeWeeks(season: number) {
  return parseByeWeeks(await espnJson(`${ESPN.fantasy}/seasons/${season}?view=proTeamSchedules_wl`));
}

export async function fetchPlayerNews(playerId: string) {
  const url = `${ESPN.fantasyNews}/players?limit=10&playerId=${encodeURIComponent(playerId)}`;
  return parsePlayerNews(await espnJson(url), playerId);
}

export async function fetchLeagueNews() {
  return parseNews(await espnJson(`${ESPN.site}/news?limit=30`));
}

export async function fetchInjuries() {
  return parseInjuries(await espnJson(`${ESPN.site}/injuries`, { timeoutMs: 15000 }));
}

/**
 * Fantasy news cards. No ids: ESPN's NFL news feed. With ids: each player's fantasy news
 * (ESPN has no multi-player feed), newest first, duplicates (one story about two players) merged.
 */
export async function fetchFantasyNews(playerIds?: string[]) {
  if (!playerIds?.length) return parseArticles(await espnJson(`${ESPN.site}/news?limit=50`));
  const lists = await Promise.all(
    playerIds.slice(0, 20).map((id) =>
      espnJson(`${ESPN.fantasyNews}/players?limit=8&playerId=${encodeURIComponent(id)}`)
        .then((raw) => parsePlayerArticles(raw, id))
        .catch(() => []),
    ),
  );
  const byId = new Map<string, ReturnType<typeof parsePlayerArticles>[number]>();
  for (const article of lists.flat()) {
    const seen = byId.get(article.id);
    if (seen) seen.playerIds = [...new Set([...seen.playerIds, ...article.playerIds])];
    else byId.set(article.id, { ...article });
  }
  return [...byId.values()].sort((a, b) => b.published.localeCompare(a.published));
}

export const espnProvider: DataProvider = {
  getScoreboard: fetchScoreboard,
  getGameDetail: fetchGameDetail,
  getTeams: fetchTeams,
  getPlayers: fetchPlayers,
  getPlayerOutlooks: fetchPlayerOutlooks,
  getByeWeeks: fetchByeWeeks,
  getPlayerNews: fetchPlayerNews,
  getLeagueNews: fetchLeagueNews,
  getInjuries: fetchInjuries,
  getDefenseVsPosition: fetchDefenseVsPosition,
  getPlayerUniverse: fetchPlayerUniverse,
  getPlayerBio: fetchPlayerBio,
  getPlayerCareer: fetchPlayerCareer,
  getPlayerSeason: fetchPlayerSeason,
  getDepthChart: fetchDepthChart,
  getTeamSchedule: fetchTeamSchedule,
  getLeague: fetchLeague,
  getLeagueOwnership: fetchLeagueOwnership,
  getFantasyNews: fetchFantasyNews,
};
