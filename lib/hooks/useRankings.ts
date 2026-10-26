"use client";

import { rankUniverse, type RankedPlayer } from "@/lib/players/rankings";
import type { Universe } from "@/lib/analysis/universe";
import { useUniverse } from "./useUniverse";

// One ranking pass per universe download, however many screens ask.
const cache = new WeakMap<Universe, { rows: RankedPlayer[]; byId: Map<string, RankedPlayer> }>();

/** Season rankings for the active team's scoring (lib/players/rankings.ts). */
export function useRankings() {
  const state = useUniverse();
  let ranked = state.universe ? cache.get(state.universe) : undefined;
  if (state.universe && !ranked) {
    const rows = rankUniverse(state.universe);
    ranked = { rows, byId: new Map(rows.map((r) => [r.id, r])) };
    cache.set(state.universe, ranked);
  }
  return { ...state, rows: ranked?.rows, byId: ranked?.byId };
}
