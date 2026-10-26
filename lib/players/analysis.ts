/**
 * Turns a player's profile into fantasy analysis: points per game in a scoring
 * format, consistency, usage, trends, sustainability signals, role labels, career
 * points and a plain-language summary. Pure and rules-based: every number comes
 * from the profile, every threshold from lib/players/rules.ts.
 */
import type { CareerSeason, Position } from "@/lib/providers/types";
import { rulesForFormat, scoreAllFormats, scoreStatLine, type ScoringFormat, type ScoringRules } from "@/lib/scoring";
import type { StatKey, StatLine } from "@/lib/stats";
import { roleLabels } from "./labels";
import { fixed, mean, median, round, stdDev, sum } from "./math";
import { FORMAT_LABEL, SAMPLE, TREND_CHANGE, WEEK_THRESHOLDS } from "./rules";
import { sustainabilitySignals } from "./signals";
import { playerSummary } from "./summary";
import type { CareerRow, Consistency, GamePoints, PlayerAnalysis, PlayerProfile, Trend } from "./types";
import { advancedMetrics, redZoneMetrics, seasonNumbers, usageMetrics, type SeasonNumbers } from "./usage";

/** Stats that are touchdowns, for "how much of his scoring came from TDs". */
const TD_KEYS: StatKey[] = ["passTd", "rushTd", "recTd", "retTd", "fumRecTd", "dstIntTd", "dstFumTd", "dstBlkTd"];

export function gamePoints(profile: PlayerProfile, format: ScoringFormat, custom?: Readonly<ScoringRules> | null): GamePoints[] {
  const rules = custom ?? rulesForFormat(format);
  return profile.games.map((g) => ({
    gameId: g.gameId,
    week: g.week,
    opponentAbbr: g.opponentAbbr,
    home: g.home,
    result: g.result && g.teamScore !== null && g.opponentScore !== null ? `${g.result} ${g.teamScore}-${g.opponentScore}` : g.result,
    played: g.played,
    points: g.played ? scoreStatLine(g.stats, rules).total : null,
    allFormats: g.played ? scoreAllFormats(g.stats) : null,
    projected: g.projection ? scoreStatLine(g.projection, rules).total : null,
  }));
}

function sampleLevel(games: number): PlayerAnalysis["sample"]["level"] {
  return games === 0 ? "none" : games < SAMPLE.minGames ? "tiny" : games < 5 ? "small" : "ok";
}

export function consistencyOf(points: GamePoints[], position: Position | null, format: ScoringFormat): Consistency | null {
  const played = points.filter((g) => g.points !== null);
  const values = played.map((g) => g.points as number);
  if (!values.length || !position) return null;
  const thresholds = WEEK_THRESHOLDS[position][format];
  const avg = mean(values) as number;
  const sd = stdDev(values) as number;
  const projected = played.filter((g) => g.projected !== null);
  return {
    thresholds,
    stdDev: round(sd, 2),
    variation: avg > 0 ? round(sd / avg, 2) : null,
    floor: Math.min(...values),
    ceiling: Math.max(...values),
    median: round(median(values) as number, 2),
    usefulGames: values.filter((v) => v >= thresholds.useful).length,
    usefulShare: round(values.filter((v) => v >= thresholds.useful).length / values.length, 3),
    boomGames: values.filter((v) => v >= thresholds.boom).length,
    bustGames: values.filter((v) => v < thresholds.bust).length,
    beatProjection:
      projected.length >= SAMPLE.minProjectedGames
        ? { beat: projected.filter((g) => (g.points as number) > (g.projected as number)).length, games: projected.length }
        : null,
  };
}

/** The volume number that best shows a position's role, per game. */
export function volumeOf(position: Position | null): { id: string; label: string; keys: StatKey[] } | null {
  switch (position) {
    case "QB":
      return { id: "passAttempts", label: "pass attempts", keys: ["passAtt"] };
    case "RB":
      return { id: "opportunities", label: "carries + targets", keys: ["rushAtt", "targets"] };
    case "WR":
    case "TE":
      return { id: "targets", label: "targets", keys: ["targets"] };
    case "K":
      return { id: "fgAttempts", label: "field-goal tries", keys: ["fgAtt"] };
    case "DST":
      return { id: "sacks", label: "sacks", keys: ["dstSack"] };
    default:
      return null;
  }
}

function trend(id: string, label: string, last3: number, season: number, minChange: number, unit: string): Trend {
  const diff = last3 - season;
  const direction =
    Math.abs(diff) >= minChange && Math.abs(diff) >= TREND_CHANGE * Math.abs(season) ? (diff > 0 ? "up" : "down") : "steady";
  return {
    id,
    label,
    last3: round(last3, 1),
    season: round(season, 1),
    direction,
    text: `Last 3 games: ${fixed(last3)} ${unit} a game vs ${fixed(season)} for the season.`,
    caveat: "3 games is a small sample: one big play or one blowout can swing it.",
  };
}

export function trendsOf(points: GamePoints[], profile: PlayerProfile, format: ScoringFormat): Trend[] {
  const played = profile.games.filter((g) => g.played);
  if (!profile.position || played.length < SAMPLE.minGamesForTrend) return [];
  const playedPoints = points.filter((g) => g.points !== null).map((g) => g.points as number);
  const last3Points = playedPoints.slice(-3);
  const out = [trend("points", `${FORMAT_LABEL[format]} points`, mean(last3Points) as number, mean(playedPoints) as number, 1, `${FORMAT_LABEL[format]} points`)];
  const volume = volumeOf(profile.position);
  if (volume) {
    const perGame = (games: typeof played) => sum(games.map((g) => sum(volume.keys.map((k) => g.stats[k] ?? 0)))) / games.length;
    out.push(trend(volume.id, volume.label, perGame(played.slice(-3)), perGame(played), 0.5, volume.label));
  }
  return out;
}

/**
 * A season-table line made scoreable: 2-point conversions are worth 2 in every
 * format whatever their type, and a 50+ kick is 50-59 unless the season's longest
 * make was 60+ (then one of them is counted as 60+).
 */
export function careerLine(season: CareerSeason): { line: StatLine; note: string | null } {
  const line: StatLine = { ...season.stats };
  if (season.twoPointConversions) line.rush2pt = (line.rush2pt ?? 0) + season.twoPointConversions;
  const notes: string[] = [];
  if (season.fgMade50Plus > 0) {
    const sixty = season.longFg !== null && season.longFg >= 60 ? 1 : 0;
    line.fgMade60 = (line.fgMade60 ?? 0) + sixty;
    line.fgMade50_59 = (line.fgMade50_59 ?? 0) + season.fgMade50Plus - sixty;
    if (sixty && season.fgMade50Plus > 1) notes.push("more than one 50+ kick may have been 60+ (1 point more each)");
  }
  if ((season.stats.passAtt ?? 0) > 0) notes.push("2-point passes aren't in the season table");
  return { line, note: notes.length ? `Estimated from the season table: ${notes.join("; ")}.` : null };
}

export function careerRows(profile: PlayerProfile, format: ScoringFormat, custom?: Readonly<ScoringRules> | null): CareerRow[] {
  const rules = custom ?? rulesForFormat(format);
  const official = new Map(profile.fantasy.seasonTotals.map((t) => [t.season, t]));
  const row = (season: number, teams: string[], games: number, points: number, source: CareerRow["source"], note: string | null): CareerRow => ({
    season,
    teams,
    games,
    points,
    pointsPerGame: games > 0 ? round(points / games, 1) : null,
    source,
    note,
  });
  const rows: CareerRow[] = profile.career.map((s) => {
    const exact = official.get(s.season);
    if (exact) return row(s.season, s.teams, exact.gamesPlayed, scoreStatLine(exact.stats, rules).total, "fantasy", null);
    const { line, note } = careerLine(s);
    return row(s.season, s.teams, s.gamesPlayed, scoreStatLine(line, rules).total, "season-table", note);
  });
  // Seasons only the fantasy feed knows (every D/ST season, or a career table that failed to load).
  for (const t of profile.fantasy.seasonTotals) {
    if (!rows.some((r) => r.season === t.season)) {
      rows.push(row(t.season, profile.team ? [profile.team.abbr] : [], t.gamesPlayed, scoreStatLine(t.stats, rules).total, "fantasy", null));
    }
  }
  return rows.sort((a, b) => a.season - b.season);
}

/** Share of fantasy points that came from touchdowns (null with no points). */
export function touchdownShare(numbers: SeasonNumbers, format: ScoringFormat, custom?: Readonly<ScoringRules> | null): number | null {
  const rules = custom ?? rulesForFormat(format);
  const total = scoreStatLine(numbers.line, rules).total;
  if (total <= 0) return null;
  const td: StatLine = {};
  for (const key of TD_KEYS) if (numbers.line[key]) td[key] = numbers.line[key];
  return round(scoreStatLine(td, rules).total / total, 3);
}

function unavailableFor(profile: PlayerProfile): string[] {
  if (profile.kind === "dst") {
    return [
      "Team defenses have no ESPN player page, bio or career table: only this season's games and fantasy totals for this season and last.",
      "Points allowed follow ESPN's fantasy rule (return and defensive TDs against the offense don't count), so they can differ from the scoreboard.",
    ];
  }
  const p = profile.position;
  const out = [
    "Snap counts and snap share: ESPN reports 0 for every player, so they aren't shown.",
    "Share of the team's targets or carries: not published.",
    "Week-by-week fantasy points before this season: only season totals.",
  ];
  if (p === "WR" || p === "TE" || p === "RB") {
    out.push("Red-zone targets: ESPN's red-zone split counts catches, not targets.");
    out.push("Air yards and routes game by game: only season averages (depth of target, yards per route run).");
  }
  if (p === "RB") out.push("Yards after contact and broken tackles: not published.");
  if (p === "QB") out.push("Pressure, time to throw and depth of throws: not published for passers.");
  if (p === "K") out.push("The distance of each kick: only ESPN's distance bands (under 40, 40-49, 50-59, 60+).");
  const a = profile.advanced;
  if (p !== "K" && Object.values(a).every((v) => v === null) && profile.games.some((g) => g.played)) {
    out.push("Tracking numbers (yards after catch, depth of target): ESPN hasn't published them for him this season.");
  }
  return out;
}

/**
 * `custom` = a league's own rules (lib/scoring/spec.ts). Points then follow the league exactly;
 * the "useful/boom/bust" lines still use the nearest preset (`format`).
 */
export function analyzePlayer(profile: PlayerProfile, format: ScoringFormat, custom?: Readonly<ScoringRules> | null): PlayerAnalysis {
  const points = gamePoints(profile, format, custom);
  const played = points.filter((g) => g.points !== null);
  const values = played.map((g) => g.points as number);
  const numbers = seasonNumbers(profile.games, profile.advanced);
  const level = sampleLevel(values.length);
  const missed = points.length - played.length;
  const best = played.reduce<GamePoints | null>((b, g) => (!b || (g.points as number) > (b.points as number) ? g : b), null);
  const worst = played.reduce<GamePoints | null>((w, g) => (!w || (g.points as number) < (w.points as number) ? g : w), null);
  const consistency = consistencyOf(points, profile.position, format);
  const trends = trendsOf(points, profile, format);
  const tdShare = touchdownShare(numbers, format, custom);
  const career = careerRows(profile, format, custom);

  const partial: Omit<PlayerAnalysis, "summary" | "signals" | "labels"> = {
    format,
    position: profile.position,
    sample: {
      gamesPlayed: values.length,
      gamesMissed: missed,
      level,
      note:
        level === "none"
          ? "He hasn't played a game this season."
          : level === "tiny"
            ? `Only ${values.length} game${values.length === 1 ? "" : "s"} played: not enough games yet to judge.`
            : level === "small"
              ? `${values.length} games played: a small sample, so treat averages as early reads.`
              : null,
    },
    games: points,
    totals: {
      points: round(sum(values), 2),
      average: values.length ? round(mean(values) as number, 2) : null,
      last3Average: values.length >= SAMPLE.minGames ? round(mean(values.slice(-3)) as number, 2) : null,
      best: best ? { week: best.week, points: best.points as number } : null,
      worst: worst ? { week: worst.week, points: worst.points as number } : null,
    },
    consistency,
    usage: usageMetrics(profile.position, numbers),
    advanced: advancedMetrics(profile.position, numbers, profile.advanced),
    redZone: redZoneMetrics(profile.position, numbers, profile.splits),
    trends,
    career,
    unavailable: unavailableFor(profile),
  };
  const signals = sustainabilitySignals(profile, partial, numbers, tdShare);
  const labels = roleLabels(profile, partial, numbers, tdShare);
  return { ...partial, signals, labels, summary: playerSummary(profile, { ...partial, signals, labels }, numbers) };
}

