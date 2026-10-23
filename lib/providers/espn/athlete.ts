/**
 * ESPN's athlete pages (site.web.api.espn.com/apis/common/v3/.../athletes/{id} and
 * sports.core.api.espn.com/v2/.../athletes/{id}): bio, career table, game log,
 * splits and season tracking numbers. Shapes verified against real responses in
 * samples/athlete-*-trimmed.json (fetched in Week 7 of 2026).
 */
import type {
  CareerSeason,
  PlayerAdvancedStats,
  PlayerBio,
  PlayerGameExtras,
  PlayerInjury,
  PlayerSplits,
  PlayerStatRank,
  GameResult,
  Position,
} from "@/lib/providers/types";
import type { StatKey, StatLine } from "@/lib/stats";
import { arr, get, idFromRef, num, obj, str, type Json } from "./json";

// ---------------------------------------------------------------------------
// Named stats ("passingYards": "1,309") -> the app's stat names
// ---------------------------------------------------------------------------

/** "1,309" -> 1309, "76.7" -> 76.7, "-" -> null. */
export function statNumber(value: Json): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = str(value).replace(/,/g, "").trim();
  if (!s || /^-+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "3-4" (made-attempted) -> [3, 4]. */
function madeAttempted(value: Json): [number, number] | null {
  const m = /^(\d+)-(\d+)$/.exec(str(value).trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * ESPN stat names that mean exactly one of ours. Only offensive names: the
 * defensive table's "interceptions" (picks MADE) must never reach this map, so
 * career tables are read category by category (see parseCareer).
 */
const NAMED_STATS: Readonly<Record<string, StatKey>> = {
  completions: "passCmp",
  passingAttempts: "passAtt",
  passingYards: "passYds",
  passingTouchdowns: "passTd",
  interceptions: "passInt",
  rushingAttempts: "rushAtt",
  rushingYards: "rushYds",
  rushingTouchdowns: "rushTd",
  receptions: "rec",
  receivingTargets: "targets",
  receivingYards: "recYds",
  receivingTouchdowns: "recTd",
  // Game logs give one "fumblesLost"; career tables split it by rushing/receiving.
  fumblesLost: "fumLost",
  rushingFumblesLost: "fumLost",
  receivingFumblesLost: "fumLost",
  returnTouchdowns: "retTd",
};

/** Field-goal distance columns ("fieldGoalsMade20_29-fieldGoalAttempts20_29"). */
const FG_BANDS: Readonly<Record<string, ["fgMade0_39" | "fgMade40_49", "fgMiss0_39" | "fgMiss40_49"]>> = {
  "1_19": ["fgMade0_39", "fgMiss0_39"],
  "20_29": ["fgMade0_39", "fgMiss0_39"],
  "30_39": ["fgMade0_39", "fgMiss0_39"],
  "40_49": ["fgMade40_49", "fgMiss40_49"],
};

export interface NamedStats {
  line: StatLine;
  /** 50+ yard field goals (ESPN's tables don't split 50-59 from 60+). */
  fiftyPlus: { made: number; att: number } | null;
  longFg: number | null;
  twoPointConversions: number;
  extras: PlayerGameExtras;
}

function add(line: StatLine, key: StatKey, value: number) {
  if (value) line[key] = (line[key] ?? 0) + value;
}

/** Reads parallel `names` / `values` arrays (game logs, splits, career tables). */
export function readNamedStats(names: string[], values: Json[]): NamedStats {
  const line: StatLine = {};
  const extras: PlayerGameExtras = {};
  let fiftyPlus: NamedStats["fiftyPlus"] = null;
  let longFg: number | null = null;
  let twoPointConversions = 0;
  let xpMade: number | null = null;
  let xpAtt: number | null = null;
  const isPasser = names.includes("passingAttempts");

  names.forEach((name, i) => {
    const raw = values[i];
    const key = NAMED_STATS[name];
    if (key) {
      add(line, key, statNumber(raw) ?? 0);
      return;
    }
    const band = /^fieldGoalsMade(\d+_\d+|50)-fieldGoalAttempts\1$/.exec(name)?.[1];
    if (band) {
      const ma = madeAttempted(raw);
      if (!ma) return;
      if (band === "50") fiftyPlus = { made: ma[0], att: ma[1] };
      else if (FG_BANDS[band]) {
        add(line, FG_BANDS[band][0], ma[0]);
        add(line, FG_BANDS[band][1], ma[1] - ma[0]);
      }
      return;
    }
    switch (name) {
      case "fieldGoalsMade-fieldGoalAttempts": {
        const ma = madeAttempted(raw);
        if (ma) {
          add(line, "fgMade", ma[0]);
          add(line, "fgAtt", ma[1]);
          add(line, "fgMiss", ma[1] - ma[0]);
        }
        return;
      }
      case "extraPointsMade-extraPointAttempts": {
        const ma = madeAttempted(raw);
        if (ma) [xpMade, xpAtt] = ma;
        return;
      }
      case "extraPointsMade":
        xpMade = statNumber(raw);
        return;
      case "extraPointAttempts":
        xpAtt = statNumber(raw);
        return;
      case "totalTwoPointConvs":
        twoPointConversions += statNumber(raw) ?? 0;
        return;
      case "longFieldGoalMade":
        longFg = statNumber(raw);
        if (longFg !== null && longFg > 0) extras.longFg = longFg;
        return;
      case "longPassing":
      case "longRushing":
      case "longReception": {
        const n = statNumber(raw);
        const field = name === "longPassing" ? "longPass" : name === "longRushing" ? "longRush" : "longRec";
        if (n !== null) extras[field] = n;
        return;
      }
      case "sacks": // Times sacked, but only in a passer's table (elsewhere it's sacks made).
        if (isPasser) {
          const n = statNumber(raw);
          if (n !== null) extras.sacked = n;
        }
        return;
      case "QBRating": {
        const n = statNumber(raw);
        if (n !== null && isPasser) extras.passerRating = n;
        return;
      }
    }
  });

  if (xpMade !== null) add(line, "xpMade", xpMade);
  if (xpAtt !== null) {
    add(line, "xpAtt", xpAtt);
    add(line, "xpMiss", xpAtt - (xpMade ?? 0));
  }
  return { line, fiftyPlus, longFg, twoPointConversions, extras };
}

/**
 * A box-score line with 50+ kicks assigned to 50-59 or 60+ using the longest
 * make: if it's under 60, every 50+ make was 50-59 (exact); if it's 60+, one of
 * them was 60+ and the rest are counted as 50-59 (exact when there was one).
 */
export function boxscoreLine(stats: NamedStats): StatLine {
  const line = { ...stats.line };
  const fifty = stats.fiftyPlus;
  if (fifty && fifty.made > 0) {
    const sixty = stats.longFg !== null && stats.longFg >= 60 ? 1 : 0;
    add(line, "fgMade60", sixty);
    add(line, "fgMade50_59", fifty.made - sixty);
  }
  return line;
}

// ---------------------------------------------------------------------------
// Bio
// ---------------------------------------------------------------------------

const FANTASY_POSITIONS: Record<string, Position> = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", PK: "K", K: "K" };

/** "6' 2\"" -> 74 */
function parseHeight(value: Json): number | null {
  const m = /^(\d+)'\s*(\d+)"?$/.exec(str(value).trim());
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

/** ESPN's displayDOB is day/month/year ("17/9/1995" = Sept 17, 1995: checked against the core API's ISO date). */
function parseDisplayDob(value: Json): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str(value).trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** "2017: Rd 1, Pk 10 (KC)" */
function parseDisplayDraft(value: Json): PlayerBio["draft"] {
  const m = /^(\d{4}):\s*Rd\s*(\d+),\s*Pk\s*(\d+)/.exec(str(value).trim());
  return m ? { year: Number(m[1]), round: Number(m[2]), pick: Number(m[3]), teamId: null } : null;
}

function positiveOrNull(value: Json): number | null {
  const n = num(value, NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseInjury(raw: Json): PlayerInjury {
  const i = obj(raw);
  const details = obj(i.details);
  return {
    status: str(i.status) || str(get(i, "type", "description")),
    type: str(details.type) || null,
    side: str(details.side) || null,
    detail: str(details.detail) || null,
    returnDate: str(details.returnDate) || null,
    shortComment: str(i.shortComment),
    longComment: str(i.longComment) || null,
    date: str(i.date),
  };
}

function parseStatRank(raw: Json): PlayerStatRank {
  const s = obj(raw);
  const rank = num(s.rank, NaN);
  return {
    stat: str(s.name),
    label: str(s.displayName),
    value: num(s.value),
    display: str(s.displayValue),
    rank: Number.isFinite(rank) && rank > 0 ? rank : null,
    rankDisplay: str(s.rankDisplayValue) || null,
  };
}

/**
 * The web athlete page (`web`) has team, college, status, injuries and league
 * ranks; the core athlete record (`core`, optional) has the structured birth
 * date, height, weight, experience and draft. Display strings are the fallback.
 */
export function parseAthleteBio(web: Json, core: Json | null): PlayerBio {
  const a = obj(get(web, "athlete"));
  const c = obj(core);
  const sourcePosition = str(get(a, "position", "abbreviation")) || str(get(c, "position", "abbreviation"));
  const freeAgent = str(get(a, "status", "type")) === "free-agent";
  const team = obj(a.team);

  // ESPN's experience.years is the season number, except rookies, who are 0.
  const years = num(get(c, "experience", "years"), NaN);
  const displayExperience = str(a.displayExperience);
  const nflSeason = Number.isFinite(years)
    ? Math.max(1, years)
    : /^rookie$/i.test(displayExperience)
      ? 1
      : positiveOrNull(displayExperience.match(/^(\d+)/)?.[1]);

  const draft = obj(c.draft);
  const birthPlace = obj(c.birthPlace);
  const summary = obj(a.statsSummary);
  const summaryStats = arr(summary.statistics);

  return {
    id: str(a.id) || str(c.id),
    name: str(a.displayName) || str(a.fullName) || str(c.displayName),
    firstName: str(a.firstName),
    lastName: str(a.lastName),
    sourcePosition,
    position: FANTASY_POSITIONS[sourcePosition] ?? null,
    teamId: !freeAgent && str(team.id) ? str(team.id) : null,
    teamAbbr: !freeAgent && str(team.abbreviation) ? str(team.abbreviation) : null,
    jersey: str(a.jersey) || str(c.jersey) || null,
    headshot: str(get(a, "headshot", "href")) || null,
    age: positiveOrNull(a.age) ?? positiveOrNull(c.age),
    birthDate: str(c.dateOfBirth).slice(0, 10) || parseDisplayDob(a.displayDOB),
    birthPlace:
      str(a.displayBirthPlace) ||
      [str(birthPlace.city), str(birthPlace.state) || str(birthPlace.country)].filter(Boolean).join(", ") ||
      null,
    heightInches: positiveOrNull(c.height) ?? parseHeight(a.displayHeight),
    weightLbs: positiveOrNull(c.weight) ?? positiveOrNull(str(a.displayWeight).match(/^(\d+)/)?.[1]),
    nflSeason,
    college: str(get(a, "college", "name")) || null,
    draft:
      num(draft.year) > 0 && num(draft.round) > 0
        ? {
            year: num(draft.year),
            round: num(draft.round),
            pick: num(draft.selection),
            teamId: idFromRef(get(draft, "team", "$ref"), "teams") ?? null,
          }
        : parseDisplayDraft(a.displayDraft),
    status: str(get(a, "status", "name")) || null,
    injuries: arr(a.injuries)
      .map(parseInjury)
      .sort((x, y) => y.date.localeCompare(x.date)),
    seasonRanks: summaryStats.length
      ? {
          season: positiveOrNull(str(summary.displayName).match(/(\d{4})/)?.[1]),
          stats: summaryStats.map(parseStatRank),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Career table (.../athletes/{id}/stats)
// ---------------------------------------------------------------------------

/** Categories whose numbers describe a fantasy player. ("defensive" would turn picks MADE into picks thrown.) */
const CAREER_CATEGORIES = ["passing", "rushing", "receiving", "kicking", "scoring"];
const SCORING_ONLY = ["gamesPlayed", "returnTouchdowns", "totalTwoPointConvs"];

export function parseCareer(raw: Json): CareerSeason[] {
  const slugToAbbr = new Map<string, string>();
  for (const [slug, team] of Object.entries(obj(get(raw, "teams")))) {
    slugToAbbr.set(slug, str(get(team, "abbreviation")));
  }
  type Acc = { teams: string[]; games: number; named: NamedStats[] };
  const seasons = new Map<number, Acc>();

  for (const category of arr(get(raw, "categories")).map(obj)) {
    if (!CAREER_CATEGORIES.includes(str(category.name))) continue;
    // "scoring" repeats the passing/rushing/receiving TDs; only its return TDs and 2-pt conversions are new.
    const names = arr(category.names)
      .map((n) => str(n))
      .map((n) => (str(category.name) !== "scoring" || SCORING_ONLY.includes(n) ? n : ""));
    const rowsBySeason = new Map<number, Record<string, Json>[]>();
    for (const row of arr(category.statistics).map(obj)) {
      const year = num(get(row, "season", "year"));
      if (year <= 0) continue;
      rowsBySeason.set(year, [...(rowsBySeason.get(year) ?? []), row]);
    }
    for (const [year, rows] of rowsBySeason) {
      const acc = seasons.get(year) ?? { teams: [], games: 0, named: [] };
      seasons.set(year, acc);
      for (const row of rows) {
        const abbr = slugToAbbr.get(str(row.teamSlug));
        if (str(row.teamId) && abbr && !acc.teams.includes(abbr)) acc.teams.push(abbr);
      }
      // A season with a trade has one row per team plus a "Totals" row without a team id.
      const totals = rows.find((r) => !str(r.teamId));
      const counted = totals ? [totals] : rows;
      for (const row of counted) {
        const values = arr(row.stats);
        acc.games = Math.max(acc.games, statNumber(values[names.indexOf("gamesPlayed")]) ?? 0);
        acc.named.push(readNamedStats(names, values));
      }
    }
  }

  return [...seasons.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, acc]) => {
      const stats: StatLine = {};
      let twoPointConversions = 0;
      let fgMade50Plus = 0;
      let fgMiss50Plus = 0;
      let longFg: number | null = null;
      for (const named of acc.named) {
        for (const [key, value] of Object.entries(named.line) as [StatKey, number][]) add(stats, key, value);
        twoPointConversions += named.twoPointConversions;
        if (named.fiftyPlus) {
          fgMade50Plus += named.fiftyPlus.made;
          fgMiss50Plus += named.fiftyPlus.att - named.fiftyPlus.made;
        }
        if (named.longFg !== null) longFg = Math.max(longFg ?? 0, named.longFg);
      }
      return { season, teams: acc.teams, gamesPlayed: acc.games, stats, twoPointConversions, fgMade50Plus, fgMiss50Plus, longFg };
    });
}

// ---------------------------------------------------------------------------
// Game log (.../athletes/{id}/gamelog?season=YYYY)
// ---------------------------------------------------------------------------

export interface GameLogEntry {
  gameId: string;
  week: number;
  date: string | null;
  teamId: string | null;
  opponentId: string | null;
  opponentAbbr: string | null;
  home: boolean | null;
  result: GameResult | null;
  teamScore: number | null;
  opponentScore: number | null;
  stats: StatLine;
  extras: PlayerGameExtras;
}

/** Regular-season games he actually played (ESPN leaves out games he missed). Oldest first. */
export function parseGameLog(raw: Json): GameLogEntry[] {
  const names = arr(get(raw, "names")).map((n) => str(n));
  const meta = obj(get(raw, "events"));
  const games: GameLogEntry[] = [];
  for (const seasonType of arr(get(raw, "seasonTypes"))) {
    if (!/regular season/i.test(str(get(seasonType, "displayName")))) continue;
    for (const category of arr(get(seasonType, "categories"))) {
      if (str(get(category, "type")) !== "event") continue;
      for (const event of arr(get(category, "events"))) {
        const gameId = str(get(event, "eventId"));
        if (!gameId || games.some((g) => g.gameId === gameId)) continue;
        const m = obj(meta[gameId]);
        const named = readNamedStats(names, arr(get(event, "stats")));
        const teamId = str(get(m, "team", "id")) || null;
        const homeTeamId = str(m.homeTeamId);
        const home = teamId && homeTeamId ? homeTeamId === teamId : null;
        const homeScore = statNumber(m.homeTeamScore);
        const awayScore = statNumber(m.awayTeamScore);
        const result = str(m.gameResult);
        games.push({
          gameId,
          week: num(m.week),
          date: str(m.gameDate) || null,
          teamId,
          opponentId: str(get(m, "opponent", "id")) || null,
          opponentAbbr: str(get(m, "opponent", "abbreviation")) || null,
          home,
          result: result === "W" || result === "L" || result === "T" ? result : null,
          teamScore: home === null ? null : home ? homeScore : awayScore,
          opponentScore: home === null ? null : home ? awayScore : homeScore,
          stats: boxscoreLine(named),
          extras: named.extras,
        });
      }
    }
  }
  return games.sort((a, b) => a.week - b.week);
}

// ---------------------------------------------------------------------------
// Splits (.../athletes/{id}/splits) — current season only; ESPN rejects ?season=
// ---------------------------------------------------------------------------

export const NO_SPLITS: PlayerSplits = Object.freeze({ redZone: null, home: null, away: null });

export function parseSplits(raw: Json, season: number): PlayerSplits {
  const seasonFilter = arr(get(raw, "filters")).map(obj).find((f) => str(f.name) === "season");
  if (seasonFilter && str(seasonFilter.value) !== String(season)) return NO_SPLITS;
  const names = arr(get(raw, "names")).map((n) => str(n));
  const categories = arr(get(raw, "splitCategories")).map(obj);
  const find = (category: string, label: string): StatLine | null => {
    const split = arr(categories.find((c) => str(c.name) === category)?.splits)
      .map(obj)
      .find((s) => str(s.displayName) === label);
    return split ? boxscoreLine(readNamedStats(names, arr(split.stats))) : null;
  };
  return {
    redZone: find("byFieldPosition", "Opp 19-Goal"),
    home: find("split", "Home"),
    away: find("split", "Away"),
  };
}

// ---------------------------------------------------------------------------
// Season tracking numbers (core .../seasons/{y}/types/2/athletes/{id}/statistics)
// ---------------------------------------------------------------------------

export const NO_ADVANCED: PlayerAdvancedStats = Object.freeze({
  yardsAfterCatch: null,
  yardsAtCatch: null,
  avgDepthOfTarget: null,
  yardsPerRouteRun: null,
  receivingFirstDowns: null,
  rushingFirstDowns: null,
  stuffs: null,
  passingYardsAfterCatch: null,
  passingYardsAtCatch: null,
  sacked: null,
  sackYardsLost: null,
  passerRating: null,
});

/**
 * Only fields that check out are read: receiving YAC + yards at the catch add up
 * to receiving yards exactly for every sampled player. ESPN reports 0 for things
 * it doesn't track (snap share and target share are 0 for everyone, so they're
 * not read at all; aDOT and yards per route run are 0 for QBs), so a 0 there is
 * "not available". Each number needs volume behind it (e.g. YAC needs a catch).
 */
export function parseSeasonAdvanced(raw: Json): PlayerAdvancedStats {
  const categories = arr(get(raw, "splits", "categories")).map(obj);
  const value = (category: string, name: string): number | null => {
    const stat = arr(categories.find((c) => str(c.name) === category)?.stats)
      .map(obj)
      .find((s) => str(s.name) === name);
    const n = stat ? num(stat.value, NaN) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const tracked = (n: number | null) => (n === null || n === 0 ? null : n);
  const round = (n: number | null, digits: number) => (n === null ? null : Number(n.toFixed(digits)));

  const receptions = value("receiving", "receptions") ?? 0;
  const targets = value("receiving", "receivingTargets") ?? 0;
  const carries = value("rushing", "rushingAttempts") ?? 0;
  const attempts = value("passing", "passingAttempts") ?? 0;
  return {
    yardsAfterCatch: receptions > 0 ? value("receiving", "receivingYardsAfterCatch") : null,
    yardsAtCatch: receptions > 0 ? value("receiving", "receivingYardsAtCatch") : null,
    avgDepthOfTarget: targets > 0 ? round(tracked(value("passing", "avgDepthOfTarget")), 2) : null,
    yardsPerRouteRun: targets > 0 ? round(tracked(value("passing", "yardsPerRouteRun")), 2) : null,
    receivingFirstDowns: receptions > 0 ? value("receiving", "receivingFirstDowns") : null,
    rushingFirstDowns: carries > 0 ? value("rushing", "rushingFirstDowns") : null,
    stuffs: carries > 0 ? value("rushing", "stuffs") : null,
    passingYardsAfterCatch: attempts > 0 ? value("passing", "passingYardsAfterCatch") : null,
    passingYardsAtCatch: attempts > 0 ? value("passing", "passingYardsAtCatch") : null,
    sacked: attempts > 0 ? value("passing", "sacks") : null,
    sackYardsLost: attempts > 0 ? value("passing", "sackYardsLost") : null,
    passerRating: attempts > 0 ? round(value("passing", "QBRating"), 1) : null,
  };
}
