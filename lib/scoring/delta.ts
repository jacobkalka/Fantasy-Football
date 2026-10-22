/**
 * Working with changes between two stat lines, e.g. a player's totals
 * before and after a play, or before and after a stat correction.
 */
import { STAT_KEYS, type StatLine } from "@/lib/stats";
import type { ScoringRules } from "./rules";
import { scoreStatLine, type ScoringPart } from "./score";

export type DeltaScore = {
  points: number; // can be negative (e.g. a TD taken away)
  parts: ScoringPart[];
};

/** What changed from `before` to `after`. Only changed keys are included; values can be negative. */
export function diffStatLines(before: StatLine, after: StatLine): StatLine {
  const delta: StatLine = {};
  for (const key of STAT_KEYS) {
    const change = (after[key] ?? 0) - (before[key] ?? 0);
    if (change !== 0) delta[key] = change;
  }
  return delta;
}

/** Points for one play's worth of change. */
export function scoreDelta(delta: StatLine, rules: Readonly<ScoringRules>): DeltaScore {
  const { total, parts } = scoreStatLine(delta, rules);
  return { points: total, parts };
}

/**
 * Adds two stat lines together. Keys that add up to 0 are left out (missing means zero).
 * Rebuild a game from its plays with: plays.reduce((sum, play) => addStatLines(sum, play), {})
 */
export function addStatLines(a: StatLine, b: StatLine): StatLine {
  const sum: StatLine = {};
  for (const key of STAT_KEYS) {
    const value = (a[key] ?? 0) + (b[key] ?? 0);
    if (value !== 0) sum[key] = value;
  }
  return sum;
}
