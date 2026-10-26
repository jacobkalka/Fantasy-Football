/**
 * Public profiles: reading someone's profile and the teams they chose to show, and saving your
 * own. The database decides what anyone may see (public_profile(), public_teams policies), so a
 * private profile or a hidden team never reaches another person's app.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { toPublicTeam, toRow, type PublicTeam, type PublicTeamValues } from "./public-teams";

export interface PublicProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  displayName: string | null;
  /** Only when the profile is public (or yours). */
  bio: string | null;
  isPublic: boolean;
  primaryTeamId: string | null;
  isAdmin: boolean;
  createdAt: string;
}

const TEAM_FIELDS = "id, user_id, local_id, name, logo_url, source, league_name, season, record, scoring_label, roster, matchup, is_visible, updated_at";
export const LOCAL_ID = /^t_[a-z0-9]{4,24}$/;

export async function fetchPublicProfile(supabase: SupabaseClient, username: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("public_profile", { name: username });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : null,
    bio: typeof row.bio === "string" && row.bio.trim() ? row.bio.trim() : null,
    isPublic: row.is_public !== false,
    primaryTeamId: typeof row.primary_team_id === "string" ? row.primary_team_id : null,
    isAdmin: row.is_admin === true,
    createdAt: String(row.created_at ?? ""),
  };
}

/** A person's visible teams (yours: all of them, hidden ones too). */
export async function fetchPublicTeams(supabase: SupabaseClient, userId: string): Promise<PublicTeam[]> {
  const { data, error } = await supabase
    .from("public_teams")
    .select(TEAM_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).map((row) => toPublicTeam(row as Record<string, unknown>));
}

/** Publishes (or refreshes) one of your teams. Updates first: only the shown details can change. */
export async function publishTeam(supabase: SupabaseClient, userId: string, values: PublicTeamValues): Promise<PublicTeam> {
  if (!LOCAL_ID.test(values.localId)) throw new Error("This team can't be published from this device.");
  const { local_id, ...changes } = toRow(values);
  const { data, error } = await supabase
    .from("public_teams")
    .update(changes)
    .eq("user_id", userId)
    .eq("local_id", local_id)
    .select(TEAM_FIELDS);
  if (error) throw error;
  if (data && data.length > 0) return toPublicTeam(data[0] as Record<string, unknown>);
  const { data: created, error: insertError } = await supabase
    .from("public_teams")
    .insert({ user_id: userId, local_id, ...changes })
    .select(TEAM_FIELDS)
    .single();
  if (insertError) throw insertError;
  return toPublicTeam(created as Record<string, unknown>);
}

export async function unpublishTeam(supabase: SupabaseClient, userId: string, localId: string) {
  const { error } = await supabase.from("public_teams").delete().eq("user_id", userId).eq("local_id", localId);
  if (error) throw error;
}

export interface ProfileDetails {
  displayName: string | null;
  bio: string | null;
  isPublic: boolean;
  primaryTeamId: string | null;
}

export async function saveProfileDetails(supabase: SupabaseClient, userId: string, details: ProfileDetails) {
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: details.displayName?.trim().slice(0, 40) || null,
      bio: details.bio?.trim().slice(0, 160) || null,
      is_public: details.isPublic,
      primary_team_id: details.primaryTeamId,
    })
    .eq("id", userId);
  if (error) throw error;
}
