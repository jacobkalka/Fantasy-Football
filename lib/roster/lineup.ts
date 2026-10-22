/**
 * Lineup rules: which slots a team has and which positions may fill them.
 * Pure functions, shared by the roster store and the Team screen.
 */
import type { Position } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";

export type Slot = "QB" | "RB" | "WR" | "TE" | "FLEX" | "K" | "DST" | "BENCH";

/** ESPN's default starting lineup: QB, 2 RB, 2 WR, TE, FLEX, K, D/ST. */
export const STARTING_SLOTS: Exclude<Slot, "BENCH">[] = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "K",
  "DST",
];

export const MAX_ROSTER = 16;

export interface RosterPlayer {
  playerId: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  slot: Slot;
}

export interface Roster {
  version: 1;
  name: string;
  format: ScoringFormat;
  players: RosterPlayer[];
  updatedAt: string;
}

export function emptyRoster(): Roster {
  return { version: 1, name: "My Team", format: "ppr", players: [], updatedAt: new Date(0).toISOString() };
}

export function canFill(slot: Slot, position: Position): boolean {
  if (slot === "BENCH") return true;
  if (slot === "FLEX") return position === "RB" || position === "WR" || position === "TE";
  return slot === position;
}

/** How many of a slot the lineup has (RB → 2). */
function capacity(slot: Slot) {
  return slot === "BENCH" ? Infinity : STARTING_SLOTS.filter((s) => s === slot).length;
}

function used(players: RosterPlayer[], slot: Slot) {
  return players.filter((p) => p.slot === slot).length;
}

/** Where a newly added player goes: their position's open slot, then FLEX, then the bench. */
export function autoSlot(players: RosterPlayer[], position: Position): Slot {
  const own = position as Slot;
  if (used(players, own) < capacity(own)) return own;
  if (canFill("FLEX", position) && used(players, "FLEX") < capacity("FLEX")) return "FLEX";
  return "BENCH";
}

/**
 * Move a player into a slot. If the slot is full, the player already there swaps
 * into the moving player's old slot when allowed, otherwise goes to the bench.
 */
export function moveToSlot(players: RosterPlayer[], playerId: string, slot: Slot): RosterPlayer[] {
  const mover = players.find((p) => p.playerId === playerId);
  if (!mover || !canFill(slot, mover.position)) return players;
  const occupants = players.filter((p) => p.slot === slot && p.playerId !== playerId);
  const displaced = occupants.length >= capacity(slot) ? occupants[0] : undefined;
  return players.map((p) => {
    if (p.playerId === playerId) return { ...p, slot };
    if (displaced && p.playerId === displaced.playerId) {
      return { ...p, slot: canFill(mover.slot, p.position) ? mover.slot : "BENCH" };
    }
    return p;
  });
}

/** Starters in lineup order, then the bench. */
export function sortLineup(players: RosterPlayer[]): RosterPlayer[] {
  const order: Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];
  return [...players].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
}

export function isStarter(player: RosterPlayer) {
  return player.slot !== "BENCH";
}
