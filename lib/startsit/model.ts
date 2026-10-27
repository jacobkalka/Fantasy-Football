/**
 * The Start/Sit model: rules-based and explainable. No fetching here, so every
 * rule can be tested with hand-made numbers (model.test.ts).
 *
 * How a player's number is built:
 *   1. Start from ESPN's projection for this week (in your scoring format).
 *   2. Nudge it up or down by a small, capped percentage for each factor:
 *      matchup, recent form, Vegas game total, weather. ESPN's projection already
 *      thinks about most of these, so the nudges are deliberately small; they
 *      break near-ties more than they overturn big gaps.
 *   3. Apply injury risk (Questionable, Doubtful).
 *   4. Estimate a floor and ceiling from how much the player's weekly points swing.
 *
 * Comparing players: the bigger the gap between their numbers compared with how
 * much they swing, the higher the confidence. Missing data lowers it.
 */
import { ordinal } from "@/lib/format";
import type { InjuryStatus, OffensePosition } from "@/lib/providers/types";
import { roundPoints, type ScoringFormat } from "@/lib/scoring";
import type {
  Confidence,
  FactorKey,
  FactorResult,
  PlayerFactors,
  PlayerVerdict,
  Reason,
  Recommendation,
} from "./types";

/** Every tunable number in one place. Changing one is a decision: log it in DECISIONS.md. */
export const MODEL = {
  /** Defense vs. position. +30% points allowed vs. average → +7.5%, capped at ±8%. */
  matchup: { weight: 0.25, cap: 0.08, fullTrustGames: 4 },
  /** Last 3 games vs. season average. Recent form predicts little on its own, so it's light. */
  form: { weight: 0.15, cap: 0.06, recentGames: 3, minGames: 3 },
  /** Vegas implied team total vs. the week's average. +20% → +6% (the cap). */
  vegas: { weight: 0.3, cap: 0.06, fallbackAverage: 22.5 },
  /** Bad weather mostly hurts passing (QB, WR, TE). ESPN gives no wind speed, only words. */
  weather: { rain: -0.04, snow: -0.06, wind: -0.03, cold: -0.02, coldAtOrBelowF: 25 },
  /** All non-injury nudges together can't move a player more than ±18%. */
  totalCap: 0.18,
  /** Expected-value hit for an injury designation (an inactive player scores 0). */
  injury: { QUESTIONABLE: -0.1, DOUBTFUL: -0.6, DAY_TO_DAY: -0.05 } as Partial<Record<InjuryStatus, number>>,
  /** With no projection, start from this share of the recent average. */
  noProjectionShrink: 0.9,
  /** How much weekly points swing, as a share of the score (typical values by position). */
  swing: {
    byPosition: { QB: 0.38, RB: 0.5, WR: 0.55, TE: 0.6 } as Record<OffensePosition, number>,
    /** The position's typical swing counts like this many games of the player's own history. */
    priorGames: 4,
    min: 0.25,
    max: 0.9,
    minPoints: 1.5,
    questionableWiden: 1.25,
    /** Floor/ceiling = score ∓ 0.85 × swing: roughly the 20th and 80th percentile week. */
    band: 0.85,
  },
  /** How much each input counts toward "data quality". */
  quality: { projection: 0.45, matchup: 0.15, form: 0.15, vegas: 0.15, injury: 0.1 },
  /** Chance to outscore the other player: 62%+ = Solid, 75%+ = Strong, below = Lean. */
  confidence: { solid: 0.62, strong: 0.75 },
} as const;

const PASSING: OffensePosition[] = ["QB", "WR", "TE"];
const FORMAT_LABEL: Record<ScoringFormat, string> = { standard: "standard", half: "half-PPR", ppr: "PPR" };
const INJURY_WORD: Partial<Record<InjuryStatus, string>> = {
  QUESTIONABLE: "Questionable",
  DOUBTFUL: "Doubtful",
  OUT: "Out",
  INJURY_RESERVE: "on injured reserve",
  SUSPENSION: "Suspended",
  DAY_TO_DAY: "Day-to-day",
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const one = (value: number) => roundPoints(value, 1).toFixed(1);
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(roundPoints(value, 1)).toFixed(1)}`;

/** "Ja'Marr Chase" → "J. Chase". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** "the 3rd-toughest" for rank 3, "the 2nd-easiest" for rank 31 of 32. */
export function toughnessLabel(rank: number, teams: number): string {
  return rank <= teams / 2 ? `the ${ordinal(rank)}-toughest` : `the ${ordinal(teams + 1 - rank)}-easiest`;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, accurate to ~1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Recent average (last 3 games) and season average, when there are enough games. */
export function formOf(recent: PlayerFactors["recent"]) {
  if (recent.length < MODEL.form.minGames) return null;
  const points = recent.map((w) => w.points);
  return {
    recentAverage: mean(points.slice(-MODEL.form.recentGames)),
    seasonAverage: mean(points),
    games: points.length,
  };
}

/** Rain, snow or wind in the forecast words, plus cold. Indoors there's no effect. */
export function weatherEffect(weather: PlayerFactors["weather"], position: OffensePosition) {
  if (!weather || weather.indoor) return { pct: 0, conditions: [] as string[] };
  const text = (weather.text ?? "").toLowerCase();
  const conditions: string[] = [];
  let pct = 0;
  if (/snow|flurr|sleet|wintry|ice/.test(text)) {
    conditions.push("snow");
    pct += MODEL.weather.snow;
  } else if (/rain|shower|storm|thunder|drizzle/.test(text)) {
    conditions.push("rain");
    pct += MODEL.weather.rain;
  }
  if (/wind/.test(text)) {
    conditions.push("wind");
    pct += MODEL.weather.wind;
  }
  if (weather.temperature !== undefined && weather.temperature <= MODEL.weather.coldAtOrBelowF) {
    conditions.push("cold");
    pct += MODEL.weather.cold;
  }
  // Running backs barely notice; the passing game takes the hit.
  return { pct: PASSING.includes(position) ? pct : 0, conditions };
}

type Adjustment = Omit<FactorResult, "points">;

function matchupAdjustment(f: PlayerFactors): Adjustment {
  const m = f.matchup;
  if (!m || m.leagueAverage <= 0) {
    return { key: "matchup", label: "Matchup", pct: 0, available: false, detail: "No matchup data yet this season." };
  }
  const trust = Math.min(1, m.games / MODEL.matchup.fullTrustGames);
  const diff = (m.allowedPerGame - m.leagueAverage) / m.leagueAverage;
  const pct = clamp(diff * MODEL.matchup.weight * trust, -MODEL.matchup.cap, MODEL.matchup.cap);
  const where = f.game ? (f.game.isHome ? "vs" : "at") : "vs";
  return {
    key: "matchup",
    label: "Matchup",
    pct,
    available: true,
    detail: `${where} ${m.opponentAbbr}: ${toughnessLabel(m.rank, m.teams)} defense vs ${f.position}s, allowing ${one(m.allowedPerGame)} pts a game (average ${one(m.leagueAverage)}).`,
  };
}

function formAdjustment(f: PlayerFactors): Adjustment {
  const form = formOf(f.recent);
  if (!form) {
    return { key: "form", label: "Recent form", pct: 0, available: false, detail: "Fewer than 3 games played this season." };
  }
  const diff = (form.recentAverage - form.seasonAverage) / Math.max(form.seasonAverage, 5);
  const pct = clamp(diff * MODEL.form.weight, -MODEL.form.cap, MODEL.form.cap);
  const trend = Math.abs(diff) < 0.05 ? "steady" : diff > 0 ? "trending up" : "trending down";
  return {
    key: "form",
    label: "Recent form",
    pct,
    available: true,
    detail: `${one(form.recentAverage)} pts a game over the last ${Math.min(MODEL.form.recentGames, form.games)}, ${one(form.seasonAverage)} for the season (${trend}).`,
  };
}

function vegasAdjustment(f: PlayerFactors): Adjustment {
  const v = f.vegas;
  if (!v || v.leagueAverage <= 0) {
    return { key: "vegas", label: "Game total", pct: 0, available: false, detail: "No betting line yet for this game." };
  }
  const diff = (v.impliedTotal - v.leagueAverage) / v.leagueAverage;
  const pct = clamp(diff * MODEL.vegas.weight, -MODEL.vegas.cap, MODEL.vegas.cap);
  const side = v.spread < 0 ? `favored by ${Math.abs(v.spread)}` : v.spread > 0 ? `underdog by ${v.spread}` : "even game";
  return {
    key: "vegas",
    label: "Game total",
    pct,
    available: true,
    detail: `Vegas expects ${v.teamAbbr} to score ${one(v.impliedTotal)} (${side}, over/under ${v.overUnder}); this week's average is ${one(v.leagueAverage)}.`,
  };
}

function weatherAdjustment(f: PlayerFactors): Adjustment {
  const w = f.weather;
  if (!w) return { key: "weather", label: "Weather", pct: 0, available: false, detail: "No forecast yet." };
  if (w.indoor) return { key: "weather", label: "Weather", pct: 0, available: true, detail: "Indoors: weather can't matter." };
  const { pct, conditions } = weatherEffect(w, f.position);
  const forecast = [w.text, w.temperature !== undefined ? `${w.temperature}°F` : null].filter(Boolean).join(", ");
  if (!forecast) return { key: "weather", label: "Weather", pct: 0, available: false, detail: "No forecast yet." };
  const effect =
    conditions.length === 0
      ? "no weather worries"
      : pct === 0
        ? `${conditions.join(" and ")} barely affects running backs`
        : `${conditions.join(" and ")} can slow the passing game`;
  return { key: "weather", label: "Weather", pct, available: true, detail: `Outdoors: ${forecast} (${effect}).` };
}

function injuryAdjustment(f: PlayerFactors): Adjustment {
  const status = f.injuryStatus;
  if (status === null) {
    return { key: "injury", label: "Injury", pct: 0, available: false, detail: "Injury report unavailable." };
  }
  const pct = MODEL.injury[status] ?? 0;
  const detail =
    pct !== 0
      ? `Listed ${INJURY_WORD[status]}: there's a real chance of sitting out or playing hurt.`
      : status === "UNKNOWN"
        ? "Status unclear on the injury report."
        : "No injury designation.";
  return { key: "injury", label: "Injury", pct, available: true, detail };
}

function unavailableText(f: PlayerFactors): string {
  if (f.unavailable === "bye") return "is on bye";
  if (f.unavailable === "no-game") return "has no game";
  return `is ${INJURY_WORD[f.injuryStatus ?? "OUT"] ?? "out"}`;
}

/** Scores one player. */
export function scorePlayer(f: PlayerFactors): PlayerVerdict {
  if (f.unavailable) {
    return {
      ...f,
      playing: false,
      base: 0,
      score: 0,
      floor: 0,
      ceiling: 0,
      spread: 0,
      dataQuality: 1,
      factors: [
        {
          key: "availability",
          label: "Availability",
          points: 0,
          pct: -1,
          available: true,
          detail: `${f.name} ${unavailableText(f)} this week, so scores 0. Automatic sit.`,
        },
      ],
    };
  }

  // 1. The starting number.
  let base = 0;
  let baseDetail: string;
  if (f.projection !== null) {
    base = f.projection;
    baseDetail = `ESPN projects ${one(base)} pts this week.`;
  } else if (f.recent.length > 0) {
    const last = f.recent.slice(-4).map((w) => w.points);
    base = Math.max(0, mean(last) * MODEL.noProjectionShrink);
    baseDetail = `No ESPN projection, so we start from 90% of the recent average (${one(mean(last))} over ${last.length} games).`;
  } else {
    baseDetail = "No ESPN projection and no games played this season.";
  }

  // 2. Nudges, capped together so no combination can swamp the projection.
  const nudges = [matchupAdjustment(f), formAdjustment(f), vegasAdjustment(f), weatherAdjustment(f)];
  const total = nudges.reduce((sum, n) => sum + n.pct, 0);
  if (Math.abs(total) > MODEL.totalCap) {
    const scale = MODEL.totalCap / Math.abs(total);
    for (const n of nudges) n.pct *= scale;
  }
  // 3. Injury risk on top.
  const injury = injuryAdjustment(f);
  const adjustments = [...nudges, injury];
  const pctTotal = adjustments.reduce((sum, n) => sum + n.pct, 0);
  const score = Math.max(0, base * (1 + pctTotal));

  // 4. How much this player swings: his own history blended with his position's norm.
  const s = MODEL.swing;
  let swingShare = s.byPosition[f.position];
  const points = f.recent.map((w) => w.points);
  if (points.length >= 2 && mean(points) >= 1) {
    const avg = mean(points);
    const sd = Math.sqrt(points.reduce((sum, p) => sum + (p - avg) ** 2, 0) / (points.length - 1));
    swingShare = (points.length * (sd / avg) + s.priorGames * swingShare) / (points.length + s.priorGames);
  }
  swingShare = clamp(swingShare, s.min, s.max);
  let spread = Math.max(s.minPoints, score * swingShare);
  if (f.injuryStatus === "QUESTIONABLE" || f.injuryStatus === "DOUBTFUL") spread *= s.questionableWiden;

  const q = MODEL.quality;
  const has = (key: FactorKey) => adjustments.find((a) => a.key === key)?.available ?? false;
  const dataQuality =
    (f.projection !== null ? q.projection : 0) +
    (has("matchup") ? q.matchup : 0) +
    (has("form") ? q.form : 0) +
    (has("vegas") ? q.vegas : 0) +
    (has("injury") ? q.injury : 0);

  const factors: FactorResult[] = [
    { key: "projection", label: "Projection", points: roundPoints(base), pct: 0, available: f.projection !== null, detail: baseDetail },
    ...adjustments.map((a) => ({ ...a, points: roundPoints(base * a.pct) })),
  ];

  return {
    ...f,
    playing: true,
    base: roundPoints(base),
    score: roundPoints(score),
    floor: roundPoints(Math.max(0, score - s.band * spread)),
    ceiling: roundPoints(score + s.band * spread),
    spread: roundPoints(spread),
    factors,
    dataQuality: roundPoints(dataQuality),
  };
}

// ── Comparing players ────────────────────────────────────────────────────────

function factor(p: PlayerVerdict, key: FactorKey) {
  return p.factors.find((f) => f.key === key);
}

function vsAt(p: PlayerVerdict) {
  return p.game && !p.game.isHome ? "at" : "vs";
}

function matchupText(w: PlayerVerdict, r: PlayerVerdict): string {
  // The second half is shorter when it would repeat "defense vs WRs".
  const part = (p: PlayerVerdict, short: boolean) =>
    p.matchup
      ? short
        ? `${shortName(p.name)} plays ${vsAt(p)} ${p.matchup.opponentAbbr}, ${toughnessLabel(p.matchup.rank, p.matchup.teams)} (${one(p.matchup.allowedPerGame)})`
        : `${shortName(p.name)} plays ${vsAt(p)} ${p.matchup.opponentAbbr}, ${toughnessLabel(p.matchup.rank, p.matchup.teams)} defense vs ${p.position}s (${one(p.matchup.allowedPerGame)} pts allowed a game)`
      : `there's no matchup data for ${shortName(p.name)} yet`;
  const text = `${part(w, false)}; ${part(r, Boolean(w.matchup) && w.position === r.position)}.`;
  return text[0].toUpperCase() + text.slice(1);
}

function formText(w: PlayerVerdict, r: PlayerVerdict): string {
  const part = (p: PlayerVerdict) => {
    const form = formOf(p.recent);
    if (!form) return `${shortName(p.name)} has fewer than 3 games this season`;
    const change = (form.recentAverage - form.seasonAverage) / Math.max(form.seasonAverage, 5);
    const season = one(form.seasonAverage);
    const vs = Math.abs(change) < 0.05 ? `close to the ${season} season average` : `${change > 0 ? "up from" : "down from"} ${season} for the season`;
    return `${shortName(p.name)} has averaged ${one(form.recentAverage)} over the last ${Math.min(3, form.games)} games (${vs})`;
  };
  return `${part(w)}; ${part(r)}.`;
}

function vegasText(w: PlayerVerdict, r: PlayerVerdict): string {
  const part = (p: PlayerVerdict) =>
    p.vegas ? `${p.vegas.teamAbbr} ${one(p.vegas.impliedTotal)}` : `no line yet for ${p.teamAbbr ?? shortName(p.name)}`;
  const average = w.vegas?.leagueAverage ?? r.vegas?.leagueAverage;
  return `Points Vegas expects each team to score: ${part(w)}, ${part(r)}${average ? ` (this week's average: ${one(average)})` : ""}.`;
}

function injuryText(w: PlayerVerdict, r: PlayerVerdict): string {
  return [w, r]
    .filter((p) => (factor(p, "injury")?.pct ?? 0) !== 0)
    .map((p) => `${shortName(p.name)} is listed ${INJURY_WORD[p.injuryStatus!]} (${signed(factor(p, "injury")!.points)} pts)`)
    .join("; ")
    .concat(".");
}

function weatherText(w: PlayerVerdict, r: PlayerVerdict): string {
  return [w, r]
    .filter((p) => (factor(p, "weather")?.pct ?? 0) !== 0)
    .map((p) => {
      const { conditions } = weatherEffect(p.weather, p.position);
      return `${shortName(p.name)} plays outdoors with ${conditions.join(" and ")} in the forecast (${signed(factor(p, "weather")!.points)} pts)`;
    })
    .join("; ")
    .concat(".");
}

const COMPARE_TEXT: Partial<Record<FactorKey, (w: PlayerVerdict, r: PlayerVerdict) => string>> = {
  matchup: matchupText,
  form: formText,
  vegas: vegasText,
  injury: injuryText,
  weather: weatherText,
};

/** The reasons behind "start W over R", biggest difference in points first. */
export function buildReasons(w: PlayerVerdict, r: PlayerVerdict, format: ScoringFormat, label: string = FORMAT_LABEL[format]): Reason[] {
  if (!r.playing) {
    return [
      {
        key: "availability",
        impact: Math.max(1, w.score),
        favors: w.playerId,
        text: `${r.name} ${unavailableText(r)} this week and can't score for you.`,
      },
      {
        key: "projection",
        impact: w.base,
        favors: w.playerId,
        text: `${shortName(w.name)} is projected for ${one(w.score)} pts (${label}).`,
      },
    ];
  }

  const reasons: Reason[] = [];
  const favors = (diff: number) => (diff > 0.005 ? w.playerId : diff < -0.005 ? r.playerId : null);

  const projDiff = w.base - r.base;
  const noProjection = [w, r].filter((p) => p.projection === null);
  reasons.push({
    key: "projection",
    impact: Math.abs(projDiff),
    favors: favors(projDiff),
    text:
      noProjection.length === 0
        ? `ESPN projects ${shortName(w.name)} for ${one(w.base)} pts and ${shortName(r.name)} for ${one(r.base)} (${label}).`
        : `${noProjection.map((p) => shortName(p.name)).join(" and ")} ${noProjection.length > 1 ? "have" : "has"} no ESPN projection, so we started from the recent average: ${shortName(w.name)} ${one(w.base)}, ${shortName(r.name)} ${one(r.base)}.`,
  });

  for (const key of ["matchup", "injury", "form", "vegas", "weather"] as FactorKey[]) {
    const a = factor(w, key);
    const b = factor(r, key);
    if (!a?.available && !b?.available) continue;
    const diff = (a?.points ?? 0) - (b?.points ?? 0);
    if (Math.abs(diff) < 0.05) continue;
    const text = COMPARE_TEXT[key]?.(w, r);
    if (text) reasons.push({ key, impact: roundPoints(Math.abs(diff)), favors: favors(diff), text });
  }

  return reasons
    .map((reason) => ({ ...reason, impact: roundPoints(reason.impact) }))
    .sort((x, y) => y.impact - x.impact)
    .slice(0, 5);
}

/** "Sun 1:00 PM ET": NFL kickoffs are announced in Eastern time, and the server doesn't know yours. */
export function kickoffEt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const text = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} ET`;
}

const RISKY: InjuryStatus[] = ["QUESTIONABLE", "DOUBTFUL", "DAY_TO_DAY"];
/** Positions that can play in a FLEX spot. */
const FLEX: OffensePosition[] = ["RB", "WR", "TE"];

/** Kickoff-time strategy, locked games and missing data: worth knowing, but they don't change the numbers. */
export function buildNotes(w: PlayerVerdict, r: PlayerVerdict): string[] {
  const notes: string[] = [];
  for (const p of [w, r]) {
    if (p.playing && p.game && p.game.state !== "pre") {
      notes.push(`${shortName(p.name)}'s game has already started, so that lineup spot is locked.`);
    }
  }

  if (w.playing && r.playing && w.game && r.game && w.game.state === "pre" && r.game.state === "pre") {
    const gap = Date.parse(w.game.kickoff) - Date.parse(r.game.kickoff);
    if (Math.abs(gap) >= 60 * 60 * 1000) {
      const [early, late] = gap < 0 ? [w, r] : [r, w];
      const lateTime = kickoffEt(late.game!.kickoff);
      if (early.injuryStatus && RISKY.includes(early.injuryStatus)) {
        notes.push(
          `Teams announce who's inactive about 90 minutes before kickoff, so you'll know whether ${shortName(early.name)} plays before ${shortName(late.name)}'s game (${lateTime}). ${shortName(late.name)} stays available as a backup.`,
        );
      } else if (late.injuryStatus && RISKY.includes(late.injuryStatus)) {
        notes.push(
          `${shortName(late.name)} is banged up and plays later (${lateTime}). By the time that status is final, ${shortName(early.name)}'s game will have started, so you can't switch back.`,
        );
      } else if (FLEX.includes(late.position) && FLEX.includes(early.position)) {
        notes.push(
          `${shortName(late.name)} plays later (${lateTime}). If you start ${shortName(late.name)}, a FLEX spot keeps the option to swap in a bench player whose game hasn't started.`,
        );
      } else {
        notes.push(`${shortName(late.name)} plays later (${lateTime}); ${shortName(early.name)}'s game kicks off first.`);
      }
    }
  }

  for (const p of [w, r]) {
    if (!p.playing || p.dataQuality >= 0.85) continue;
    const missing = p.factors.filter((f) => !f.available).map((f) => f.label.toLowerCase());
    if (missing.length) notes.push(`Missing for ${shortName(p.name)}: ${missing.join(", ")}. That lowers the confidence.`);
  }
  return notes;
}

/** Confidence from the chance the pick outscores the other player. */
export function confidenceFor(chance: number): Confidence {
  if (chance >= MODEL.confidence.strong) return "Strong";
  if (chance >= MODEL.confidence.solid) return "Solid";
  return "Lean";
}

/**
 * Scores and ranks 2+ players and recommends who to start.
 * Ties go to the higher floor (the safer play).
 */
export function decide(players: PlayerFactors[], format: ScoringFormat, label?: string) {
  const ranked = players
    .map(scorePlayer)
    .sort((a, b) => b.score - a.score || b.floor - a.floor || a.name.localeCompare(b.name));

  if (ranked.length < 2) {
    return { players: ranked, recommendation: null, noRecommendation: "Pick at least two players to compare." };
  }
  if (!ranked.some((p) => p.playing)) {
    return { players: ranked, recommendation: null, noRecommendation: "None of these players has a game this week." };
  }

  const [w, r] = ranked;
  let chance: number;
  if (!r.playing) {
    chance = 0.99;
  } else {
    const gap = w.score - r.score;
    const swing = Math.sqrt(w.spread ** 2 + r.spread ** 2) || 1;
    // Less data → less sure: with every input present the gap counts fully; with half, 75%.
    const trust = 0.5 + 0.5 * Math.min(w.dataQuality, r.dataQuality);
    chance = clamp(normalCdf((gap / swing) * trust), 0.5, 0.99);
    // Without a projection for either player, never claim more than a Lean.
    if (w.projection === null || r.projection === null) chance = Math.min(chance, MODEL.confidence.solid - 0.01);
  }

  const recommendation: Recommendation = {
    startId: w.playerId,
    overId: r.playerId,
    confidence: confidenceFor(chance),
    chance: roundPoints(chance),
    reasons: buildReasons(w, r, format, label),
    notes: buildNotes(w, r),
  };
  return { players: ranked, recommendation, noRecommendation: undefined };
}
