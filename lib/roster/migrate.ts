/**
 * Reading a single saved roster (the app's first storage format, and the account copy's shape).
 * Pure, so the teams store (lib/teams/store.ts) and tests can use it.
 */
import type { Position } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";
import { MAX_ROSTER, type Roster, type RosterPlayer, type Slot } from "./lineup";

const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const SLOTS: readonly Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];
const FORMATS: readonly ScoringFormat[] = ["standard", "half", "ppr"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** One saved player, or null if it's missing what the app needs. */
export function readPlayer(raw: unknown): RosterPlayer | null {
  if (!isRecord(raw)) return null;
  const { playerId, name, position, teamId, headshot, slot } = raw;
  if (typeof playerId !== "string" || !playerId) return null;
  if (typeof name !== "string" || !POSITIONS.includes(position as Position)) return null;
  return {
    playerId,
    name,
    position: position as Position,
    teamId: typeof teamId === "string" ? teamId : null,
    headshot: typeof headshot === "string" ? headshot : null,
    slot: SLOTS.includes(slot as Slot) ? (slot as Slot) : "BENCH",
  };
}

/** Any saved roster (all versions so far use version 1) → the current shape, or null. */
export function migrateRoster(raw: unknown): Roster | null {
  if (!isRecord(raw) || !Array.isArray(raw.players)) return null;
  const seen = new Set<string>();
  const players = raw.players
    .map(readPlayer)
    .filter((p): p is RosterPlayer => p !== null && !seen.has(p.playerId) && Boolean(seen.add(p.playerId)))
    .slice(0, MAX_ROSTER);
  return {
    version: 1,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 40) : "My Team",
    format: FORMATS.includes(raw.format as ScoringFormat) ? (raw.format as ScoringFormat) : "ppr",
    players,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

