/** Which roster players the Start/Sit screen compares. Pure, so it's tested in pick.test.ts. */
import { isStarter, sortLineup, type RosterPlayer } from "@/lib/roster/lineup";
import { isOffense } from "./factors";

/** Up to 3 players side by side still fit on a phone. */
export const MAX_PICK = 3;

/** QBs, RBs, WRs and TEs in lineup order (kickers and D/ST aren't supported yet). */
export function comparable(players: RosterPlayer[]): RosterPlayer[] {
  return sortLineup(players).filter((p) => isOffense(p.position));
}

/**
 * A sensible first comparison: the best-placed bench player against the starter at
 * the same position (the classic "should I start him instead?"). Otherwise the first
 * two players at one position, otherwise the first two players at all.
 */
export function defaultPick(players: RosterPlayer[]): string[] {
  const list = comparable(players);
  for (const bench of list.filter((p) => !isStarter(p))) {
    const starter = list.find((p) => isStarter(p) && p.position === bench.position);
    if (starter) return [starter.playerId, bench.playerId];
  }
  for (const p of list) {
    const other = list.find((q) => q.playerId !== p.playerId && q.position === p.position);
    if (other) return [p.playerId, other.playerId];
  }
  return list.slice(0, 2).map((p) => p.playerId);
}

/** Ids from the URL that are still on the roster, in order, at most MAX_PICK. */
export function pickFromUrl(value: string | null, players: RosterPlayer[]): string[] {
  const allowed = new Set(comparable(players).map((p) => p.playerId));
  const ids = [...new Set((value ?? "").split(",").map((s) => s.trim()))].filter((id) => allowed.has(id));
  return ids.slice(0, MAX_PICK);
}

/** Tapping a player: remove them if picked, otherwise add them (when there's room). */
export function togglePick(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  return current.length >= MAX_PICK ? current : [...current, id];
}

/**
 * Ids from the URL for any players, on the roster or not (Start/Sit can compare an
 * outside player against yours), unique, at most MAX_PICK.
 */
export function idsFromUrl(value: string | null): string[] {
  return [...new Set((value ?? "").split(",").map((s) => s.trim()))].filter((id) => /^-?\d{1,12}$/.test(id)).slice(0, MAX_PICK);
}
