/**
 * Season rankings from the analysis universe (DECISIONS.md, "Rankings"). Pure and tested
 * (rankings.test.ts). Every number comes from real weekly results and ESPN projections
 * scored with the team's own rules; nothing is estimated except what's labeled:
 *
 * - Overall / position rank: by total points in finished weeks (ties share the better rank).
 * - Points per game: total ÷ games he actually played.
 * - Recent: average of his last 3 games played.
 * - Projected rank: position rank by ESPN's projection for this week.
 * - Consistency: how much his weeks swing (standard deviation ÷ average). Needs 3+ games.
 * - Floor / ceiling: his 20th- and 80th-percentile weeks (a bad week and a good week for him).
 * - Weekly position rank: where his score ranked among everyone at his position that week.
 */
import type { AnalysisPlayer, Universe } from "@/lib/analysis/universe";
import type { InjuryStatus, Position } from "@/lib/providers/types";

export interface RankedWeek {
  week: number;
  points: number;
  /** Rank among players at his position who played that week. */
  positionRank: number;
}

export interface RankedPlayer {
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  injuryStatus: InjuryStatus;
  byeWeek: number | null;
  percentOwned: number | null;
  percentOwnedChange: number | null;
  games: number;
  total: number;
  ppg: number | null;
  recent: number | null;
  overallRank: number;
  positionRank: number;
  ppgPositionRank: number | null;
  projection: number | null;
  projectedPositionRank: number | null;
  restOfSeason: number | null;
  /** Standard deviation ÷ average; lower = steadier. Null under 3 games. */
  volatility: number | null;
  floor: number | null;
  ceiling: number | null;
  best: number | null;
  weekly: RankedWeek[];
  /** Recent minus season average, when both exist. */
  trend: number | null;
}

export type ConsistencyLabel = "Steady" | "Average swings" | "Boom or bust";

export function consistencyLabel(volatility: number | null): ConsistencyLabel | null {
  if (volatility === null) return null;
  return volatility < 0.4 ? "Steady" : volatility < 0.7 ? "Average swings" : "Boom or bust";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return round2(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/** Ranks with ties sharing the better rank (1, 2, 2, 4). Higher value = better. */
function rankBy<T>(items: T[], value: (item: T) => number | null): Map<T, number> {
  const scored = items.filter((i) => value(i) !== null).sort((a, b) => value(b)! - value(a)!);
  const ranks = new Map<T, number>();
  let rank = 0;
  let previous: number | null = null;
  scored.forEach((item, i) => {
    const v = value(item)!;
    if (previous === null || v !== previous) rank = i + 1;
    previous = v;
    ranks.set(item, rank);
  });
  return ranks;
}

export function rankUniverse(universe: Universe): RankedPlayer[] {
  const players = universe.players;
  const total = (p: AnalysisPlayer) => p.seasonPoints;
  const overall = rankBy(players, total);

  // Weekly positional ranks: everyone at a position who played that week.
  const weekRank = new Map<string, number>();
  const byPosWeek = new Map<string, { id: string; points: number }[]>();
  for (const p of players) {
    for (const g of p.games) {
      const key = `${p.position}:${g.week}`;
      const list = byPosWeek.get(key) ?? [];
      list.push({ id: p.id, points: g.points });
      byPosWeek.set(key, list);
    }
  }
  for (const [key, list] of byPosWeek) {
    const ranks = rankBy(list, (e) => e.points);
    for (const e of list) weekRank.set(`${key}:${e.id}`, ranks.get(e)!);
  }

  const rows = players.map((p) => {
    const points = p.games.map((g) => g.points);
    const sorted = [...points].sort((a, b) => a - b);
    const games = points.length;
    const ppg = games ? round2(p.seasonPoints / games) : null;
    const last3 = points.slice(-3);
    const recent = last3.length ? round2(last3.reduce((a, b) => a + b, 0) / last3.length) : null;
    let volatility: number | null = null;
    if (games >= 3 && ppg && ppg > 0) {
      const sd = Math.sqrt(points.reduce((sum, v) => sum + (v - ppg) ** 2, 0) / (games - 1));
      volatility = round2(sd / ppg);
    }
    return {
      raw: p,
      row: {
        id: p.id,
        name: p.name,
        position: p.position,
        teamId: p.teamId,
        headshot: p.headshot,
        injuryStatus: p.injuryStatus,
        byeWeek: p.byeWeek,
        percentOwned: p.percentOwned,
        percentOwnedChange: p.percentOwnedChange,
        games,
        total: p.seasonPoints,
        ppg,
        recent,
        overallRank: overall.get(p) ?? players.length,
        positionRank: 0,
        ppgPositionRank: null,
        projection: p.weekProjection,
        projectedPositionRank: null,
        restOfSeason: p.ros?.points ?? null,
        volatility,
        floor: games >= 3 ? quantile(sorted, 0.2) : null,
        ceiling: games >= 3 ? quantile(sorted, 0.8) : null,
        best: games ? sorted[sorted.length - 1] : null,
        weekly: p.games.map((g) => ({
          week: g.week,
          points: g.points,
          positionRank: weekRank.get(`${p.position}:${g.week}:${p.id}`) ?? 0,
        })),
        trend: recent !== null && ppg !== null && games >= 4 ? round2(recent - ppg) : null,
      } satisfies RankedPlayer as RankedPlayer,
    };
  });

  // Position ranks (season total, per game with 3+ games, this week's projection).
  const positions = [...new Set(rows.map((r) => r.row.position))];
  for (const pos of positions) {
    const group = rows.filter((r) => r.row.position === pos);
    const byTotal = rankBy(group, (r) => r.row.total);
    const byPpg = rankBy(group, (r) => (r.row.games >= 3 ? r.row.ppg : null));
    const byProj = rankBy(group, (r) => r.row.projection);
    for (const r of group) {
      r.row.positionRank = byTotal.get(r) ?? group.length;
      r.row.ppgPositionRank = byPpg.get(r) ?? null;
      r.row.projectedPositionRank = byProj.get(r) ?? null;
    }
  }
  return rows.map((r) => r.row).sort((a, b) => a.overallRank - b.overallRank);
}

export type RankSort = "rank" | "total" | "ppg" | "recent" | "projection" | "ros" | "consistency";

export function sortRanked(rows: RankedPlayer[], sort: RankSort): RankedPlayer[] {
  const key: Record<RankSort, (r: RankedPlayer) => number | null> = {
    rank: (r) => -r.overallRank,
    total: (r) => r.total,
    ppg: (r) => (r.games >= 1 ? r.ppg : null),
    recent: (r) => r.recent,
    projection: (r) => r.projection,
    ros: (r) => r.restOfSeason,
    // Steadier first, among players who score real points.
    consistency: (r) => (r.volatility === null || (r.ppg ?? 0) < 5 ? null : -r.volatility),
  };
  const f = key[sort];
  return [...rows].sort((a, b) => {
    const va = f(a);
    const vb = f(b);
    if (va === null && vb === null) return a.overallRank - b.overallRank;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va || a.overallRank - b.overallRank;
  });
}
