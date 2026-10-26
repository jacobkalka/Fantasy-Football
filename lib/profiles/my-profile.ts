/**
 * Your own public profile and published teams, shared by the account screen and the background
 * sync that keeps published teams current (components/profile/PublicTeamsSync.tsx).
 */
import { useEffect, useSyncExternalStore } from "react";
import { requireSupabase } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/supabase/db-errors";
import {
  fetchPublicProfile,
  fetchPublicTeams,
  publishTeam,
  saveProfileDetails,
  unpublishTeam,
  type ProfileDetails,
  type PublicProfile,
} from "./api";
import type { PublicTeam, PublicTeamValues } from "./public-teams";

export interface MyProfileState {
  status: "idle" | "loading" | "ready" | "error";
  userId: string | null;
  profile: PublicProfile | null;
  teams: PublicTeam[];
}

const IDLE: MyProfileState = { status: "idle", userId: null, profile: null, teams: [] };
let state: MyProfileState = IDLE;
const listeners = new Set<() => void>();

function set(next: Partial<MyProfileState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function load(userId: string, username: string) {
  set({ status: "loading", userId });
  try {
    const supabase = await requireSupabase();
    const [profile, teams] = await Promise.all([fetchPublicProfile(supabase, username), fetchPublicTeams(supabase, userId)]);
    if (state.userId !== userId) return;
    set({ status: "ready", profile, teams });
  } catch {
    if (state.userId === userId) set({ status: "error" });
  }
}

export const myProfile = {
  get: () => state,
  reload() {
    if (state.userId && state.profile) void load(state.userId, state.profile.username);
  },
  async publish(values: PublicTeamValues): Promise<{ error?: string }> {
    if (!state.userId) return { error: "Sign in first." };
    try {
      const saved = await publishTeam(await requireSupabase(), state.userId, values);
      set({ teams: [saved, ...state.teams.filter((t) => t.localId !== saved.localId)] });
      return {};
    } catch (error) {
      return { error: error instanceof Error && !("code" in error) ? error.message : friendlyDbError(error, "save") };
    }
  },
  async unpublish(localId: string): Promise<{ error?: string }> {
    if (!state.userId) return { error: "Sign in first." };
    try {
      await unpublishTeam(await requireSupabase(), state.userId, localId);
      const removed = state.teams.find((t) => t.localId === localId);
      set({
        teams: state.teams.filter((t) => t.localId !== localId),
        profile: state.profile && removed && state.profile.primaryTeamId === removed.id ? { ...state.profile, primaryTeamId: null } : state.profile,
      });
      return {};
    } catch (error) {
      return { error: friendlyDbError(error, "save") };
    }
  },
  async saveDetails(details: ProfileDetails): Promise<{ error?: string }> {
    if (!state.userId || !state.profile) return { error: "Sign in first." };
    try {
      await saveProfileDetails(await requireSupabase(), state.userId, details);
      set({ profile: { ...state.profile, ...details } });
      return {};
    } catch (error) {
      return { error: friendlyDbError(error, "save") };
    }
  },
};

/** Your public profile and teams, loaded once per sign-in. */
export function useMyProfile(userId: string | null, username: string | null): MyProfileState {
  useEffect(() => {
    if (!userId || !username) return;
    if (state.userId !== userId || state.status === "idle" || state.status === "error") void load(userId, username);
  }, [userId, username]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => (userId && state.userId === userId ? state : IDLE),
    () => IDLE,
  );
}
