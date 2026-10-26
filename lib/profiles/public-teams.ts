/**
 * What a published team looks like, and how one is built from a team on this device.
 *
 * Publishing is opt-in per team and per detail (DECISIONS.md, "Public profiles"): the roster,
 * the record, the league's name and this week's matchup are each shared only if you switch
 * them on. Nothing from your ESPN login ever goes in, and league names stay off by default.
 * What comes back from other people is checked again before it's shown.
 */
import type { Position } from "@/lib/providers/types";
import type { Slot } from "@/lib/roster/lineup";
import { specLabel } from "@/lib/scoring/spec";
import type { FantasyTeam } from "@/lib/teams/types";

export interface PublicRosterEntry {
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  slot: Slot;
}

export interface PublicMatchup {
  week: number;
  opponent: string;
  points: number;
  opponentPoints: number;
}

export interface PublicTeam {
  id: string;
  userId: string;
  localId: string;
  name: string;
  logoUrl: string | null;
  source: "manual" | "espn";
  leagueName: string | null;
  season: number | null;
  record: string | null;
  scoringLabel: string | null;
  roster: PublicRosterEntry[] | null;
  matchup: PublicMatchup | null;
  isVisible: boolean;
  updatedAt: string;
}

/** Which details of a team you chose to show. */
export interface ShareChoices {
  roster: boolean;
  record: boolean;
  league: boolean;
  matchup: boolean;
}

export const DEFAULT_SHARE: ShareChoices = { roster: true, record: true, league: false, matchup: false };

const POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DST"]);
const SLOTS = new Set<Slot>(["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"]);
const ESPN_IMAGE = /^https:\/\/[a-z0-9.-]*espncdn\.com\//;

function readRoster(value: unknown): PublicRosterEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: PublicRosterEntry[] = [];
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const { id, name, position, teamId, slot } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^-?\d{1,12}$/.test(id)) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    if (!POSITIONS.has(position as Position) || !SLOTS.has(slot as Slot)) continue;
    out.push({
      id,
      name: name.trim().slice(0, 60),
      position: position as Position,
      teamId: typeof teamId === "string" && /^\d{1,4}$/.test(teamId) ? teamId : null,
      slot: slot as Slot,
    });
  }
  return out;
}

function readMatchup(value: unknown): PublicMatchup | null {
  if (!value || typeof value !== "object") return null;
  const { week, opponent, points, opponentPoints } = value as Record<string, unknown>;
  if (typeof week !== "number" || typeof opponent !== "string" || typeof points !== "number" || typeof opponentPoints !== "number") return null;
  if (!Number.isFinite(points) || !Number.isFinite(opponentPoints) || week < 1 || week > 25) return null;
  return { week, opponent: opponent.slice(0, 60), points, opponentPoints };
}

/** A row from public_teams, checked. */
export function toPublicTeam(row: Record<string, unknown>): PublicTeam {
  const logo = typeof row.logo_url === "string" && ESPN_IMAGE.test(row.logo_url) ? row.logo_url : null;
  const record = typeof row.record === "string" && /^\d{1,2}-\d{1,2}(-\d{1,2})?$/.test(row.record) ? row.record : null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    localId: String(row.local_id),
    name: String(row.name ?? "Team").slice(0, 60),
    logoUrl: logo,
    source: row.source === "espn" ? "espn" : "manual",
    leagueName: typeof row.league_name === "string" ? row.league_name.slice(0, 80) : null,
    season: typeof row.season === "number" ? row.season : null,
    record,
    scoringLabel: typeof row.scoring_label === "string" ? row.scoring_label.slice(0, 40) : null,
    roster: readRoster(row.roster),
    matchup: readMatchup(row.matchup),
    isVisible: row.is_visible !== false,
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** The share choices a published team was saved with (a detail is shared when it's there). */
export function choicesOf(team: PublicTeam): ShareChoices {
  return { roster: team.roster !== null, record: team.record !== null, league: team.leagueName !== null, matchup: team.matchup !== null };
}

export type PublicTeamValues = Omit<PublicTeam, "id" | "userId" | "updatedAt">;

/**
 * The values to publish for one of your teams, given what you chose to share. `matchup` is this
 * week's live matchup when the team is in an ESPN league (null otherwise, or when not shared).
 */
export function snapshotTeam(
  team: FantasyTeam,
  share: ShareChoices,
  { season, matchup }: { season: number; matchup: PublicMatchup | null },
): PublicTeamValues {
  const logo = team.espn?.logo && ESPN_IMAGE.test(team.espn.logo) && team.espn.logo.length <= 500 ? team.espn.logo : null;
  const record = team.espn?.record && /^\d{1,2}-\d{1,2}(-\d{1,2})?$/.test(team.espn.record) ? team.espn.record : null;
  return {
    localId: team.id,
    name: team.name.trim().slice(0, 60) || "My team",
    logoUrl: logo,
    source: team.source,
    leagueName: share.league && team.espn ? team.espn.leagueName.slice(0, 80) : null,
    season: team.espn?.season ?? season,
    record: share.record ? record : null,
    scoringLabel: specLabel({ format: team.format, rules: team.rules }).slice(0, 40),
    roster: share.roster
      ? team.players.slice(0, 20).map((p) => ({ id: p.playerId, name: p.name, position: p.position, teamId: p.teamId, slot: p.slot }))
      : null,
    matchup: share.matchup ? matchup : null,
    isVisible: true,
  };
}

/** Database column names for a snapshot. */
export function toRow(values: PublicTeamValues) {
  return {
    local_id: values.localId,
    name: values.name,
    logo_url: values.logoUrl,
    source: values.source,
    league_name: values.leagueName,
    season: values.season,
    record: values.record,
    scoring_label: values.scoringLabel,
    roster: values.roster,
    matchup: values.matchup,
    is_visible: values.isVisible,
  };
}

/** True when publishing these values would change what's shown. */
export function snapshotChanged(current: PublicTeam, next: PublicTeamValues): boolean {
  const a = toRow({ ...current });
  const b = toRow(next);
  return JSON.stringify(a) !== JSON.stringify(b);
}
