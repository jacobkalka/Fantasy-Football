"use client";

/**
 * Your roster, saved on this device (no account needed). Every screen reads it through
 * `useRoster()` and they all update together. When accounts are set up, the same roster
 * is also synced to the database (lib/supabase/roster-sync.ts).
 *
 * Saved carefully (lib/storage/persisted.ts): rosters saved by older versions of the app
 * (key "the-feed:roster:v1") carry over; a damaged player entry is dropped on its own
 * instead of losing the whole team; anything unreadable is backed up, never deleted.
 */
import type { Player, Position } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";
import { createPersistedStore } from "@/lib/storage/persisted";
import {
  autoSlot,
  emptyRoster,
  MAX_ROSTER,
  moveToSlot,
  type Roster,
  type RosterPlayer,
  type Slot,
} from "./lineup";

const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const SLOTS: readonly Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];
const FORMATS: readonly ScoringFormat[] = ["standard", "half", "ppr"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** One saved player, or null if it's missing what the app needs. */
function readPlayer(raw: unknown): RosterPlayer | null {
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

const store = createPersistedStore<Roster>({
  key: "roster",
  legacyKeys: ["the-feed:roster:v1"],
  defaults: emptyRoster,
  migrate: migrateRoster,
});

function write(next: Roster) {
  store.set({ ...next, updatedAt: new Date().toISOString() });
}

/** The roster, plus whether it has been read from this device yet (render a placeholder until then). */
export function useRoster(): { roster: Roster; ready: boolean } {
  const { value, ready } = store.use();
  return { roster: value, ready };
}

/** The roster right now, outside React (event handlers, sync). */
export function getRoster(): Roster {
  return store.get();
}

export const rosterActions = {
  add(player: Pick<Player, "id" | "name" | "position" | "teamId" | "headshot">): { ok: boolean; reason?: string } {
    const roster = store.get();
    if (roster.players.some((p) => p.playerId === player.id)) return { ok: false, reason: "Already on your team" };
    if (roster.players.length >= MAX_ROSTER) return { ok: false, reason: `Rosters max out at ${MAX_ROSTER} players` };
    write({
      ...roster,
      players: [
        ...roster.players,
        {
          playerId: player.id,
          name: player.name,
          position: player.position,
          teamId: player.teamId,
          headshot: player.headshot,
          slot: autoSlot(roster.players, player.position),
        },
      ],
    });
    return { ok: true };
  },
  remove(playerId: string) {
    const roster = store.get();
    write({ ...roster, players: roster.players.filter((p) => p.playerId !== playerId) });
  },
  move(playerId: string, slot: Slot) {
    const roster = store.get();
    write({ ...roster, players: moveToSlot(roster.players, playerId, slot) });
  },
  setFormat(format: ScoringFormat) {
    write({ ...store.get(), format });
  },
  /** Saved as you type; an empty name falls back to "My Team" only when read back. */
  rename(name: string) {
    write({ ...store.get(), name: name.slice(0, 40) });
  },
  /** Replace everything (used when importing, syncing, or applying a trade you chose to save). */
  replace(roster: Roster) {
    write(roster);
  },
  clear() {
    write(emptyRoster());
  },
};
