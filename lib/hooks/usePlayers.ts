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

/** Lower-case, no accents or punctuation: "Ja'Marr Chase" → "jamarr chase". */
export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Simple ranked search: exact name, then name/last-name prefix, then contains, then team
 * abbreviation; ties broken by % rostered.
 */
export function searchPlayers(
  players: Player[],
  query: string,
  teamAbbr: (teamId: string | null) => string | null,
  limit = 40,
): Player[] {
  const q = normalizeName(query);
  if (!q) return players.slice(0, limit);
  const scored: { p: Player; s: number }[] = [];
  for (const p of players) {
    const name = normalizeName(p.name);
    const last = name.split(" ").slice(1).join(" ");
    const abbr = teamAbbr(p.teamId)?.toLowerCase();
    let s = 0;
    if (name === q) s = 100;
    else if (name.startsWith(q)) s = 80;
    else if (last.startsWith(q)) s = 70;
    else if (name.split(" ").some((w) => w.startsWith(q))) s = 60;
    else if (name.includes(q)) s = 40;
    else if (abbr && abbr === q) s = 30;
    if (s) scored.push({ p, s: s + (p.percentOwned ?? 0) / 1000 });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}
