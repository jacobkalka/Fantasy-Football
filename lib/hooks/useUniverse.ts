"use client";

import type { Universe } from "@/lib/analysis/universe";
import { specOf } from "@/lib/fantasy/context";
import { specQuery, type ScoringSpec } from "@/lib/scoring/spec";
import { useLive } from "@/lib/sync/useLive";
import { useActiveTeam } from "@/lib/teams/store";

export interface UniverseState {
  /** Every analyzable player, scored with the team's rules; undefined while loading or after an error. */
  universe: Universe | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * The player universe for the analysis engine (lib/analysis), through the shared live-data
 * client: one download per scoring spec, shared by every screen (rankings, pickups, trades,
 * team rating, player profiles), refreshed every 10 minutes while something shows it.
 * Without an argument it uses the ACTIVE team's scoring, so every screen agrees.
 */
export function useUniverse(spec?: ScoringSpec): UniverseState {
  const { team, ready } = useActiveTeam();
  const use = spec ?? specOf(team);
  const url = ready || spec ? `/api/universe?${specQuery(use)}` : null;
  const state = useLive<Universe>(url, { interval: 10 * 60_000 });
  return {
    universe: state.data,
    loading: !state.data && !state.error,
    error: state.data ? null : state.error,
    refresh: state.refresh,
  };
}
