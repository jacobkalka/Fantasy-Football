/**
 * Roster sync rules: the pure decisions behind saving your team to your account.
 *
 * The team always lives on this device first (lib/roster/store.ts). When you're
 * signed in, a copy is kept in the database (tables `rosters` + `roster_players`).
 * These functions decide which copy wins when the two disagree. They don't talk
 * to the network, so they're easy to test (sync.test.ts). The code that does the
 * talking is lib/supabase/roster-sync.ts.
 */
import type { Position } from "@/lib/providers/types";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";
import { emptyRoster, MAX_ROSTER, type Roster, type RosterPlayer, type Slot } from "./lineup";

const SLOTS: Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const DEFAULT_NAME = "My Team";

/** The account's copy of the roster, as read from the database. */
export interface AccountRoster {
  id: string;
  name: string;
  format: ScoringFormat;
  /** When the database copy last changed (ISO time). */
  updatedAt: string;
  players: { playerId: string; slot: Slot; position: Position | null }[];
}

/**
 * What this device remembers about its last successful sync: which account,
 * and what the roster looked like then. Saved in localStorage.
 */
export interface SyncMemory {
  userId: string;
  signature: string;
  rosterId?: string;
  syncedAt?: string;
}

export type SyncDecision =
  | { action: "none"; reason: "both-empty" | "in-sync" }
  | { action: "pull"; reason: "device-empty" | "account-changed" | "account-newer" | "other-account" }
  | { action: "push"; reason: "account-empty" | "device-changed" | "device-newer" };

function cleanName(name: string | null | undefined) {
  return name?.trim().slice(0, 40) || DEFAULT_NAME;
}

/**
 * A fingerprint of everything that's saved to the account: the team name,
 * scoring format, and who's in which slot. Two rosters with the same
 * fingerprint don't need syncing. (Photos and names aren't saved; they're
 * looked up again from ESPN.)
 */
export function rosterSignature(roster: {
  name: string;
  format: ScoringFormat;
  players: { playerId: string; slot: Slot }[];
}): string {
  const players = roster.players
    .map((p) => `${p.playerId}:${p.slot}`)
    .sort()
    .join(",");
  return `${cleanName(roster.name)}|${roster.format}|${players}`;
}

/** Reads a database time like "2026-10-22T17:03:01.123456+00:00" (microseconds trimmed). */
export function parseTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Which copy wins, and why. In order:
 *  1. No account copy yet: save this device's team (if it has one).
 *  2. Identical: nothing to do.
 *  3. Device team is empty: load the account's team.
 *  4. The device's team was last synced with a different account: load this account's team.
 *  5. Only one side changed since the last sync: that side wins.
 *  6. Both changed (or this device never synced): the most recently edited wins; a tie goes to the account.
 */
export function decideSync({
  local,
  account,
  memory,
  userId,
}: {
  local: Roster;
  account: AccountRoster | null;
  memory: SyncMemory | null;
  userId: string;
}): SyncDecision {
  const localEmpty = local.players.length === 0;
  if (!account) return localEmpty ? { action: "none", reason: "both-empty" } : { action: "push", reason: "account-empty" };

  const localSig = rosterSignature(local);
  const accountSig = rosterSignature(account);
  if (localSig === accountSig) return { action: "none", reason: "in-sync" };
  if (localEmpty) return { action: "pull", reason: "device-empty" };

  if (memory && memory.userId !== userId) return { action: "pull", reason: "other-account" };
  if (memory) {
    const deviceChanged = localSig !== memory.signature;
    const accountChanged = accountSig !== memory.signature;
    if (!deviceChanged && accountChanged) return { action: "pull", reason: "account-changed" };
    if (deviceChanged && !accountChanged) return { action: "push", reason: "device-changed" };
  }
  return parseTime(local.updatedAt) > parseTime(account.updatedAt)
    ? { action: "push", reason: "device-newer" }
    : { action: "pull", reason: "account-newer" };
}

/** The short message shown after a sync decision, or null when it's routine. */
export function syncNotice(decision: SyncDecision): string | null {
  switch (decision.reason) {
    case "account-empty":
      return "Your team is now saved to your account.";
    case "device-empty":
      return "Loaded your saved team from your account.";
    case "other-account":
      return "Loaded this account's team. The team on this device belonged to a different account.";
    case "account-newer":
      return "Your account had a newer version of your team, so that one was loaded.";
    case "device-newer":
      return "The team on this device was edited more recently, so it was saved to your account.";
    default:
      return null;
  }
}

/** The NFL season a date belongs to: January and February games are last year's season. */
export function nflSeason(date: Date): number {
  return date.getMonth() < 2 ? date.getFullYear() - 1 : date.getFullYear();
}

/** The rows written to the database for a roster. */
export function toAccountRows(roster: Roster) {
  return {
    name: cleanName(roster.name),
    scoringFormat: roster.format,
    players: roster.players.slice(0, MAX_ROSTER).map((p) => ({
      player_id: p.playerId,
      slot: p.slot,
      position: p.position,
    })),
  };
}

/** Database values are checked before use; anything unexpected falls back to a safe default. */
export function toAccountRoster(row: {
  id: string;
  name: string | null;
  scoring_format: string | null;
  updated_at: string;
  roster_players?: { player_id: string; slot: string | null; position: string | null }[] | null;
}): AccountRoster {
  const format = SCORING_FORMATS.includes(row.scoring_format as ScoringFormat)
    ? (row.scoring_format as ScoringFormat)
    : "ppr";
  return {
    id: row.id,
    name: cleanName(row.name),
    format,
    updatedAt: row.updated_at,
    players: (row.roster_players ?? []).map((p) => ({
      playerId: p.player_id,
      slot: SLOTS.includes(p.slot as Slot) ? (p.slot as Slot) : "BENCH",
      position: POSITIONS.includes(p.position as Position) ? (p.position as Position) : null,
    })),
  };
}

export interface PlayerInfo {
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
}

/**
 * Turns the account's copy into a device roster. Names and photos come from
 * the player list (`lookup`); if ESPN is unreachable we still keep every player.
 */
export function fromAccountRoster(
  account: AccountRoster,
  lookup: (playerId: string) => PlayerInfo | undefined,
): Roster {
  const players: RosterPlayer[] = account.players.slice(0, MAX_ROSTER).map((p) => {
    const info = lookup(p.playerId);
    const slotPosition = POSITIONS.includes(p.slot as Position) ? (p.slot as Position) : undefined;
    return {
      playerId: p.playerId,
      name: info?.name ?? `Player ${p.playerId}`,
      position: info?.position ?? p.position ?? slotPosition ?? "WR",
      teamId: info?.teamId ?? null,
      headshot: info?.headshot ?? null,
      slot: p.slot,
    };
  });
  return { ...emptyRoster(), name: account.name, format: account.format, players, updatedAt: account.updatedAt };
}

/** Wait before retrying a failed save: 2s, 4s, 8s … up to a minute. */
export function retryDelay(failures: number): number {
  return Math.min(2_000 * 2 ** Math.max(0, failures - 1), 60_000);
}
