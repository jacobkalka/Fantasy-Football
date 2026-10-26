"use client";

/**
 * The ACTIVE team's roster (lib/teams/store.ts), in the roster shape most screens use.
 * `useRoster()` and `rosterActions` always act on whichever team is selected, so switching
 * teams switches every screen at once and no screen can mix two teams' players.
 *
 * `primaryRoster` is the one hand-built team that syncs to your account
 * (lib/supabase/roster-sync.ts); it doesn't follow the active selection.
 */
import type { Player } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";
import { activeTeam, primaryManualTeam, teamsActions, teamsStore } from "@/lib/teams/store";
import type { FantasyTeam } from "@/lib/teams/types";
import { autoSlot, emptyRoster, MAX_ROSTER, moveToSlot, type Roster, type Slot } from "./lineup";

export { migrateRoster } from "./migrate";

/** Cached roster views, so the same team gives the same object (React needs stable snapshots). */
const views = new WeakMap<FantasyTeam, Roster>();
function asRoster(team: FantasyTeam): Roster {
  let view = views.get(team);
  if (!view) {
    view = { ...emptyRoster(), name: team.name, format: team.format, players: team.players, updatedAt: team.updatedAt };
    views.set(team, view);
  }
  return view;
}

/** The active team's roster, plus whether it has been read from this device yet. */
export function useRoster(): { roster: Roster; ready: boolean; team: FantasyTeam } {
  const { value, ready } = teamsStore.use();
  const team = activeTeam(value);
  return { roster: asRoster(team), ready, team };
}

/** The active roster right now, outside React. */
export function getRoster(): Roster {
  return asRoster(activeTeam(teamsStore.get()));
}

function actionsFor(pick: () => FantasyTeam | undefined, ensure: () => FantasyTeam) {
  const team = () => pick() ?? ensure();
  const write = (patch: Partial<FantasyTeam>) => teamsActions.update(team().id, patch);
  return {
    add(player: Pick<Player, "id" | "name" | "position" | "teamId" | "headshot">): { ok: boolean; reason?: string } {
      const t = team();
      if (t.players.some((p) => p.playerId === player.id)) return { ok: false, reason: "Already on your team" };
      if (t.players.length >= MAX_ROSTER) return { ok: false, reason: `Rosters max out at ${MAX_ROSTER} players` };
      write({
        players: [
          ...t.players,
          {
            playerId: player.id,
            name: player.name,
            position: player.position,
            teamId: player.teamId,
            headshot: player.headshot,
            slot: autoSlot(t.players, player.position),
          },
        ],
      });
      return { ok: true };
    },
    remove(playerId: string) {
      write({ players: team().players.filter((p) => p.playerId !== playerId) });
    },
    move(playerId: string, slot: Slot) {
      write({ players: moveToSlot(team().players, playerId, slot) });
    },
    setFormat(format: ScoringFormat) {
      write({ format });
    },
    /** Saved as you type; an empty name falls back to "My Team" only when read back. */
    rename(name: string) {
      write({ name: name.slice(0, 40) });
    },
    /** Replace everything (importing, syncing, or applying a trade you chose to save). */
    replace(roster: Roster) {
      write({ name: roster.name, format: roster.format, players: roster.players });
    },
    clear() {
      write({ players: [] });
    },
  };
}

/** Edits to the active team. */
export const rosterActions = actionsFor(
  () => activeTeam(teamsStore.get()),
  () => activeTeam(teamsStore.get()),
);

/** The hand-built team that's saved to your account (created if every team is an ESPN one). */
export const primaryRoster = {
  get(): Roster | null {
    const team = primaryManualTeam(teamsStore.get());
    return team ? asRoster(team) : null;
  },
  actions: actionsFor(
    () => primaryManualTeam(teamsStore.get()),
    () => {
      const id = teamsActions.add({ name: "My Team" });
      const state = teamsStore.get();
      return state.teams.find((t) => t.id === id) ?? activeTeam(state);
    },
  ),
};

/** The account-synced roster for React (RosterSync). */
export function usePrimaryRoster(): { roster: Roster | null; ready: boolean } {
  const { value, ready } = teamsStore.use();
  const team = primaryManualTeam(value);
  return { roster: team ? asRoster(team) : null, ready };
}
