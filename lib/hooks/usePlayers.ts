"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/providers/types";

/**
 * Every fantasy-relevant player (about 1,000), downloaded once per visit and shared by
 * every search box. Player lists change slowly, so one copy per visit is plenty.
 */
type State = { players: Player[] | null; error: boolean };

let cache: Player[] | null = null;
let inflight: Promise<Player[]> | null = null;
const listeners = new Set<(s: State) => void>();

function load(): Promise<Player[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/players")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { players: Player[] };
        cache = body.players;
        listeners.forEach((l) => l({ players: cache, error: false }));
        return cache;
      })
      .catch((error) => {
        inflight = null;
        listeners.forEach((l) => l({ players: null, error: true }));
        throw error;
      });
  }
  return inflight;
}

export function usePlayers(enabled = true): State & { retry: () => void } {
  const [state, setState] = useState<State>({ players: cache, error: false });
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setState);
    if (!cache) load().catch(() => {});
    return () => {
      listeners.delete(setState);
    };
  }, [enabled]);
  return {
    ...state,
    retry: () => {
      setState({ players: null, error: false });
      load().catch(() => {});
    },
  };
}

/**
 * Player search for every search box: the forgiving search in lib/players/search.ts (accents,
 * punctuation, initials, small typos, "kc wr"). Re-exported here so every caller shares it.
 */
export { normalize as normalizeName, searchPlayers } from "@/lib/players/search";
