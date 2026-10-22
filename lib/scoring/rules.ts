/**
 * Scoring rules: how many fantasy points each stat is worth.
 *
 * The presets below match ESPN's default league scoring, read from ESPN itself:
 * samples/fantasy-league-defaults-scoring.json (the "FFL PPR Scoring" defaults,
 * each value commented with ESPN's stat id). Later (Phase 9), imported ESPN
 * leagues will supply their own rules in this same shape.
 */
import type { StatKey } from "@/lib/stats";

/** Points per unit of each stat (per yard, per TD, ...). Stats not listed are worth 0. */
export type ScoringRules = Partial<Record<StatKey, number>>;

export const SCORING_FORMATS = ["standard", "half", "ppr"] as const;

/** How much a catch is worth: standard = 0, half = 0.5, ppr = 1 ("points per reception"). */
export type ScoringFormat = (typeof SCORING_FORMATS)[number];

// Everything except receptions is the same in all three formats.
// Attempts, completions, carries and targets aren't listed, so they score 0.
// The number after "ESPN" is ESPN's stat id in the defaults sample.
const ESPN_DEFAULT_RULES: ScoringRules = {
  passYds: 0.04, // ESPN 3: 1 point per 25 yards, fractional (10 yards = 0.4)
  passTd: 4, // ESPN 4
  passInt: -2, // ESPN 20
  pass2pt: 2, // ESPN 19
  rushYds: 0.1, // ESPN 24: 1 point per 10 yards, fractional
  rushTd: 6, // ESPN 25
  rush2pt: 2, // ESPN 26
  recYds: 0.1, // ESPN 42: 1 point per 10 yards, fractional
  recTd: 6, // ESPN 43
  rec2pt: 2, // ESPN 44
  fumLost: -2, // ESPN 72
  retTd: 6, // ESPN 101 + 102: kick or punt return TD (players and D/ST alike)
  fumRecTd: 6, // ESPN 63: offensive player recovers a fumble and scores

  // Kickers. Misses lose a point at any distance; a missed extra point costs nothing.
  fgMade0_39: 3, // ESPN 80
  fgMade40_49: 4, // ESPN 77
  fgMade50_59: 5, // ESPN 198
  fgMade60: 6, // ESPN 201
  fgMiss: -1, // ESPN 85
  xpMade: 1, // ESPN 86

  // Team defense / special teams (ESPN's values for the D/ST slot).
  dstSack: 1, // ESPN 99
  dstInt: 2, // ESPN 95
  dstFumRec: 2, // ESPN 96
  dstBlk: 2, // ESPN 97
  dstSafety: 2, // ESPN 98
  dstIntTd: 6, // ESPN 103
  dstFumTd: 6, // ESPN 104
  dstBlkTd: 6, // ESPN 93
  dst2ptRet: 2, // ESPN 206
  dst1ptSafety: 1, // ESPN 209
  // Points allowed: one tier is "on" at a time. 18-27 is worth 0.
  dstPa0: 5, // ESPN 89
  dstPa1_6: 4, // ESPN 90
  dstPa7_13: 3, // ESPN 91
  dstPa14_17: 1, // ESPN 92
  dstPa28_34: -1, // ESPN 123
  dstPa35_45: -3, // ESPN 124
  dstPa46: -5, // ESPN 125
  // Yards allowed: one tier is "on" at a time. 300-349 is worth 0.
  dstYa0_99: 5, // ESPN 128
  dstYa100_199: 3, // ESPN 129
  dstYa200_299: 2, // ESPN 130
  dstYa350_399: -1, // ESPN 132
  dstYa400_449: -3, // ESPN 133
  dstYa450_499: -5, // ESPN 134
  dstYa500_549: -6, // ESPN 135
  dstYa550: -7, // ESPN 136
};

/** The three built-in formats. Frozen so nothing can change them by accident. */
export const SCORING_PRESETS: Readonly<Record<ScoringFormat, Readonly<ScoringRules>>> =
  Object.freeze({
    standard: Object.freeze({ ...ESPN_DEFAULT_RULES, rec: 0 }),
    half: Object.freeze({ ...ESPN_DEFAULT_RULES, rec: 0.5 }),
    ppr: Object.freeze({ ...ESPN_DEFAULT_RULES, rec: 1 }),
  });

export function rulesForFormat(format: ScoringFormat): Readonly<ScoringRules> {
  return SCORING_PRESETS[format];
}
