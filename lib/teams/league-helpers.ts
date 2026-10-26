/** Small pure helpers over an ESPN league (shared by the import, the matchup and tests). */
import type { FantasyLeague, MatchupSide } from "@/lib/providers/types";

/** This week's lineup side for one team, or undefined (bye week, or not in this period's schedule). */
export function findMatchupSide(league: FantasyLeague, espnTeamId: number): MatchupSide | undefined {
  for (const m of league.matchups) {
    if (m.home.teamId === espnTeamId) return m.home;
    if (m.away?.teamId === espnTeamId) return m.away;
  }
  return undefined;
}

/**
 * Reads a league id out of whatever was pasted: a bare number, or any ESPN fantasy URL
 * ("https://fantasy.espn.com/football/team?leagueId=123456&teamId=3&seasonId=2026").
 */
export function parseLeagueInput(text: string): { leagueId: string; teamId?: number; season?: number } | null {
  const trimmed = text.trim();
  if (/^\d{1,12}$/.test(trimmed)) return { leagueId: trimmed };
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)espn\.com$/i.test(url.hostname)) return null;
    const leagueId = url.searchParams.get("leagueId") ?? "";
    if (!/^\d{1,12}$/.test(leagueId)) return null;
    const teamId = Number(url.searchParams.get("teamId"));
    const season = Number(url.searchParams.get("seasonId"));
    return {
      leagueId,
      teamId: Number.isInteger(teamId) && teamId > 0 ? teamId : undefined,
      season: Number.isInteger(season) && season > 2000 ? season : undefined,
    };
  } catch {
    return null;
  }
}
