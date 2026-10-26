"use client";

import { useEffect } from "react";
import { useLeague } from "@/lib/fantasy/context";
import { leagueTeamChanged, teamFromLeague } from "@/lib/teams/from-league";
import { teamsActions } from "@/lib/teams/store";

/**
 * Invisible, mounted once: while the active team is an ESPN league team, every fresh league
 * answer (the same shared request the Matchup and Home screens use) refreshes the team's
 * roster, lineup slots, scoring, record and the league's "taken" players, so lineup changes
 * made on ESPN show up here without re-importing. Only that one team is touched.
 */
export function LeagueSync() {
  const { data, team } = useLeague();
  useEffect(() => {
    if (!data || !team.espn || data.id !== team.espn.leagueId || data.season !== team.espn.season) return;
    const next = teamFromLeague(data, team.espn.teamId, { isPrivate: data.private, syncedAt: data.fetchedAt });
    if (!next) return;
    // Save the sync time at most once a minute when nothing else changed.
    const stale = !team.espn.syncedAt || Date.parse(data.fetchedAt) - Date.parse(team.espn.syncedAt) > 60_000;
    if (leagueTeamChanged(team, next) || stale) teamsActions.update(team.id, next);
  }, [data, team]);
  return null;
}
