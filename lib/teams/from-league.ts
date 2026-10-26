/**
 * Turning an ESPN league team into a FantasyLab team (pure; tested in from-league.test.ts).
 *
 * - Lineup: ESPN's slots map onto the app's (flex-type slots → FLEX, IR → bench). Players the app
 *   can't score (individual defensive players) aren't added; the matchup screen says they exist.
 * - Scoring: the league's own rules (translated stat by stat), so every point shown for this team
 *   matches the league. The nearest preset (by points per catch) is kept for the few analysis
 *   tools that only know presets.
 * - League size: the nearest size the analysis supports.
 * - "Taken": every player on another team in the league, so pickups only suggest free agents.
 */
import { LEAGUE_SIZES, type LeagueSize } from "@/lib/analysis/settings";
import { headshotUrl } from "@/lib/providers";
import type { FantasyLeague, LeagueSlot } from "@/lib/providers/types";
import type { RosterPlayer, Slot } from "@/lib/roster/lineup";
import { cleanRules, nearestFormat } from "@/lib/scoring/spec";
import { findMatchupSide } from "./league-helpers";
import type { FantasyTeam } from "./types";

const SLOT: Record<LeagueSlot, Slot> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  FLEX: "FLEX",
  K: "K",
  DST: "DST",
  BENCH: "BENCH",
  IR: "BENCH",
};

export function nearestLeagueSize(size: number): LeagueSize {
  return [...LEAGUE_SIZES].sort((a, b) => Math.abs(a - size) - Math.abs(b - size) || a - b)[0];
}

export function teamFromLeague(
  league: FantasyLeague,
  espnTeamId: number,
  { isPrivate, syncedAt }: { isPrivate: boolean; syncedAt: string },
): Omit<FantasyTeam, "id" | "updatedAt"> | null {
  const info = league.teams.find((t) => t.id === espnTeamId);
  if (!info) return null;
  const side = findMatchupSide(league, espnTeamId);
  const players: RosterPlayer[] = (side?.roster ?? []).map((e) => ({
    playerId: e.playerId,
    name: e.name,
    position: e.position,
    teamId: e.teamId,
    headshot: e.position === "DST" ? null : headshotUrl(e.playerId),
    slot: SLOT[e.slot],
  }));
  const rules = cleanRules(league.scoring.rules);
  const taken = league.teams.filter((t) => t.id !== espnTeamId).flatMap((t) => t.playerIds);
  return {
    name: info.name,
    source: "espn",
    format: nearestFormat(rules),
    rules,
    leagueSize: nearestLeagueSize(league.size),
    players,
    taken: [...new Set(taken)],
    espn: {
      leagueId: league.id,
      season: league.season,
      teamId: espnTeamId,
      leagueName: league.name,
      teamAbbrev: info.abbrev,
      logo: info.logo,
      private: isPrivate,
      syncedAt,
      record: `${info.wins}-${info.losses}${info.ties ? `-${info.ties}` : ""}`,
    },
  };
}

/** True when ESPN's copy differs from ours in a way worth saving (roster, slots, record, name). */
export function leagueTeamChanged(current: FantasyTeam, next: Omit<FantasyTeam, "id" | "updatedAt">): boolean {
  const sig = (t: Pick<FantasyTeam, "name" | "players" | "taken"> & { espn: FantasyTeam["espn"] }) =>
    [
      t.name,
      t.espn?.record ?? "",
      t.espn?.leagueName ?? "",
      t.players.map((p) => `${p.playerId}:${p.slot}`).sort().join(","),
      t.taken.length,
    ].join("|");
  return sig(current) !== sig(next) || JSON.stringify(current.rules) !== JSON.stringify(next.rules);
}
