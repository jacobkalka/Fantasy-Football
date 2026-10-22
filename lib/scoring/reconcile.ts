/**
 * Checks our play-by-play math against the official box score.
 * The official number is always what we show. If `ok` is false, the caller
 * should log the drift so we can track down what we missed.
 */
import { roundPoints } from "./score";

export type ReconcileResult = {
  ok: boolean; // true when we're within `tolerance` of the official number
  drift: number; // computed − official (positive = we counted too many points)
  headline: number; // the number to show: always the official one
};

export function reconcile(computed: number, official: number, tolerance = 0.05): ReconcileResult {
  // Rounding first means 10.05 − 10 counts as exactly 0.05, not 0.05000000000000071.
  const drift = roundPoints(computed - official);
  return {
    ok: Math.abs(drift) <= tolerance,
    drift,
    headline: roundPoints(official), // official feeds sometimes send 21.240000000000002
  };
}
