/**
 * "Defense vs. position": how many fantasy points each NFL defense gives up to
 * QBs, RBs, WRs and TEs. ESPN has no ready-made field for this, so we build it:
 *
 *  1. Ask the fantasy feed (kona_player_info) for the most-owned QBs, RBs, WRs and
 *     TEs with only their REAL week-by-week stat lines. Each weekly line carries
 *     `externalId` (the ESPN game id) and `proTeamId` (who the player played for
 *     that week, which handles mid-season trades).
 *  2. Look the game up in the season schedule (proTeamSchedules_wl view) to find
 *     the other team in that game: the defense he played against.
 *  3. Add his stat line to that defense's "allowed" total for his position.
 *
 * Why the top 500 by ownership: checked against weeks 1-6 of 2026, they account for
 * ~99% of all fantasy points scored at these positions (the top 300 only ~91%).
 * ESPN ignores "sort by points" on this endpoint, so ownership is the best sort.
 *
 * Shapes: samples/fantasy-weekly-actuals-trimmed.json (first 120 players of the real
 * response, heavy fields removed) and samples/fantasy-pro-team-schedules.json.
 */
import type { DefenseAllowed, DefenseVsPosition, OffensePosition } from "@/lib/providers/types";
import type { StatKey, StatLine } from "@/lib/stats";
import { ESPN, espnJson } from "./http";
import { arr, get, num, obj, str, type Json } from "./json";
import { fantasyStatsToStatLine } from "./stats";

/** How many players to read. See the note at the top of this file. */
export const DEFENSE_SAMPLE_SIZE = 500;

/** ESPN fantasy's position numbers, offense only. */
const OFFENSE: Record<number, OffensePosition> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE" };
export const OFFENSE_POSITIONS: readonly OffensePosition[] = ["QB", "RB", "WR", "TE"];

/** One game on the season schedule. */
export interface ScheduledGame {
  id: string;
  week: number;
  homeId: string;
  awayId: string;
}

/**
 * The request for every top player's real weekly stat lines this season.
 * `throughWeek` is the last finished week; it's also how many recent games we ask for,
 * which covers the whole season so far even for players who never missed a game.
 */
export function weeklyActualsRequest(season: number, throughWeek: number) {
  const filter = {
    players: {
      filterSlotIds: { value: [0, 2, 4, 6] }, // QB, RB, WR, TE
      filterStatsForSourceIds: { value: [0] }, // 0 = what really happened (1 = projections)
      filterStatsForSplitTypeIds: { value: [1] }, // 1 = one game (0 = season totals)
      filterStatsForTopScoringPeriodIds: { value: throughWeek },
      // Rankings are most of each player's size; keep only one week's PPR ranks.
      filterRanksForScoringPeriodIds: { value: [throughWeek + 1] },
      filterRanksForRankTypes: { value: ["PPR"] },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit: DEFENSE_SAMPLE_SIZE,
    },
  };
  return {
    url: `${ESPN.fantasy}/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=${throughWeek + 1}&view=kona_player_info`,
    headers: { "x-fantasy-filter": JSON.stringify(filter) },
  };
}

/** Every game in the season, keyed by ESPN game id, from the proTeamSchedules_wl view. */
export function parseScheduleGames(raw: Json): Map<string, ScheduledGame> {
  const games = new Map<string, ScheduledGame>();
  for (const team of arr(get(raw, "settings", "proTeams"))) {
    const byWeek = obj(get(team, "proGamesByScoringPeriod"));
    for (const [week, list] of Object.entries(byWeek)) {
      for (const game of arr(list).map(obj)) {
        const id = str(game.id);
        const homeId = num(game.homeProTeamId);
        const awayId = num(game.awayProTeamId);
        if (!id || homeId <= 0 || awayId <= 0) continue;
        // Each game is listed under both teams; the first copy is enough.
        if (!games.has(id)) games.set(id, { id, week: Number(week), homeId: String(homeId), awayId: String(awayId) });
      }
    }
  }
  return games;
}

function addInto(target: StatLine, add: StatLine) {
  for (const [key, value] of Object.entries(add) as [StatKey, number][]) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function emptyAllowed(games: number): Partial<Record<OffensePosition, DefenseAllowed>> {
  return Object.fromEntries(OFFENSE_POSITIONS.map((p) => [p, { games, stats: {} }]));
}

/**
 * Adds up what every defense allowed to each position in weeks 1..throughWeek.
 * Lines from other seasons, later weeks, unknown games or players whose team
 * wasn't in the game are skipped, never guessed.
 */
export function parseDefenseVsPosition(
  playersRaw: Json,
  scheduleRaw: Json,
  season: number,
  throughWeek: number,
): DefenseVsPosition {
  const schedule = parseScheduleGames(scheduleRaw);

  // Games each team has played so far (a bye week isn't a game).
  const gamesPlayed = new Map<string, number>();
  for (const game of schedule.values()) {
    if (game.week < 1 || game.week > throughWeek) continue;
    for (const id of [game.homeId, game.awayId]) gamesPlayed.set(id, (gamesPlayed.get(id) ?? 0) + 1);
  }
  const teams: DefenseVsPosition["teams"] = {};
  for (const [id, games] of gamesPlayed) teams[id] = emptyAllowed(games);

  const seen = new Set<string>();
  for (const entry of arr(get(playersRaw, "players"))) {
    const player = obj(get(entry, "player"));
    const position = OFFENSE[num(player.defaultPositionId)];
    if (!position) continue;
    for (const line of arr(player.stats).map(obj)) {
      if (num(line.statSourceId) !== 0 || num(line.statSplitTypeId) !== 1) continue;
      if (num(line.seasonId) !== season) continue;
      const week = num(line.scoringPeriodId);
      if (week < 1 || week > throughWeek) continue;
      const game = schedule.get(str(line.externalId));
      if (!game) continue;
      const key = `${str(player.id)}:${game.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // The team he played for that week (falls back to his current team).
      const teamId = String(num(line.proTeamId) || num(player.proTeamId));
      const opponentId = teamId === game.homeId ? game.awayId : teamId === game.awayId ? game.homeId : null;
      if (!opponentId) continue;
      const allowed = (teams[opponentId] ??= emptyAllowed(gamesPlayed.get(opponentId) ?? 0))[position];
      if (allowed) addInto(allowed.stats, fantasyStatsToStatLine(obj(line.stats) as Record<string, number>));
    }
  }
  return { season, throughWeek, teams };
}

/** Fetches and builds defense-vs-position. Before any games are played there's nothing to add up. */
export async function fetchDefenseVsPosition(season: number, throughWeek: number): Promise<DefenseVsPosition> {
  if (throughWeek < 1) return { season, throughWeek: 0, teams: {} };
  const { url, headers } = weeklyActualsRequest(season, throughWeek);
  const [players, schedule] = await Promise.all([
    // About 2.8 MB before compression (~0.6 MB on the wire), so allow more time than usual.
    espnJson(url, { headers, timeoutMs: 15000 }),
    espnJson(`${ESPN.fantasy}/seasons/${season}?view=proTeamSchedules_wl`),
  ]);
  return parseDefenseVsPosition(players, schedule, season, throughWeek);
}
