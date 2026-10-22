/**
 * Turns a stat line into fantasy points.
 */
import { STAT_KEYS, type StatKey, type StatLine } from "@/lib/stats";
import { SCORING_PRESETS, type ScoringFormat, type ScoringRules } from "./rules";

/** One line of the "how did they get these points" breakdown. */
export type ScoringPart = {
  key: StatKey;
  amount: number; // the stat itself, e.g. 74 (yards)
  points: number; // what it was worth, e.g. 7.4
};

export type ScoreResult = {
  total: number;
  parts: ScoringPart[];
};

// Display order for parts: passing, then rushing, then receiving, then
// returns and fumbles. Within each group: yards, TD, 2-pt, then catches.
// That reads like a play description: "+7.4 yds, +6 TD, +1 reception".
const PREFERRED_ORDER: StatKey[] = [
  "passYds", "passTd", "pass2pt", "passInt",
  "rushYds", "rushTd", "rush2pt",
  "recYds", "recTd", "rec2pt", "rec",
  "retTd", "fumRecTd", "fumLost",
  // These score 0 in the presets, but a custom league might reward them.
  "passCmp", "passAtt", "rushAtt", "targets",
];

/** Every stat key in display order. A key added to lib/stats.ts later goes at the end. */
export const SCORING_ORDER: readonly StatKey[] = [
  ...PREFERRED_ORDER,
  ...STAT_KEYS.filter((key) => !PREFERRED_ORDER.includes(key)),
];

/**
 * Rounds points to 2 decimals (or `decimals`), getting rid of floating-point
 * leftovers like 0.1 * 3 = 0.30000000000000004. Halves round away from zero
 * (1.005 -> 1.01, -1.005 -> -1.01). Never returns -0.
 */
export function roundPoints(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  // toPrecision(12) trims the tiny error first, so 100.49999999999999 counts as 100.5.
  const scaled = Number(Math.abs(value * factor).toPrecision(12));
  const rounded = (Math.sign(value) * Math.round(scaled)) / factor;
  return rounded === 0 ? 0 : rounded; // turns -0 into 0
}

/** Scores a stat line (one play, one game, or a season) with the given rules. */
export function scoreStatLine(stats: StatLine, rules: Readonly<ScoringRules>): ScoreResult {
  const parts: ScoringPart[] = [];
  let exactTotal = 0;

  for (const key of SCORING_ORDER) {
    const amount = stats[key] ?? 0;
    const exactPoints = amount * (rules[key] ?? 0);
    exactTotal += exactPoints;

    const points = roundPoints(exactPoints);
    if (points !== 0) parts.push({ key, amount, points });
  }

  // We round the exact total once, instead of adding up the rounded parts.
  // Adding rounded parts can be off by a cent with unusual league rules
  // (e.g. two parts of 0.125 show as 0.13 each, but the real total is 0.25).
  return { total: roundPoints(exactTotal), parts };
}

/** Totals for all three formats at once, so each play can store all of them. */
export function scoreAllFormats(stats: StatLine): Record<ScoringFormat, number> {
  return {
    standard: scoreStatLine(stats, SCORING_PRESETS.standard).total,
    half: scoreStatLine(stats, SCORING_PRESETS.half).total,
    ppr: scoreStatLine(stats, SCORING_PRESETS.ppr).total,
  };
}
