"use client";

import { useMemo } from "react";
import type { PlayerLive } from "@/lib/live/types";
import type { LeagueRosterEntry, MatchupSide } from "@/lib/providers/types";
import { projectTeam, winProbability, type TeamProjection } from "./projection";
import { useLiveWeek } from "./context";

export interface SideView {
  teamId: number;
  name: string;
  abbrev: string;
  logo: string | null;
  record: string;
  starters: { entry: LeagueRosterEntry; live: PlayerLive | undefined }[];
  bench: { entry: LeagueRosterEntry; live: PlayerLive | undefined }[];
  /** App-side totals from the canonical live points (same numbers every screen shows). */
  projection: TeamProjection;
  /** ESPN's own numbers for this side (source). */
  espn: Pick<MatchupSide, "points" | "projectedLive" | "projectedPregame" | "winProbability" | "otherPoints" | "otherStarters">;
}

export interface MatchupLive {
  week: number;
  me: SideView;
  opponent: SideView | null;
  /** Your chance to win and whose estimate it is. */
  win: { probability: number; source: "espn" | "estimate" } | null;
  /** Projected final for each side and whose number it is. */
  projected: { me: number; opponent: number | null; source: "espn" | "estimate" };
}

const STARTER = (e: LeagueRosterEntry) => e.slot !== "BENCH" && e.slot !== "IR";

/**
 * The active team's matchup, live: lineups from the ESPN league, points for every player from
 * the one canonical live answer (lib/fantasy/context.ts), team totals summed from those, and
 * ESPN's own projected finals and win probability when it publishes them (otherwise the app's
 * labeled estimate, lib/fantasy/projection.ts). Null for hand-built teams (no league, no opponent).
 */
export function useMatchupLive() {
  const week = useLiveWeek();
  const { matchup, byId, league } = week;

  const view = useMemo<MatchupLive | null>(() => {
    if (!matchup || !league.data) return null;
    const side = (s: MatchupSide, info = league.data!.teams.find((t) => t.id === s.teamId)): SideView => {
      const starters = s.roster.filter(STARTER).map((entry) => ({ entry, live: byId.get(entry.playerId) }));
      const bench = s.roster.filter((e) => !STARTER(e)).map((entry) => ({ entry, live: byId.get(entry.playerId) }));
      const lives = starters.map((x) => x.live).filter((l): l is PlayerLive => Boolean(l));
      return {
        teamId: s.teamId,
        name: info?.name ?? `Team ${s.teamId}`,
        abbrev: info?.abbrev ?? "",
        logo: info?.logo ?? null,
        record: info ? `${info.wins}-${info.losses}${info.ties ? `-${info.ties}` : ""}` : "",
        starters,
        bench,
        projection: projectTeam(lives, s.otherPoints),
        espn: {
          points: s.points,
          projectedLive: s.projectedLive,
          projectedPregame: s.projectedPregame,
          winProbability: s.winProbability,
          otherPoints: s.otherPoints,
          otherStarters: s.otherStarters,
        },
      };
    };
    const me = side(matchup.me);
    const opponent = matchup.opponent ? side(matchup.opponent) : null;
    const espnWin = me.espn.winProbability;
    const win = opponent
      ? espnWin !== null
        ? { probability: espnWin, source: "espn" as const }
        : { probability: winProbability(me.projection, opponent.projection), source: "estimate" as const }
      : null;
    const espnProjected = me.espn.projectedLive !== null && (!opponent || opponent.espn.projectedLive !== null);
    return {
      week: matchup.period,
      me,
      opponent,
      win,
      projected: espnProjected
        ? { me: me.espn.projectedLive!, opponent: opponent?.espn.projectedLive ?? null, source: "espn" }
        : { me: me.projection.projected, opponent: opponent?.projection.projected ?? null, source: "estimate" },
    };
  }, [matchup, league.data, byId]);

  return { ...week, view };
}
