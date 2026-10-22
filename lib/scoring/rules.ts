/**
 * Scoring rules: how many fantasy points each stat is worth.
 *
 * The presets below match ESPN's default offensive scoring. Later (Phase 9),
 * imported ESPN leagues will supply their own rules in this same shape.
 * Kicker and defense (D/ST) scoring also come in a later phase.
 */
import type { StatKey } from "@/lib/stats";

/** Points per unit of each stat (per yard, per TD, ...). Stats not listed are worth 0. */
export type ScoringRules = Partial<Record<StatKey, number>>;

export const SCORING_FORMATS = ["standard", "half", "ppr"] as const;

/** How much a catch is worth: standard = 0, half = 0.5, ppr = 1 ("points per reception"). */
export type ScoringFormat = (typeof SCORING_FORMATS)[number];

// Everything except receptions is the same in all three formats.
// Attempts, completions, carries and targets aren't listed, so they score 0.
const ESPN_DEFAULT_RULES: ScoringRules = {
  passYds: 0.04, // 1 point per 25 yards, fractional (10 yards = 0.4)
  passTd: 4,
  passInt: -2,
  pass2pt: 2,
  rushYds: 0.1, // 1 point per 10 yards, fractional
  rushTd: 6,
  rush2pt: 2,
  recYds: 0.1, // 1 point per 10 yards, fractional
  recTd: 6,
  rec2pt: 2,
  fumLost: -2,
  retTd: 6, // kick or punt return TD
  fumRecTd: 6, // offensive player recovers a fumble and scores
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
