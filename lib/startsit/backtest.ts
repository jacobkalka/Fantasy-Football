/**
 * A light back-test: for past weeks, would the model have picked the player who
 * actually scored more? Compared against simply starting the higher ESPN projection.
 * Pure; lib/startsit/backtest.live.test.ts runs it on real ESPN data.
 */
import type { ScoringFormat } from "@/lib/scoring";
import { decide } from "./model";
import type { Confidence, PlayerFactors } from "./types";

export interface BacktestCase {
  a: PlayerFactors;
  b: PlayerFactors;
  /** Real points scored that week. */
  actualA: number;
  actualB: number;
}

export interface BacktestRow {
  a: string;
  b: string;
  modelPick: string;
  projectionPick: string;
  actualWinner: string;
  confidence: Confidence;
}

export interface BacktestResult {
  pairs: number;
  /** Pairs where both scored the same (left out of the accuracy). */
  ties: number;
  modelCorrect: number;
  projectionCorrect: number;
  /** Pairs where the model and the projection disagreed, and how often the model was right. */
  disagreements: number;
  modelWonDisagreements: number;
  byConfidence: Record<Confidence, { pairs: number; correct: number }>;
  rows: BacktestRow[];
}

/**
 * Close calls worth back-testing: same position, both projected for at least
 * `minProjection`, and projections within `maxGap` (share) of each other.
 */
export function closePairs(players: PlayerFactors[], { maxGap = 0.25, minProjection = 5 } = {}) {
  const pairs: [PlayerFactors, PlayerFactors][] = [];
  const eligible = players.filter((p) => p.projection !== null && p.projection >= minProjection && !p.unavailable);
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      if (a.position !== b.position) continue;
      const high = Math.max(a.projection!, b.projection!);
      if (Math.abs(a.projection! - b.projection!) / high <= maxGap) pairs.push([a, b]);
    }
  }
  return pairs;
}

export function backtest(cases: BacktestCase[], format: ScoringFormat): BacktestResult {
  const result: BacktestResult = {
    pairs: 0,
    ties: 0,
    modelCorrect: 0,
    projectionCorrect: 0,
    disagreements: 0,
    modelWonDisagreements: 0,
    byConfidence: { Lean: { pairs: 0, correct: 0 }, Solid: { pairs: 0, correct: 0 }, Strong: { pairs: 0, correct: 0 } },
    rows: [],
  };
  for (const { a, b, actualA, actualB } of cases) {
    if (actualA === actualB) {
      result.ties++;
      continue;
    }
    const { recommendation } = decide([a, b], format);
    if (!recommendation) continue;
    const winner = actualA > actualB ? a.playerId : b.playerId;
    const projectionPick = (a.projection ?? 0) >= (b.projection ?? 0) ? a.playerId : b.playerId;
    const modelRight = recommendation.startId === winner;

    result.pairs++;
    if (modelRight) result.modelCorrect++;
    if (projectionPick === winner) result.projectionCorrect++;
    if (projectionPick !== recommendation.startId) {
      result.disagreements++;
      if (modelRight) result.modelWonDisagreements++;
    }
    const bucket = result.byConfidence[recommendation.confidence];
    bucket.pairs++;
    if (modelRight) bucket.correct++;
    const name = (id: string) => (id === a.playerId ? a.name : b.name);
    result.rows.push({
      a: a.name,
      b: b.name,
      modelPick: name(recommendation.startId),
      projectionPick: name(projectionPick),
      actualWinner: name(winner),
      confidence: recommendation.confidence,
    });
  }
  return result;
}
