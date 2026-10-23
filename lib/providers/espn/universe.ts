/**
 * The analysis "universe": every fantasy-relevant player with his market signals,
 * projections and real results, read from ESPN's fantasy feed (kona_player_info).
 *
 * What ESPN's numbers mean (checked on real 2026 data, week 7; samples/fantasy-universe-week7.json):
 *
 * - `11{season}{week}` (statSourceId 1, split 1) is the projection for one week (0 on a bye).
 * - `10{season}` (statSourceId 1, split 0) is called the "season projection", but in-season it is a
 *   REST-OF-SEASON projection that starts with the current week. Proof: its games stat (ESPN id 210)
 *   equals the team's games left from the current week on (weeks 7-18 minus the bye) for 319 of 335
 *   healthy players; the rest are ESPN's own injury discounts (10.5 games, or 1 game for backups).
 *   Points per projected game equal this week's projection (median ratio 1.000). Players on injured
 *   reserve with 100+ points already scored are projected 0. And Thursday's teams still count this
 *   week's game after playing it, so it's refreshed once per week, not after every game.
 * - D/STs are the exception for the games stat: it's always 17. Their points are still rest of
 *   season (5.4 points per remaining game, matching what D/STs really score, 5.5), so for them we
 *   count the games from the schedule instead.
 * - `00{season}` is the season so far; weekly real lines (statSourceId 0, split 1) carry the game
 *   id. A week where the player didn't play is an empty line; one where he did has stat 210 = 1.
 * - A two-way or special-teams player's defensive plays (Travis Hunter's interceptions, a fumble
 *   recovered on kick coverage) come under the D/ST stat ids. ESPN's default rules
 *   (samples/fantasy-league-defaults-scoring.json) score sacks, interceptions, fumble recoveries,
 *   blocks and safeties only for D/STs, but a defensive or blocked-kick TD (ids 103, 104, 93) is
 *   6 points for anyone. So non-D/ST players keep only those TDs. With that, our PPR points equal
 *   ESPN's own total on all 4,078 lines in the sample (3,485 weekly, 593 rest-of-season).
 *
 * Why 650 players: sorted by % rostered, the top 600 hold 99.5% of this season's fantasy points
 * and 99.8% of the projected rest-of-season points; nobody past 600 projects more than 20 points
 * for the rest of the season. A 16-team league with 16-man rosters rosters 256. ESPN ignores
 * "sort by points" here, so % rostered is the best sort (same finding as defense.ts).
 */
import type { PlayerUniverse, Position, UniversePlayer, UniverseWeek } from "@/lib/providers/types";
import type { StatKey, StatLine } from "@/lib/stats";
import { parseInjuryStatus } from "./fantasy";
import { ESPN, espnJson } from "./http";
import { arr, get, num, obj, str, type Json } from "./json";
import { fantasyStatsToStatLine } from "./stats";
import { headshotUrl } from "./teams";

/** How many players to read. See the note at the top of this file. */
export const UNIVERSE_SIZE = 650;

/** ESPN fantasy's position numbers (1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST). */
const POSITIONS: Record<number, Position> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };

/** ESPN's fantasy stat id for "games played" (also "games projected" in projections). */
const GAMES_STAT = "210";

/**
 * The request for the most-rostered players with only this season's stats:
 * `filterStatsForTopScoringPeriodIds: week` keeps this season's weekly lines (a larger number
 * reaches back into last season), plus the season-to-date, rest-of-season and this-week lines.
 */
export function universeRequest(season: number, week: number) {
  const filter = {
    players: {
      filterSlotIds: { value: [0, 2, 4, 6, 17, 16] }, // QB, RB, WR, TE, K, D/ST
      filterStatsForTopScoringPeriodIds: {
        value: week,
        additionalValue: [`00${season}`, `10${season}`, `11${season}${week}`],
      },
      // Rankings are most of each player's size; keep only one week's PPR ranks.
      filterRanksForScoringPeriodIds: { value: [week] },
      filterRanksForRankTypes: { value: ["PPR"] },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit: UNIVERSE_SIZE,
    },
  };
  return {
    url: `${ESPN.fantasy}/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=${week}&view=kona_player_info`,
    headers: { "x-fantasy-filter": JSON.stringify(filter) },
  };
}

/** Each team's bye week and how many games it has from `week` on, from proTeamSchedules_wl. */
export function parseTeamSchedules(raw: Json, week: number) {
  const bye = new Map<string, number>();
  const gamesLeft = new Map<string, number>();
  for (const team of arr(get(raw, "settings", "proTeams")).map(obj)) {
    const id = num(team.id);
    if (id <= 0) continue;
    if (num(team.byeWeek) > 0) bye.set(String(id), num(team.byeWeek));
    const weeks = Object.entries(obj(team.proGamesByScoringPeriod)).filter(
      ([w, games]) => Number(w) >= week && arr(games).length > 0,
    );
    gamesLeft.set(String(id), weeks.length);
  }
  return { bye, gamesLeft };
}

/** D/ST stats that also score for individual players: defensive and blocked-kick touchdowns. */
const ANY_PLAYER_DST_KEYS: readonly StatKey[] = ["dstIntTd", "dstFumTd", "dstBlkTd"];

/** Drops D/ST-only stats from anyone who isn't a D/ST (see the note at the top of this file). */
function offenseOnly(position: Position, line: StatLine): StatLine {
  if (position === "DST") return line;
  for (const key of Object.keys(line) as StatKey[]) {
    if (key.startsWith("dst") && !ANY_PLAYER_DST_KEYS.includes(key)) delete line[key];
  }
  return line;
}

const nullableNum = (value: Json) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function parsePlayerUniverse(
  playersRaw: Json,
  scheduleRaw: Json,
  season: number,
  week: number,
): PlayerUniverse {
  const schedule = parseTeamSchedules(scheduleRaw, week);
  const players: UniversePlayer[] = [];
  const seen = new Set<string>();

  for (const entry of arr(get(playersRaw, "players"))) {
    const player = obj(get(entry, "player"));
    const position = POSITIONS[num(player.defaultPositionId)];
    const id = str(player.id);
    if (!position || !id || seen.has(id)) continue;
    seen.add(id);
    const team = num(player.proTeamId);
    const teamId = team > 0 ? String(team) : null;
    const ownership = obj(player.ownership);
    const stats = arr(player.stats)
      .map(obj)
      .filter((s) => num(s.seasonId) === season);
    const line = (s: Record<string, Json>) =>
      offenseOnly(position, fantasyStatsToStatLine(obj(s.stats) as Record<string, number>));

    const weekly = stats.find(
      (s) => num(s.statSourceId) === 1 && num(s.statSplitTypeId) === 1 && num(s.scoringPeriodId) === week,
    );
    const rest = stats.find((s) => num(s.statSourceId) === 1 && num(s.statSplitTypeId) === 0);
    const teamGamesLeft = teamId ? (schedule.gamesLeft.get(teamId) ?? null) : null;

    // Real results: one line per week (ESPN sends an empty line for a game he missed).
    const byWeek = new Map<number, UniverseWeek>();
    for (const s of stats) {
      if (num(s.statSourceId) !== 0 || num(s.statSplitTypeId) !== 1) continue;
      const w = num(s.scoringPeriodId);
      if (w < 1 || w > week) continue;
      const played = num(get(s, "stats", GAMES_STAT)) > 0;
      const existing = byWeek.get(w);
      if (existing?.played) continue;
      byWeek.set(w, { week: w, played, stats: line(s) });
    }

    let restOfSeason: UniversePlayer["restOfSeason"] = null;
    if (rest) {
      // ESPN's games stat for D/STs is always 17 (see the top of this file): count the schedule.
      // A projection with no stats at all (injured reserve, out for the season) means no games.
      const espnGames = nullableNum(get(rest, "stats", GAMES_STAT));
      const stats = line(rest);
      const empty = Object.keys(stats).length === 0;
      const games = empty ? 0 : position === "DST" || espnGames === null ? teamGamesLeft : espnGames;
      if (games !== null) restOfSeason = { stats, games };
    }

    players.push({
      id,
      name: str(player.fullName),
      position,
      teamId,
      headshot: position === "DST" ? null : headshotUrl(id),
      injuryStatus: parseInjuryStatus(player.injuryStatus),
      byeWeek: teamId ? (schedule.bye.get(teamId) ?? null) : null,
      percentOwned: nullableNum(ownership.percentOwned),
      percentOwnedChange: nullableNum(ownership.percentChange),
      percentStarted: nullableNum(ownership.percentStarted),
      weekProjection: weekly ? line(weekly) : null,
      weeks: [...byWeek.values()].sort((a, b) => a.week - b.week),
      restOfSeason,
      teamGamesLeft,
    });
  }
  players.sort((a, b) => (b.percentOwned ?? 0) - (a.percentOwned ?? 0));
  return { season, week, players };
}

export async function fetchPlayerUniverse(season: number, week: number): Promise<PlayerUniverse> {
  const { url, headers } = universeRequest(season, week);
  const [players, schedule] = await Promise.all([
    // About 4.5 MB before compression (~1 MB on the wire), so allow more time than usual.
    espnJson(url, { headers, timeoutMs: 15000 }),
    espnJson(`${ESPN.fantasy}/seasons/${season}?view=proTeamSchedules_wl`),
  ]);
  return parsePlayerUniverse(players, schedule, season, week);
}
