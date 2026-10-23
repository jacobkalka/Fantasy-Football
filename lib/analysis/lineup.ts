/**
 * Best possible starting lineup for any roster.
 *
 * Each position's own slots are filled first with its best players, then FLEX takes the best
 * running back, receiver or tight end left. With one FLEX type that can hold any of the
 * positions that also have their own slots, this simple order is always optimal.
 *
 * Two ways to value players:
 * - "week": ESPN's projection for this week. Players on a bye, out, on injured reserve or
 *   suspended can't start.
 * - "ros" (rest of season): expected points per remaining game (ESPN's rest-of-season projection
 *   spread over his team's games, so expected missed games already count against him).
 */
import { xppg } from "./metrics";
import { eligible, slotList, SLOT_ORDER, type LeagueSettings, type StartingSlot } from "./settings";
import { isOut, type AnalysisPlayer } from "./universe";

export type LineupMode = "week" | "ros";

export interface LineupSpot {
  slot: StartingSlot;
  /** Null when nobody on the roster can fill it (or, with a floor, a free-agent pickup would). */
  player: AnalysisPlayer | null;
  points: number;
}

export interface BenchSpot {
  player: AnalysisPlayer;
  points: number;
  /** Why he can't start this week ("Bye week", "Out"), when that's the reason. */
  reason: string | null;
}

export interface Lineup {
  mode: LineupMode;
  starters: LineupSpot[];
  bench: BenchSpot[];
  /** Points from the starters. */
  total: number;
}

/** Why a player can't start this week, or null if he can. */
export function weekBlocker(p: AnalysisPlayer, week: number): string | null {
  if (p.byeWeek === week) return "Bye week";
  if (p.injuryStatus === "INJURY_RESERVE") return "Injured reserve";
  if (p.injuryStatus === "SUSPENSION") return "Suspended";
  if (isOut(p)) return "Out";
  return null;
}

/** A player's value for a lineup, or null when he can't start. */
export function lineupValue(p: AnalysisPlayer, mode: LineupMode, week: number): number | null {
  if (mode === "ros") return xppg(p);
  if (weekBlocker(p, week)) return null;
  return p.weekProjection ?? 0;
}

const byValue = (value: (p: AnalysisPlayer) => number | null) => (a: AnalysisPlayer, b: AnalysisPlayer) =>
  (value(b) ?? -Infinity) - (value(a) ?? -Infinity) || a.id.localeCompare(b.id);

/**
 * Fills `slots` from `players`. With `floor`, a slot whose best candidate is worse than the
 * floor is left to a free-agent pickup worth the floor (used for "what if a starter is out").
 */
export function fillSlots(
  players: readonly AnalysisPlayer[],
  slots: readonly StartingSlot[],
  value: (p: AnalysisPlayer) => number | null,
  floor?: (slot: StartingSlot) => number,
): LineupSpot[] {
  const pool = players.filter((p) => value(p) !== null).sort(byValue(value));
  const used = new Set<string>();
  // Own-position slots first, FLEX last.
  const order = slots.map((slot, index) => ({ slot, index })).sort((a, b) => Number(a.slot === "FLEX") - Number(b.slot === "FLEX"));
  const spots: LineupSpot[] = new Array(slots.length);
  for (const { slot, index } of order) {
    const pick = pool.find((p) => !used.has(p.id) && eligible(slot, p.position));
    const points = pick ? (value(pick) ?? 0) : 0;
    const min = floor?.(slot);
    if (min !== undefined && (!pick || points < min)) {
      spots[index] = { slot, player: null, points: min };
      continue;
    }
    if (pick) used.add(pick.id);
    spots[index] = { slot, player: pick ?? null, points };
  }
  return spots;
}

export function optimalLineup(
  players: readonly AnalysisPlayer[],
  settings: LeagueSettings,
  mode: LineupMode,
  week: number,
): Lineup {
  const value = (p: AnalysisPlayer) => lineupValue(p, mode, week);
  const starters = fillSlots(players, slotList(settings), value).sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );
  const starting = new Set(starters.map((s) => s.player?.id).filter(Boolean));
  const bench = players
    .filter((p) => !starting.has(p.id))
    .sort(byValue(value))
    .map((player) => ({
      player,
      points: value(player) ?? 0,
      reason: mode === "week" ? weekBlocker(player, week) : null,
    }));
  const total = starters.reduce((sum, s) => sum + s.points, 0);
  return { mode, starters, bench, total };
}
