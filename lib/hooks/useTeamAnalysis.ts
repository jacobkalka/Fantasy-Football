"use client";

import { useMemo } from "react";
import {
  leagueSettings,
  rateTeam,
  suggestPickups,
  suggestTrades,
  type LeagueSettings,
  type PickupSuggestions,
  type TeamRating,
  type TradeSuggestions,
  type Weakness,
} from "@/lib/analysis";
import { leagueModel } from "@/lib/analysis/model";
import { resolveRoster } from "@/lib/analysis/roster";
import { weaknessesFor } from "@/lib/analysis/weaknesses";
import { useLeague } from "@/lib/fantasy/context";
import type { LeagueSlot } from "@/lib/providers/types";
import { useUniverse } from "./useUniverse";

/** A connected league's starting lineup in the analysis engine's terms (IR/bench excluded). */
function slotsFrom(lineup: Partial<Record<LeagueSlot, number>> | undefined): LeagueSettings["slots"] | undefined {
  if (!lineup) return undefined;
  const { QB, RB, WR, TE, FLEX, K, DST } = lineup;
  return { QB: QB ?? 0, RB: RB ?? 0, WR: WR ?? 0, TE: TE ?? 0, FLEX: FLEX ?? 0, K: K ?? 0, DST: DST ?? 0 };
}

/**
 * The analysis engine (lib/analysis) run for the ACTIVE team: rating, weaknesses, and (only
 * when asked, they're heavier) pickups and trade ideas. League size, scoring and lineup come
 * from the team (and its ESPN league when connected); "taken" comes from the league's real
 * rosters when connected, or from players you marked as taken.
 */
export function useTeamAnalysis({ pickups = false, trades = false }: { pickups?: boolean; trades?: boolean } = {}) {
  const { universe, loading, error, refresh } = useUniverse();
  const league = useLeague();
  const { team } = league;
  const lineup = league.data?.lineup;

  const settings = useMemo(
    () => leagueSettings({ teams: team.leagueSize, format: team.format, slots: slotsFrom(lineup) }),
    [team.leagueSize, team.format, lineup],
  );

  const base = useMemo(() => {
    if (!universe || team.players.length === 0) return null;
    const rating: TeamRating = rateTeam(team.players, universe, settings);
    const model = leagueModel(universe, settings);
    const { players } = resolveRoster(team.players, model);
    const weaknesses: Weakness[] = weaknessesFor(players, model, rating);
    return { rating, weaknesses, model };
  }, [universe, team.players, settings]);

  const knownRosters = Boolean(team.espn && team.taken.length > 0);
  const pickupList = useMemo<PickupSuggestions | null>(
    () => (pickups && universe && team.players.length ? suggestPickups(team.players, universe, settings, { taken: team.taken, knownRosters, limit: 12 }) : null),
    [pickups, universe, team.players, settings, team.taken, knownRosters],
  );
  const tradeList = useMemo<TradeSuggestions | null>(
    () => (trades && universe && team.players.length ? suggestTrades(team.players, universe, settings, { taken: team.taken, limit: 8 }) : null),
    [trades, universe, team.players, settings, team.taken],
  );

  return {
    universe,
    loading,
    error,
    refresh,
    team,
    settings,
    knownRosters,
    rating: base?.rating ?? null,
    weaknesses: base?.weaknesses ?? [],
    model: base?.model ?? null,
    pickups: pickupList,
    trades: tradeList,
    league,
  };
}
