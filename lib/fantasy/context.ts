"use client";

/**
 * The app's canonical fantasy data layer (DECISIONS.md, "One source of truth").
 *
 *   ESPN → server engines (lib/live, lib/providers/espn/league) → shared live client (lib/sync)
 *        → these hooks → every screen
 *
 * - The ACTIVE team (lib/teams/store.ts) decides everything: players, scoring rules, league,
 *   opponent. Nothing here ever reads another team.
 * - `useLeague()`: the active team's ESPN league (matchups, records, ESPN's live projection and
 *   win probability). One request per league, shared by Home, Matchup and Live.
 * - `useLiveWeek()`: live fantasy points for your roster + your opponent's lineup + the players
 *   you track, in ONE request scored with your team's rules. Every points number on every screen
 *   comes from this one answer, so they can't disagree and they all update together.
 */
import { useEffect, useMemo } from "react";
import type { PlayerLive } from "@/lib/live/types";
import type { FantasyLeague, LeagueMatchup, LeagueTeamInfo, MatchupSide, Scoreboard } from "@/lib/providers/types";
import { specQuery, type ScoringSpec } from "@/lib/scoring/spec";
import { useSettings } from "@/lib/settings/store";
import { useLive } from "@/lib/sync/useLive";
import { useActiveTeam } from "@/lib/teams/store";
import type { FantasyTeam } from "@/lib/teams/types";
import type { TeamLiveResponse } from "@/lib/hooks/useTeamLive";

// ── Is anything live? (one shared scoreboard poll decides how fast everything else polls) ──

let gamesLive = false;
/** Fast polling while any NFL game is on, slow otherwise (lib/sync/store.ts reads this). */
export const pace = {
  live: (fastMs: number, slowMs: number) => () => (gamesLive ? fastMs : slowMs),
};

export type ScoreboardResponse = Scoreboard & { fetchedAt: string; servedAt?: string };

export function useScoreboard() {
  const state = useLive<ScoreboardResponse>("/api/scoreboard", {
    interval: (d) => (d?.games.some((g) => g.state === "in") ? 15_000 : 60_000),
  });
  const live = Boolean(state.data?.games.some((g) => g.state === "in"));
  useEffect(() => {
    gamesLive = live;
  }, [live]);
  return state;
}

// ── Team context ─────────────────────────────────────────────────────────────

export function specOf(team: FantasyTeam): ScoringSpec {
  return { format: team.format, rules: team.rules };
}

export type LeagueResponse = FantasyLeague & { fetchedAt: string; servedAt: string; private: boolean };
export type LeagueError = { error: string; code: "private" | "expired" | "not-found" | "unavailable" | "espn-down" | "bad-request" };

export function leagueUrl(team: FantasyTeam): string | null {
  return team.espn ? `/api/league?id=${team.espn.leagueId}&season=${team.espn.season}` : null;
}

/** The active team's ESPN league, or null data for hand-built teams. */
export function useLeague() {
  const { team, ready } = useActiveTeam();
  const url = ready ? leagueUrl(team) : null;
  const state = useLive<LeagueResponse>(url, { interval: pace.live(12_000, 180_000) });
  return { ...state, team, ready, isLeague: Boolean(team.espn) };
}

export interface MatchupView {
  period: number;
  me: MatchupSide;
  opponent: MatchupSide | null;
  myTeam: LeagueTeamInfo | undefined;
  opponentTeam: LeagueTeamInfo | undefined;
  matchup: LeagueMatchup;
}

/** This week's matchup for the active team, from its league. */
export function findMatchup(league: FantasyLeague | undefined, espnTeamId: number | undefined): MatchupView | null {
  if (!league || espnTeamId === undefined) return null;
  const matchup = league.matchups.find((m) => m.home.teamId === espnTeamId || m.away?.teamId === espnTeamId);
  if (!matchup) return null;
  const home = matchup.home.teamId === espnTeamId;
  const me = home ? matchup.home : matchup.away!;
  const opponent = home ? matchup.away : matchup.home;
  return {
    period: matchup.period,
    me,
    opponent,
    myTeam: league.teams.find((t) => t.id === me.teamId),
    opponentTeam: opponent ? league.teams.find((t) => t.id === opponent.teamId) : undefined,
    matchup,
  };
}

export function useMatchup() {
  const league = useLeague();
  const view = useMemo(() => findMatchup(league.data, league.team.espn?.teamId), [league.data, league.team.espn?.teamId]);
  return { ...league, matchup: view };
}

// ── Live points: one request for everything on screen ───────────────────────

export function liveUrl(ids: string[], spec: ScoringSpec, week?: number): string | null {
  if (ids.length === 0) return null;
  const sorted = [...new Set(ids)].sort().slice(0, 64).join(",");
  return `/api/live?ids=${sorted}&${specQuery(spec)}${week ? `&week=${week}` : ""}`;
}

/**
 * Live fantasy points for the active team's roster, its current opponent and your tracked
 * players, scored with the active team's rules. `week` looks back at a finished week (roster
 * only: past opponents' lineups aren't kept).
 */
export function useLiveWeek(week?: number) {
  const { team, ready } = useActiveTeam();
  const { value: settings } = useSettings();
  const league = useMatchup();
  const opponentIds = useMemo(
    () => (week ? [] : (league.matchup?.opponent?.roster.map((e) => e.playerId) ?? [])),
    [league.matchup, week],
  );
  const mine = useMemo(() => team.players.map((p) => p.playerId), [team.players]);
  const tracked = week ? [] : settings.watchlist;
  const url = ready ? liveUrl([...mine, ...opponentIds, ...tracked], specOf(team), week) : null;
  const live = useLive<TeamLiveResponse>(url, {
    interval: (d) => (d?.anyLive ? 8_000 : 60_000),
  });
  const byId = useMemo(
    () => new Map<string, PlayerLive>((live.data?.players ?? []).map((p) => [p.playerId, p])),
    [live.data],
  );
  return {
    ...live,
    // An answer for another team's rules or another week can't be shown (it's only ever briefly stale).
    data: live.data && (week === undefined || live.data.week === week) ? live.data : undefined,
    team,
    ready,
    byId,
    mineIds: mine,
    opponentIds,
    trackedIds: tracked,
    matchup: league.matchup,
    league,
  };
}
