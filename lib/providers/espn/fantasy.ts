import type { InjuryStatus, Player, PlayerOutlook, Position } from "@/lib/providers/types";
import { ESPN } from "./http";
import { arr, get, num, obj, str, type Json } from "./json";
import { fantasyStatsToStatLine } from "./stats";
import { headshotUrl } from "./teams";

/** ESPN fantasy's position numbers. Everything else (IDP, coaches) is ignored. */
const POSITIONS: Record<number, Position> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };

const INJURY_STATUSES: InjuryStatus[] = [
  "ACTIVE",
  "QUESTIONABLE",
  "DOUBTFUL",
  "OUT",
  "INJURY_RESERVE",
  "SUSPENSION",
  "DAY_TO_DAY",
];

export function parseInjuryStatus(value: Json): InjuryStatus {
  const s = str(value).toUpperCase();
  return (INJURY_STATUSES as string[]).includes(s) ? (s as InjuryStatus) : s ? "UNKNOWN" : "ACTIVE";
}

/** The fantasy feed's league-wide "players" view: every active player, lightweight. */
export function playersListRequest(season: number) {
  return {
    url: `${ESPN.fantasy}/seasons/${season}/players?scoringPeriodId=0&view=players_wl`,
    headers: { "x-fantasy-filter": JSON.stringify({ filterActive: { value: true } }) },
  };
}

export function parsePlayersList(raw: Json): Player[] {
  const players: Player[] = [];
  for (const entry of arr(raw).map(obj)) {
    const position = POSITIONS[num(entry.defaultPositionId)];
    if (!position) continue;
    const id = str(entry.id);
    const teamId = num(entry.proTeamId);
    players.push({
      id,
      name: str(entry.fullName),
      position,
      teamId: teamId > 0 ? String(teamId) : null,
      headshot: position === "DST" ? null : headshotUrl(id),
      percentOwned: num(get(entry, "ownership", "percentOwned")),
    });
  }
  return players.sort((a, b) => (b.percentOwned ?? 0) - (a.percentOwned ?? 0));
}

/**
 * Projections, injury status and week-by-week results for specific players.
 * `11{season}{week}` is ESPN's id for a weekly projection, `10{season}` for the season projection.
 */
export function outlooksRequest(playerIds: string[], season: number, week: number) {
  const filter = {
    players: {
      filterIds: { value: playerIds.map(Number) },
      filterStatsForTopScoringPeriodIds: {
        value: 18,
        additionalValue: [`00${season}`, `10${season}`, `11${season}${week}`],
      },
    },
  };
  return {
    url: `${ESPN.fantasy}/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=${week}&view=kona_player_info`,
    headers: { "x-fantasy-filter": JSON.stringify(filter) },
  };
}

export function parseOutlooks(raw: Json, season: number, week: number): PlayerOutlook[] {
  return arr(get(raw, "players")).map((entry) => {
    const player = obj(get(entry, "player"));
    const stats = arr(player.stats).map(obj);
    const find = (source: number, split: number, period?: number) =>
      stats.find(
        (s) =>
          num(s.statSourceId) === source &&
          num(s.statSplitTypeId) === split &&
          num(s.seasonId) === season &&
          (period === undefined || num(s.scoringPeriodId) === period),
      );
    const weekly = find(1, 1, week);
    const seasonProjection = find(1, 0);
    return {
      playerId: str(player.id),
      injuryStatus: parseInjuryStatus(player.injuryStatus),
      projection: weekly ? fantasyStatsToStatLine(obj(weekly.stats) as Record<string, number>) : null,
      seasonProjection: seasonProjection
        ? fantasyStatsToStatLine(obj(seasonProjection.stats) as Record<string, number>)
        : null,
      weeks: stats
        .filter(
          (s) =>
            num(s.statSourceId) === 0 && num(s.statSplitTypeId) === 1 && num(s.seasonId) === season,
        )
        .map((s) => ({
          week: num(s.scoringPeriodId),
          gameId: str(s.externalId) || undefined,
          stats: fantasyStatsToStatLine(obj(s.stats) as Record<string, number>),
        }))
        .sort((a, b) => a.week - b.week),
      outlook: str(get(player, "outlooks", "outlooksByWeek", String(week))) || undefined,
    };
  });
}

/** Each team's bye week, from the fantasy schedule view. */
export function parseByeWeeks(raw: Json): Record<string, number> {
  const byes: Record<string, number> = {};
  for (const team of arr(get(raw, "settings", "proTeams")).map(obj)) {
    const id = num(team.id);
    if (id > 0) byes[String(id)] = num(team.byeWeek);
  }
  return byes;
}
