"use client";

import { useEffect, useState } from "react";
import type { Universe } from "@/lib/analysis/universe";
import type { ScoringFormat } from "@/lib/scoring";

export interface UniverseState {
  /** Every analyzable player, scored in `format`; undefined while loading or after an error. */
  universe: Universe | undefined;
  loading: boolean;
  error: string | null;
}

// One download per format per visit, shared by every screen that asks.
const cache = new Map<ScoringFormat, Universe>();
const pending = new Map<ScoringFormat, Promise<Universe>>();

function load(format: ScoringFormat): Promise<Universe> {
  let request = pending.get(format);
  if (!request) {
    request = fetch(`/api/universe?format=${format}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${r.status})`);
        return body as Universe;
      })
      .then((universe) => {
        cache.set(format, universe);
        return universe;
      })
      .catch((error: unknown) => {
        pending.delete(format); // let the next screen try again
        throw error;
      });
    pending.set(format, request);
  }
  return request;
}

/**
 * The player universe for the analysis engine (lib/analysis), loaded once and shared.
 * Pass the roster's scoring format (lib/roster/store.ts); league size and players marked
 * as taken come from lib/settings/store.ts and go straight into the analysis functions.
 */
export function useUniverse(format: ScoringFormat): UniverseState {
  const [state, setState] = useState<{ format: ScoringFormat; universe?: Universe; error: string | null }>(() => ({
    format,
    universe: cache.get(format),
    error: null,
  }));
  useEffect(() => {
    if (cache.has(format)) return;
    let alive = true;
    load(format).then(
      (universe) => alive && setState({ format, universe, error: null }),
      (error: unknown) =>
        alive && setState({ format, error: error instanceof Error ? error.message : "Couldn't load player data" }),
    );
    return () => {
      alive = false;
    };
  }, [format]);

  const universe = cache.get(format) ?? (state.format === format ? state.universe : undefined);
  const error = state.format === format ? state.error : null;
  return { universe, loading: !universe && !error, error };
}
