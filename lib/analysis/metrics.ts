/**
 * Per-player numbers the analysis is built on. All pure, all from real data;
 * anything that can't be computed honestly is null.
 */
import type { AnalysisPlayer } from "./universe";

/** Games needed before week-to-week numbers (upside, consistency, trends) mean anything. */
export const MIN_GAMES = 3;

/**
 * Expected points per remaining game of his NFL team: ESPN's rest-of-season points spread over
 * every game his team has left. A player ESPN expects to miss 2 of 11 games counts 9/11 of his
 * per-game rate. Null without an ESPN rest-of-season projection.
 */
export function expectedPerGame(p: AnalysisPlayer): number | null {
  if (!p.ros) return null;
  if (p.ros.teamGames <= 0) return 0;
  return p.ros.points / p.ros.teamGames;
}

/** Same, with "no projection" counted as 0 (for lineups and rankings). */
export function xppg(p: AnalysisPlayer): number {
  return expectedPerGame(p) ?? 0;
}

/** Points per game ESPN projects when he plays (no injury discount). */
export function projectedRate(p: AnalysisPlayer): number | null {
  if (!p.ros || p.ros.games <= 0) return null;
  return p.ros.points / p.ros.games;
}

/** Share of his team's remaining games ESPN expects him to play (0-1). */
export function availabilityShare(p: AnalysisPlayer): number | null {
  if (!p.ros) return null;
  if (p.ros.teamGames <= 0) return 1;
  return Math.min(1, Math.max(0, p.ros.games / p.ros.teamGames));
}

export function seasonPerGame(p: AnalysisPlayer): number | null {
  return p.games.length > 0 ? p.seasonPoints / p.games.length : null;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Average of his last `n` games played; null until he has `n` games plus at least one before them. */
export function recentPerGame(p: AnalysisPlayer, n = 3): number | null {
  if (p.games.length < n + 1) return null;
  return mean(p.games.slice(-n).map((g) => g.points));
}

/** Chances per game (targets + carries) over his last `n` games and over the whole season. */
export function usageTrend(p: AnalysisPlayer, n = 3): { recent: number; season: number } | null {
  if (p.games.length < n + 1 || p.games.some((g) => g.opportunities === null)) return null;
  const opps = p.games.map((g) => g.opportunities ?? 0);
  return { recent: mean(opps.slice(-n)), season: mean(opps) };
}

/**
 * How much his weekly points swing: standard deviation ÷ average (0.3 = steady, 0.8 = boom/bust).
 * Null under MIN_GAMES games or when he averages no points.
 */
export function volatility(p: AnalysisPlayer): number | null {
  if (p.games.length < MIN_GAMES) return null;
  const pts = p.games.map((g) => g.points);
  const avg = mean(pts);
  if (avg <= 0) return null;
  const sd = Math.sqrt(mean(pts.map((v) => (v - avg) ** 2)));
  return sd / avg;
}

/** His ceiling: the average of his two best games. Null under MIN_GAMES games. */
export function ceiling(p: AnalysisPlayer): number | null {
  if (p.games.length < MIN_GAMES) return null;
  const best = p.games.map((g) => g.points).sort((a, b) => b - a);
  return (best[0] + best[1]) / 2;
}

/** "14.2" */
export function fmt(n: number, digits = 1): string {
  const v = Number(n.toFixed(digits));
  return (v === 0 ? 0 : v).toFixed(digits);
}

/** "+1.4" / "−0.6" (real minus sign, like the rest of the app). */
export function signed(n: number, digits = 1): string {
  const v = Number(n.toFixed(digits));
  if (v === 0) return (0).toFixed(digits);
  return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(digits);
}

/** "RB12" style rank of a value among a sorted (best first) list of values. */
export function rankOf(value: number, sortedDesc: readonly number[]): number {
  let rank = 1;
  while (rank <= sortedDesc.length && sortedDesc[rank - 1] > value) rank++;
  return rank;
}
