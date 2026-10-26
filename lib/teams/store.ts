"use client";

/**
 * Your fantasy teams, saved on this device (DECISIONS.md, "Teams"). One is active at a time and
 * decides what every screen shows. Switching teams switches the whole app's context: nothing from
 * one team is shown in another's (each team carries its own players, scoring, league size and
 * "taken" list).
 *
 * The first version of the app kept a single roster under "fantasylab:roster"; it becomes your
 * first team automatically, and that old key is left in place as a backup.
 *
 * Saved carefully (lib/storage/persisted.ts): versioned, damaged entries dropped one by one,
 * anything unreadable backed up, never wiped.
 */
import { LEAGUE_SIZES, type LeagueSize } from "@/lib/analysis/settings";
import type { Position } from "@/lib/providers/types";
import { emptyRoster, MAX_ROSTER, type RosterPlayer, type Slot } from "@/lib/roster/lineup";
import { migrateRoster } from "@/lib/roster/migrate";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";
import { cleanRules } from "@/lib/scoring/spec";
import { createPersistedStore } from "@/lib/storage/persisted";
import { MAX_TEAMS, type EspnLink, type FantasyTeam, type TeamsState } from "./types";

const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const SLOTS: readonly Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : null);

export function newTeamId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `t_${random}`;
}

export function blankTeam(partial: Partial<FantasyTeam> = {}): FantasyTeam {
  return {
    id: partial.id ?? newTeamId(),
    name: partial.name ?? "My Team",
    source: partial.source ?? "manual",
    format: partial.format ?? "ppr",
    rules: partial.rules ?? null,
    leagueSize: partial.leagueSize ?? 12,
    players: partial.players ?? [],
    taken: partial.taken ?? [],
    espn: partial.espn ?? null,
    updatedAt: partial.updatedAt ?? new Date(0).toISOString(),
  };
}

function readPlayer(raw: unknown): RosterPlayer | null {
  if (!isRecord(raw)) return null;
  const { playerId, name, position, teamId, headshot, slot } = raw;
  if (typeof playerId !== "string" || !playerId || playerId.length > 24) return null;
  if (typeof name !== "string" || !POSITIONS.includes(position as Position)) return null;
  return {
    playerId,
    name: name.slice(0, 60),
    position: position as Position,
    teamId: typeof teamId === "string" ? teamId : null,
    headshot: typeof headshot === "string" ? headshot : null,
    slot: SLOTS.includes(slot as Slot) ? (slot as Slot) : "BENCH",
  };
}

function readEspn(raw: unknown): EspnLink | null {
  if (!isRecord(raw)) return null;
  const leagueId = str(raw.leagueId, 32);
  const season = Number(raw.season);
  const teamId = Number(raw.teamId);
  if (!leagueId || !/^\d{1,12}$/.test(leagueId) || !Number.isInteger(season) || !Number.isInteger(teamId)) return null;
  return {
    leagueId,
    season,
    teamId,
    leagueName: str(raw.leagueName, 80) ?? "ESPN league",
    teamAbbrev: str(raw.teamAbbrev, 8) ?? "",
    logo: typeof raw.logo === "string" && raw.logo.startsWith("https://") ? raw.logo : null,
    private: raw.private === true,
    syncedAt: str(raw.syncedAt, 40),
    record: str(raw.record, 16),
  };
}

function readTeam(raw: unknown): FantasyTeam | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !/^t_[a-z0-9]{4,24}$/i.test(raw.id)) return null;
  const seen = new Set<string>();
  const players = (Array.isArray(raw.players) ? raw.players : [])
    .map(readPlayer)
    .filter((p): p is RosterPlayer => p !== null && !seen.has(p.playerId) && Boolean(seen.add(p.playerId)))
    .slice(0, MAX_ROSTER + 4);
  const espn = raw.source === "espn" ? readEspn(raw.espn) : null;
  return {
    id: raw.id,
    name: (str(raw.name, 60) ?? "").trim() || "My Team",
    source: espn ? "espn" : "manual",
    format: SCORING_FORMATS.includes(raw.format as ScoringFormat) ? (raw.format as ScoringFormat) : "ppr",
    rules: cleanRules(raw.rules),
    leagueSize: LEAGUE_SIZES.includes(raw.leagueSize as LeagueSize) ? (raw.leagueSize as LeagueSize) : 12,
    players,
    taken: Array.isArray(raw.taken)
      ? [...new Set(raw.taken.filter((v): v is string => typeof v === "string" && v.length < 24))].slice(0, 400)
      : [],
    espn,
    updatedAt: str(raw.updatedAt, 40) ?? new Date(0).toISOString(),
  };
}

/** Any saved teams value (or a v1 single roster) → the current shape, or null if unusable. */
export function migrateTeams(raw: unknown): TeamsState | null {
  if (!isRecord(raw)) return null;
  if (raw.version === 2 && Array.isArray(raw.teams)) {
    const ids = new Set<string>();
    const teams = raw.teams
      .map(readTeam)
      .filter((t): t is FantasyTeam => t !== null && !ids.has(t.id) && Boolean(ids.add(t.id)))
      .slice(0, MAX_TEAMS);
    if (teams.length === 0) return null;
    const activeId = typeof raw.activeId === "string" && ids.has(raw.activeId) ? raw.activeId : teams[0].id;
    return { version: 2, activeId, teams };
  }
  // Version 1 stored one roster: it becomes the first team.
  const roster = migrateRoster(raw);
  if (!roster) return null;
  // League size and "taken" players used to be app-wide settings; they now belong to the team.
  const legacy = legacySettings();
  const team = blankTeam({
    name: roster.name,
    format: roster.format,
    players: roster.players,
    updatedAt: roster.updatedAt,
    leagueSize: legacy.leagueSize,
    taken: legacy.taken,
  });
  return { version: 2, activeId: team.id, teams: [team] };
}

function legacySettings(): { leagueSize: LeagueSize; taken: string[] } {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem("fantasylab:settings");
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return {
      leagueSize: LEAGUE_SIZES.includes(parsed.leagueSize as LeagueSize) ? (parsed.leagueSize as LeagueSize) : 12,
      taken: Array.isArray(parsed.taken) ? parsed.taken.filter((v): v is string => typeof v === "string").slice(0, 400) : [],
    };
  } catch {
    return { leagueSize: 12, taken: [] };
  }
}

function defaults(): TeamsState {
  const team = blankTeam({ id: "t_first0" });
  return { version: 2, activeId: team.id, teams: [team] };
}

export const teamsStore = createPersistedStore<TeamsState>({
  key: "teams",
  // The single-roster store of earlier versions, and before that the app's old name.
  legacyKeys: ["fantasylab:roster", "the-feed:roster:v1"],
  defaults,
  migrate: migrateTeams,
});

export function activeTeam(state: TeamsState): FantasyTeam {
  return state.teams.find((t) => t.id === state.activeId) ?? state.teams[0];
}

/** The team you hand-build in the app and that syncs to your account (the first manual team). */
export function primaryManualTeam(state: TeamsState): FantasyTeam | undefined {
  return state.teams.find((t) => t.source === "manual");
}

export function useTeamsState() {
  return teamsStore.use();
}

/** The active team, and whether saved data has been read yet (render a placeholder until then). */
export function useActiveTeam(): { team: FantasyTeam; teams: FantasyTeam[]; ready: boolean } {
  const { value, ready } = teamsStore.use();
  return { team: activeTeam(value), teams: value.teams, ready };
}

function patchTeam(id: string, patch: (team: FantasyTeam) => FantasyTeam) {
  teamsStore.set((state) => ({
    ...state,
    teams: state.teams.map((t) => (t.id === id ? { ...patch(t), updatedAt: new Date().toISOString() } : t)),
  }));
}

export const teamsActions = {
  select(id: string) {
    teamsStore.set((state) => (state.teams.some((t) => t.id === id) ? { ...state, activeId: id } : state));
  },
  /** Adds a team and makes it active. Returns its id, or null when you're at the limit. */
  add(team: Partial<FantasyTeam>): string | null {
    const state = teamsStore.get();
    if (state.teams.length >= MAX_TEAMS) return null;
    const created = blankTeam({ ...team, id: newTeamId(), updatedAt: new Date().toISOString() });
    teamsStore.set({ ...state, activeId: created.id, teams: [...state.teams, created] });
    return created.id;
  },
  /** An ESPN team you've already linked is updated in place instead of added twice. */
  upsertEspn(team: Omit<FantasyTeam, "id" | "updatedAt">): string | null {
    const state = teamsStore.get();
    const existing = state.teams.find(
      (t) => t.espn?.leagueId === team.espn?.leagueId && t.espn?.teamId === team.espn?.teamId && t.espn?.season === team.espn?.season,
    );
    if (existing) {
      patchTeam(existing.id, (t) => ({ ...t, ...team, id: t.id }));
      return existing.id;
    }
    return teamsActions.add(team);
  },
  update(id: string, patch: Partial<Omit<FantasyTeam, "id">>) {
    patchTeam(id, (t) => ({ ...t, ...patch }));
  },
  /** Removes a team. The last team can't be removed (it's emptied instead). */
  remove(id: string) {
    const state = teamsStore.get();
    if (state.teams.length <= 1) {
      patchTeam(id, (t) => ({ ...t, players: [], espn: null, source: "manual", name: "My Team", rules: null }));
      return;
    }
    const teams = state.teams.filter((t) => t.id !== id);
    teamsStore.set({ ...state, teams, activeId: state.activeId === id ? teams[0].id : state.activeId });
  },
  /** Mark a player as already on another team in this team's league (pickups skip him). */
  toggleTaken(id: string, playerId: string) {
    patchTeam(id, (t) => ({
      ...t,
      taken: t.taken.includes(playerId) ? t.taken.filter((x) => x !== playerId) : [playerId, ...t.taken].slice(0, 400),
    }));
  },
  patch: patchTeam,
};

/** For tests: a roster-shaped view of a team (the older single-roster API). */
export function teamAsRoster(team: FantasyTeam) {
  return { ...emptyRoster(), name: team.name, format: team.format, players: team.players, updatedAt: team.updatedAt };
}
