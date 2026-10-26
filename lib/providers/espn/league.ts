/**
 * ESPN fantasy leagues (DECISIONS.md, "ESPN leagues"). One request gives everything:
 *
 *   /seasons/{season}/segments/0/leagues/{id}
 *     ?view=mBoxscore&view=mMatchupScore&view=mTeam&view=mSettings&view=mStatus&scoringPeriodId={week}
 *
 * Checked on a real public league in week 7 (samples/fantasy-league-week7.json, names anonymized):
 * - `status.currentMatchupPeriod` / `scoringPeriodId`: this week. Matchup periods equal NFL weeks
 *   unless `settings.scheduleSettings.matchupPeriods` says otherwise (multi-week playoff rounds).
 * - Each current matchup side has `totalPointsLive` (points so far), `totalProjectedPointsLive`
 *   (ESPN's live projected final, which moves during games), `totalProjectedPoints` (pregame),
 *   `winProbability` (0-1) and `rosterForCurrentScoringPeriod.entries` (lineup slot + player
 *   with this week's actual line, statSourceId 0, and projection, statSourceId 1, both already
 *   scored with the league's own rules as `appliedTotal`).
 * - Past matchups carry only `totalPoints` per side and `winner`.
 * - `settings.scoringSettings.scoringItems`: { statId, points, pointsOverrides { slotId: points } }.
 *   Slot 16 is D/ST, so a D/ST-only override applies to the D/ST stats.
 * - Private leagues answer 401 without the owner's `espn_s2` and `SWID` cookies; ids that don't
 *   exist answer 404.
 */
import type {
  FantasyLeague,
  LeagueCredentials,
  LeagueMatchup,
  LeagueRosterEntry,
  LeagueScoring,
  LeagueSlot,
  LeagueTeamInfo,
  MatchupSide,
  Position,
} from "@/lib/providers/types";
import type { StatKey } from "@/lib/stats";
import { parseInjuryStatus } from "./fantasy";
import { ESPN, espnJson, ProviderError } from "./http";
import { arr, get, num, obj, str, type Json } from "./json";
import { ESPN_STAT_IDS } from "./stats/fantasy-ids";

const POSITIONS: Record<number, Position> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };

/**
 * ESPN lineup slot ids → the app's slots. Flex-type slots (RB/WR, WR/TE, FLEX, and the
 * "OP"/superflex slot) all show as FLEX; IR is kept apart from the bench. IDP slots aren't
 * supported (those players have no fantasy position the app scores).
 */
export const ESPN_SLOTS: Record<number, LeagueSlot> = {
  0: "QB",
  2: "RB",
  3: "FLEX",
  4: "WR",
  5: "FLEX",
  6: "TE",
  7: "FLEX",
  16: "DST",
  17: "K",
  20: "BENCH",
  21: "IR",
  23: "FLEX",
};
const DST_SLOT = "16";

export function leagueUrl(leagueId: string, season: number, week?: number) {
  const views = ["mBoxscore", "mMatchupScore", "mTeam", "mSettings", "mStatus"].map((v) => `view=${v}`).join("&");
  return `${ESPN.fantasy}/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?${views}${week ? `&scoringPeriodId=${week}` : ""}`;
}

/** Thrown for a private league without (valid) login cookies. */
export class LeaguePrivateError extends ProviderError {
  constructor() {
    super("This league is private", 401);
    this.name = "LeaguePrivateError";
  }
}

export class LeagueNotFoundError extends ProviderError {
  constructor() {
    super("No league with that id", 404);
    this.name = "LeagueNotFoundError";
  }
}

export async function fetchLeague(
  leagueId: string,
  season: number,
  credentials?: LeagueCredentials | null,
): Promise<FantasyLeague> {
  const headers: Record<string, string> = {};
  if (credentials) headers.cookie = `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}`;
  try {
    // First ask without a week to learn the current one, then for that week's lineups.
    const status = await espnJson(`${ESPN.fantasy}/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mStatus`, { headers });
    const week = num(get(status, "scoringPeriodId")) || undefined;
    return parseLeague(await espnJson(leagueUrl(leagueId, season, week), { headers, timeoutMs: 12000 }));
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) throw new LeaguePrivateError();
    if (error instanceof ProviderError && error.status === 404) throw new LeagueNotFoundError();
    throw error;
  }
}

/** The league's scoring in the app's stat names, plus what can't be translated. */
export function parseScoring(raw: Json): LeagueScoring {
  const rules: Partial<Record<StatKey, number>> = {};
  const unsupported: number[] = [];
  for (const item of arr(get(raw, "settings", "scoringSettings", "scoringItems")).map(obj)) {
    const statId = num(item.statId, -1);
    const overrides = obj(item.pointsOverrides);
    const base = num(item.points);
    const key = ESPN_STAT_IDS[String(statId)];
    // "50+ yard field goal" items stand for both 50-59 and 60+.
    const keys: StatKey[] = key
      ? [key]
      : statId === 74
        ? ["fgMade50_59", "fgMade60"]
        : statId === 76
          ? ["fgMiss50_59", "fgMiss60"]
          : [];
    if (keys.length === 0) {
      const any = base !== 0 || Object.values(overrides).some((v) => num(v) !== 0);
      if (any) unsupported.push(statId);
      continue;
    }
    for (const k of keys) {
      const points = k.startsWith("dst") && overrides[DST_SLOT] !== undefined ? num(overrides[DST_SLOT]) : base;
      if (points !== 0) rules[k] = (rules[k] ?? 0) === 0 ? points : Math.max(rules[k] ?? 0, points);
    }
  }
  return { rules, ppr: rules.rec ?? 0, unsupported: [...new Set(unsupported)].sort((a, b) => a - b) };
}

function weekLine(player: Json, week: number, source: 0 | 1): number | null {
  const line = arr(get(player, "stats"))
    .map(obj)
    .find((s) => num(s.scoringPeriodId) === week && num(s.statSourceId) === source && num(s.statSplitTypeId) === 1);
  return line ? Math.round(num(line.appliedTotal) * 100) / 100 : null;
}

function parseEntry(raw: Json, week: number): LeagueRosterEntry | null {
  const entry = obj(raw);
  const player = get(entry, "playerPoolEntry", "player");
  const position = POSITIONS[num(get(player, "defaultPositionId"))];
  if (!position) return null;
  const teamId = num(get(player, "proTeamId"));
  return {
    playerId: str(get(player, "id")) || str(entry.playerId),
    name: str(get(player, "fullName")),
    position,
    teamId: teamId > 0 ? String(teamId) : null,
    slot: ESPN_SLOTS[num(entry.lineupSlotId, 20)] ?? "BENCH",
    injuryStatus: parseInjuryStatus(get(player, "injuryStatus") ?? entry.injuryStatus),
    points: weekLine(player, week, 0),
    projected: weekLine(player, week, 1),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Starting slots that hold individual defensive players (IDP): DT, DE, LB, DL, CB, S, DB, DP. */
const IDP_SLOTS = new Set([8, 9, 10, 11, 12, 13, 14, 15]);

function parseSide(raw: Json, week: number, current: boolean): MatchupSide {
  const side = obj(raw);
  const live = side.totalPointsLive;
  const entries = arr(get(side, "rosterForCurrentScoringPeriod", "entries"));
  // Players the app can't show (IDP) still count in ESPN's totals; say how much they add.
  const idp = entries
    .map(obj)
    .filter((e) => IDP_SLOTS.has(num(e.lineupSlotId)) && !POSITIONS[num(get(e, "playerPoolEntry", "player", "defaultPositionId"))]);
  return {
    otherStarters: current ? idp.length : 0,
    otherPoints: current ? round2(idp.reduce((sum, e) => sum + (weekLine(get(e, "playerPoolEntry", "player"), week, 0) ?? 0), 0)) : 0,
    teamId: num(side.teamId),
    points: round2(num(live ?? side.totalPoints)),
    projectedLive: current && side.totalProjectedPointsLive !== undefined ? round2(num(side.totalProjectedPointsLive)) : null,
    projectedPregame: current && side.totalProjectedPoints !== undefined ? round2(num(side.totalProjectedPoints)) : null,
    winProbability:
      current && typeof side.winProbability === "number" ? Math.max(0, Math.min(1, side.winProbability)) : null,
    roster: current ? entries.map((e) => parseEntry(e, week)).filter((e): e is LeagueRosterEntry => e !== null) : [],
  };
}

function winner(value: Json): LeagueMatchup["winner"] {
  const w = str(value);
  return w === "HOME" || w === "AWAY" || w === "TIE" ? w : "UNDECIDED";
}

export function parseLeague(raw: Json): FantasyLeague {
  const settings = obj(get(raw, "settings"));
  const currentPeriod = num(get(raw, "status", "currentMatchupPeriod")) || 1;
  const scoringPeriod = num(get(raw, "scoringPeriodId")) || currentPeriod;
  const schedule = arr(get(raw, "schedule")).map(obj);

  const matchups: LeagueMatchup[] = schedule
    .filter((m) => num(m.matchupPeriodId) === currentPeriod)
    .map((m) => ({
      id: num(m.id),
      period: currentPeriod,
      home: parseSide(m.home, scoringPeriod, true),
      away: m.away ? parseSide(m.away, scoringPeriod, true) : null,
      winner: winner(m.winner),
    }));

  const rosterIds = new Map<number, string[]>();
  for (const m of matchups) {
    for (const side of [m.home, m.away]) {
      if (side) rosterIds.set(side.teamId, side.roster.map((e) => e.playerId));
    }
  }

  const teams: LeagueTeamInfo[] = arr(get(raw, "teams"))
    .map(obj)
    .map((t) => {
      const overall = obj(get(t, "record", "overall"));
      const logo = str(t.logo);
      const seed = num(t.playoffSeed);
      return {
        id: num(t.id),
        name: str(t.name).trim() || `Team ${num(t.id)}`,
        abbrev: str(t.abbrev),
        logo: /^https:\/\/[a-z0-9.-]*espncdn\.com\//i.test(logo) ? logo : null,
        wins: num(overall.wins),
        losses: num(overall.losses),
        ties: num(overall.ties),
        pointsFor: round2(num(overall.pointsFor)),
        pointsAgainst: round2(num(overall.pointsAgainst)),
        rank: seed > 0 ? seed : null,
        playerIds: rosterIds.get(num(t.id)) ?? [],
      };
    });

  const lineup: Partial<Record<LeagueSlot, number>> = {};
  for (const [slotId, count] of Object.entries(obj(get(settings, "rosterSettings", "lineupSlotCounts")))) {
    const slot = ESPN_SLOTS[Number(slotId)];
    const n = num(count);
    if (!slot || n <= 0 || slot === "BENCH" || slot === "IR") continue;
    lineup[slot] = (lineup[slot] ?? 0) + n;
  }

  return {
    id: str(get(raw, "id")),
    season: num(get(raw, "seasonId")),
    name: str(settings.name).trim() || "ESPN league",
    size: num(settings.size) || teams.length,
    currentPeriod,
    scoringPeriod,
    scoring: parseScoring(raw),
    lineup,
    teams,
    matchups,
    results: schedule
      .filter((m) => num(m.matchupPeriodId) <= currentPeriod)
      .map((m) => ({
        period: num(m.matchupPeriodId),
        homeId: num(get(m, "home", "teamId")),
        awayId: m.away ? num(get(m, "away", "teamId")) : null,
        homePoints: round2(num(get(m, "home", "totalPointsLive") ?? get(m, "home", "totalPoints"))),
        awayPoints: m.away ? round2(num(get(m, "away", "totalPointsLive") ?? get(m, "away", "totalPoints"))) : null,
        winner: winner(m.winner),
      }))
      .sort((a, b) => a.period - b.period),
  };
}
