"use client";

/**
 * Your roster, saved in this browser (no account needed). Every screen reads it
 * through `useRoster()` and they all update together. When accounts are set up,
 * the same roster is also synced to the database.
 */
import { useSyncExternalStore } from "react";
import type { Player } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";
import {
  autoSlot,
  emptyRoster,
  MAX_ROSTER,
  moveToSlot,
  type Roster,
  type Slot,
} from "./lineup";

const KEY = "the-feed:roster:v1";
const EMPTY = emptyRoster();

let current: Roster | null = null;
const listeners = new Set<() => void>();

function read(): Roster {
  if (current) return current;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Roster) : null;
    current = parsed && parsed.version === 1 && Array.isArray(parsed.players) ? parsed : EMPTY;
  } catch {
    current = EMPTY;
  }
  return current;
}

function write(next: Roster) {
  current = { ...next, updatedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private browsing or storage full: the roster still works until the tab closes.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      current = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The roster, plus whether it has been read from this device yet. */
export function useRoster(): { roster: Roster; ready: boolean } {
  const roster = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { roster, ready };
}

export const rosterActions = {
  add(player: Player): { ok: boolean; reason?: string } {
    const roster = read();
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
    const roster = read();
    write({ ...roster, players: roster.players.filter((p) => p.playerId !== playerId) });
  },
  move(playerId: string, slot: Slot) {
    const roster = read();
    write({ ...roster, players: moveToSlot(roster.players, playerId, slot) });
  },
  setFormat(format: ScoringFormat) {
    write({ ...read(), format });
  },
  rename(name: string) {
    write({ ...read(), name: name.trim().slice(0, 40) || "My Team" });
  },
  /** Replace everything (used when importing or syncing). */
  replace(roster: Roster) {
    write(roster);
  },
  clear() {
    write(emptyRoster());
  },
};
