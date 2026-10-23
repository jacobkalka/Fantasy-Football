/**
 * ESPN's fantasy feed (kona_player_info) for ONE player's research page: every
 * game this season (including games he missed), ESPN's pregame projection for
 * each week, and official fantasy season totals for this season and last.
 * Verified against samples/fantasy-kona-player-profile.json.
 */
import type { PlayerFantasyInfo } from "@/lib/providers/types";
import type { StatLine } from "@/lib/stats";
import { parseInjuryStatus } from "./fantasy";
import { ESPN } from "./http";
import { arr, get, num, obj, str, type Json } from "./json";
import { fantasyStatsToStatLine } from "./stats";

/** ESPN fantasy stat 210 is "games played": 1 in a game he played, absent when he didn't. */
const GAMES_PLAYED = "210";

/**
 * Stat-row ids: `00{season}` = actual season total, `10{season}` = season projection,
 * `11{season}{week}` = that week's projection. The last 18 game rows come with
 * every request (a season has at most 17 regular-season games per team).
 */
export function playerFantasyRequest(playerId: string, season: number, week: number) {
  const weeks = Array.from({ length: Math.max(1, Math.min(week, 18)) }, (_, i) => `11${season}${i + 1}`);
  const filter = {
    players: {
      filterIds: { value: [Number(playerId)] },
      filterStatsForTopScoringPeriodIds: {
        value: 18,
        additionalValue: [`00${season}`, `00${season - 1}`, `10${season}`, ...weeks],
      },
    },
  };
  return {
    url: `${ESPN.fantasy}/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=${week}&view=kona_player_info`,
    headers: { "x-fantasy-filter": JSON.stringify(filter) },
  };
}

export interface FantasyWeek {
  week: number;
  gameId: string;
  played: boolean;
  stats: StatLine;
}

export interface PlayerFantasyFeed {
  /** null for free agents. */
  teamId: string | null;
  weeks: FantasyWeek[];
  /** Week -> pregame projection (only weeks where ESPN projected him to play). */
  projections: Record<number, StatLine>;
  info: PlayerFantasyInfo;
}

function statsMap(row: Record<string, Json>): Record<string, number> {
  return obj(row.stats) as Record<string, number>;
}

/** An empty projection (ESPN projected 0 because of a bye or injury) means "no projection". */
function projectionLine(row: Record<string, Json> | undefined): StatLine | null {
  if (!row) return null;
  const line = fantasyStatsToStatLine(statsMap(row));
  return Object.keys(line).length ? line : null;
}

export function parsePlayerFantasy(raw: Json, playerId: string, season: number, week: number): PlayerFantasyFeed | null {
  const entry = arr(get(raw, "players"))
    .map((e) => obj(get(e, "player")))
    .find((p) => str(p.id) === playerId);
  if (!entry) return null;
  const rows = arr(entry.stats).map(obj);
  const of = (source: number, split: number, seasonId = season) =>
    rows.filter((s) => num(s.statSourceId) === source && num(s.statSplitTypeId) === split && num(s.seasonId) === seasonId);

  const weeks = of(0, 1)
    .map((row) => {
      const map = statsMap(row);
      const played = GAMES_PLAYED in map ? num(map[GAMES_PLAYED]) > 0 : Object.keys(map).length > 0;
      return {
        week: num(row.scoringPeriodId),
        gameId: str(row.externalId),
        played,
        stats: played ? fantasyStatsToStatLine(map) : {},
      };
    })
    .filter((w) => w.week > 0 && w.gameId)
    .sort((a, b) => a.week - b.week);

  const projections: Record<number, StatLine> = {};
  for (const row of of(1, 1)) {
    const line = projectionLine(row);
    if (line) projections[num(row.scoringPeriodId)] = line;
  }

  const seasonTotals = [season, season - 1]
    .map((year) => {
      const row = of(0, 0, year)[0];
      if (!row) return null;
      const map = statsMap(row);
      return { season: year, gamesPlayed: num(map[GAMES_PLAYED]), stats: fantasyStatsToStatLine(map) };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null && t.gamesPlayed > 0);

  const ownership = obj(entry.ownership);
  const teamId = num(entry.proTeamId);
  const percent = (value: Json) => {
    const n = num(value, NaN);
    return Number.isFinite(n) ? n : null;
  };
  return {
    teamId: teamId > 0 ? String(teamId) : null,
    weeks,
    projections,
    info: {
      injuryStatus: entry.injuryStatus === undefined ? null : parseInjuryStatus(entry.injuryStatus),
      percentOwned: percent(ownership.percentOwned),
      percentStarted: percent(ownership.percentStarted),
      seasonOutlook: str(entry.seasonOutlook) || null,
      weekOutlook: str(get(entry, "outlooks", "outlooksByWeek", String(week))) || null,
      projection: projections[week] ?? null,
      seasonProjection: projectionLine(of(1, 0)[0]),
      seasonTotals,
    },
  };
}
