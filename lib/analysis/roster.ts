/** Turning the app's roster (player ids) into analysis players. */
import type { Position } from "@/lib/providers/types";
import type { LeagueModel } from "./model";
import type { AnalysisPlayer } from "./universe";

/** A roster entry: a player id, or the app's RosterPlayer (lib/roster/lineup.ts). */
export type RosterEntry =
  | string
  | { playerId: string; name?: string; position?: Position; teamId?: string | null; headshot?: string | null };
export type RosterInput = readonly RosterEntry[];

export interface MissingPlayer {
  id: string;
  name: string | null;
  reason: string;
}

const NOT_IN_UNIVERSE = "He isn't among ESPN's 650 most-rostered players, so there's no projection for him (counted as 0).";

/** Roster players found in the universe; anyone else becomes a 0-point placeholder (when we know his position). */
export function resolveRoster(
  roster: RosterInput,
  model: LeagueModel,
): { players: AnalysisPlayer[]; missing: MissingPlayer[] } {
  const players: AnalysisPlayer[] = [];
  const missing: MissingPlayer[] = [];
  const seen = new Set<string>();
  for (const entry of roster) {
    const id = typeof entry === "string" ? entry : entry.playerId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const found = model.byId.get(id);
    if (found) {
      players.push(found);
      continue;
    }
    const info = typeof entry === "string" ? null : entry;
    missing.push({
      id,
      name: info?.name ?? null,
      reason: info?.position ? NOT_IN_UNIVERSE : "Unknown player id; left out of the analysis.",
    });
    if (info?.position) players.push(placeholder(id, info));
  }
  return { players, missing };
}

function placeholder(id: string, info: Exclude<RosterEntry, string>): AnalysisPlayer {
  return {
    id,
    name: info.name ?? "Unknown player",
    position: info.position as Position,
    teamId: info.teamId ?? null,
    headshot: info.headshot ?? null,
    injuryStatus: "UNKNOWN",
    byeWeek: null,
    percentOwned: null,
    percentOwnedChange: null,
    percentStarted: null,
    weekProjection: null,
    games: [],
    seasonPoints: 0,
    ros: null,
    rosNote: NOT_IN_UNIVERSE,
  };
}

/** Accepts ids or objects; returns ids. */
export function rosterIds(roster: RosterInput): string[] {
  return [...new Set(roster.map((e) => (typeof e === "string" ? e : e.playerId)).filter(Boolean))];
}
