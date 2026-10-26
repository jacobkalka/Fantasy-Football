/**
 * Live projections and win probability (DECISIONS.md, "Projections").
 *
 * Two kinds of numbers, always labeled differently on screen:
 *
 * 1. SOURCE numbers: ESPN's own. ESPN publishes a pregame projection per player, and for a
 *    connected ESPN league also a live projected final per team (`totalProjectedPointsLive`)
 *    and a live win probability. When ESPN gives a number, it's shown as ESPN's.
 *
 * 2. APP ESTIMATES ("FantasyLab estimate"), computed here when ESPN has none:
 *    - Player live projection = points so far + ESPN's pregame projection × share of his game
 *      still to play (by the game clock). Before kickoff it equals the projection; at the final
 *      whistle it equals his points. A player who's out (or has no game) adds nothing more.
 *    - Team projection = the sum of its starters' live projections.
 *    - Win probability: the remaining points of each team are uncertain. A player's weekly score
 *      varies with a standard deviation of a share of his projection that depends on position
 *      (QB 38%, RB 50%, WR 55%, TE 60%: the same typical swings the Start/Sit model uses,
 *      lib/startsit/model.ts; kickers and D/STs aren't measured there, so 60% is assumed), and the
 *      part still to play scales with the square root of the time left. The final margin is treated as normally distributed
 *      around the projected margin: P(win) = Φ(margin / √(σ_me² + σ_them²)).
 *      With no uncertainty left (all games over) it's 1, 0 or 0.5 for a tie.
 *
 * Nothing here invents a projection: without ESPN's pregame projection a player contributes
 * only the points he already has, and the team says how many players had no projection.
 */
import type { PlayerLive } from "@/lib/live/types";
import type { Position } from "@/lib/providers/types";

/** Weekly fantasy scores vary by about this share of the projection (one standard deviation). */
export const WEEKLY_SPREAD: Record<Position, number> = { QB: 0.38, RB: 0.5, WR: 0.55, TE: 0.6, K: 0.6, DST: 0.6 };

const OUT = new Set(["OUT", "INJURY_RESERVE", "SUSPENSION"]);

export interface PlayerProjection {
  points: number;
  /** Projected final for the week (app estimate). */
  projected: number;
  /** Share of the projection still to come, 0-1. */
  remaining: number;
  /** Standard deviation of what's still to come. */
  sd: number;
  /** ESPN had a pregame projection for him. */
  hasProjection: boolean;
}

/** Share of a game still to play from a live player's game (0 when final, 1 before kickoff). */
export function remainingShareOf(p: PlayerLive): number {
  const g = p.game;
  if (!g) return 0;
  if (g.state === "pre") return 1;
  if (g.state === "post" || g.period > 4) return g.state === "post" ? 0 : 0.03;
  const [m, s] = g.clock.split(":").map(Number);
  const clockLeft = (Number.isFinite(m) ? m : 0) + (Number.isFinite(s) ? s : 0) / 60;
  return Math.max(0, Math.min(1, ((4 - g.period) * 15 + Math.min(15, clockLeft)) / 60));
}

export function projectPlayer(p: PlayerLive): PlayerProjection {
  const out = OUT.has(p.injuryStatus ?? "") && p.game?.state === "pre";
  const base = p.projection;
  const remaining = !p.game || p.onBye || out ? 0 : remainingShareOf(p);
  const rest = base === null ? 0 : Math.max(0, base) * remaining;
  return {
    points: p.points,
    projected: p.points + rest,
    remaining,
    sd: base === null ? 0 : Math.max(0, base) * WEEKLY_SPREAD[p.position] * Math.sqrt(remaining),
    hasProjection: base !== null,
  };
}

export interface TeamProjection {
  points: number;
  projected: number;
  sd: number;
  /** Starters with no ESPN projection (their future points can't be estimated). */
  missingProjections: number;
  playing: number;
  yetToPlay: number;
  done: number;
}

export function projectTeam(starters: PlayerLive[], extraPoints = 0): TeamProjection {
  let points = extraPoints;
  let projected = extraPoints;
  let variance = 0;
  let missing = 0;
  let playing = 0;
  let yetToPlay = 0;
  let done = 0;
  for (const p of starters) {
    const proj = projectPlayer(p);
    points += proj.points;
    projected += proj.projected;
    variance += proj.sd ** 2;
    if (!proj.hasProjection && proj.remaining > 0) missing += 1;
    if (p.game?.state === "in") playing += 1;
    else if (p.game?.state === "pre") yetToPlay += 1;
    else if (p.game?.state === "post") done += 1;
  }
  return {
    points: round2(points),
    projected: round2(projected),
    sd: Math.sqrt(variance),
    missingProjections: missing,
    playing,
    yetToPlay,
    done,
  };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, accurate to ~1e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** App estimate of the chance `me` finishes ahead of `them`. */
export function winProbability(me: Pick<TeamProjection, "projected" | "sd">, them: Pick<TeamProjection, "projected" | "sd">): number {
  const margin = me.projected - them.projected;
  const sd = Math.sqrt(me.sd ** 2 + them.sd ** 2);
  if (sd < 1e-6) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return Math.max(0, Math.min(1, normalCdf(margin / sd)));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
