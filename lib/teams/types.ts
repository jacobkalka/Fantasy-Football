/**
 * Fantasy teams: everything the app knows about each team you follow (DECISIONS.md, "Teams").
 * You can have several (a hand-built team, ESPN league teams); one is "active" and decides the
 * context of every screen: lineup, matchup, recommendations, news, live tracking, trades.
 */
import type { LeagueSize } from "@/lib/analysis/settings";
import type { RosterPlayer } from "@/lib/roster/lineup";
import type { ScoringFormat, ScoringRules } from "@/lib/scoring";

export interface EspnLink {
  leagueId: string;
  season: number;
  /** ESPN's team number inside the league. */
  teamId: number;
  leagueName: string;
  teamAbbrev: string;
  /** ESPN-hosted team logo, when it has one. */
  logo: string | null;
  /** Private leagues need your ESPN login (kept encrypted on the server, never on this device). */
  private: boolean;
  /** Last successful refresh from ESPN (ISO). */
  syncedAt: string | null;
  /** "4-2", from the league standings at the last refresh. */
  record: string | null;
}

export interface FantasyTeam {
  /** Local id ("t_ab12cd"), stable for the life of the team on this device. */
  id: string;
  name: string;
  source: "manual" | "espn";
  /** The base scoring format (receptions). League teams also carry their exact rules. */
  format: ScoringFormat;
  /** The league's own scoring, translated into the app's stat names. Null = the format's preset. */
  rules: ScoringRules | null;
  leagueSize: LeagueSize;
  players: RosterPlayer[];
  /** Players already rostered in this team's league, so pickups skip them. */
  taken: string[];
  espn: EspnLink | null;
  updatedAt: string;
}

export interface TeamsState {
  version: 2;
  activeId: string;
  teams: FantasyTeam[];
}

export const MAX_TEAMS = 12;
