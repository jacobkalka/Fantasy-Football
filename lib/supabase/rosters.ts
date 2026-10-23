/**
 * Reading and writing your roster in the database (tables `rosters` and
 * `roster_players`). Row-level security means these only ever see or change
 * the signed-in person's own rosters.
 *
 * One hand-built roster ("manual") per account for now. Imported ESPN rosters
 * (Phase 9) will be separate rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Roster } from "@/lib/roster/lineup";
import { nflSeason, toAccountRoster, toAccountRows, type AccountRoster } from "@/lib/roster/sync";

const ROSTER_FIELDS = "id, name, scoring_format, updated_at, roster_players(player_id, slot, position, added_at)";

/** The account's hand-built roster, or null if it has never saved one. */
export async function fetchAccountRoster(supabase: SupabaseClient, userId: string): Promise<AccountRoster | null> {
  const { data, error } = await supabase
    .from("rosters")
    .select(ROSTER_FIELDS)
    .eq("user_id", userId)
    .eq("source", "manual")
    .order("updated_at", { ascending: false })
    .order("added_at", { referencedTable: "roster_players", ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toAccountRoster(data) : null;
}

/** Creates the account's roster row (no players yet) and returns its id. */
export async function createAccountRoster(supabase: SupabaseClient, roster: Roster): Promise<string> {
  const rows = toAccountRows(roster);
  const { data, error } = await supabase
    .from("rosters")
    .insert({ name: rows.name, source: "manual", scoring_format: rows.scoringFormat, season: nflSeason(new Date()) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Thrown when the roster row disappeared (deleted elsewhere), so the caller can create a new one. */
export class RosterGoneError extends Error {
  constructor() {
    super("The saved roster no longer exists.");
  }
}

/**
 * Makes the database copy match `roster`. Players are added/updated first and
 * removed second, so the saved team is never briefly empty. The roster row is
 * touched last, which stamps its updated_at (the "last edited" time sync compares).
 * Returns that new updated_at.
 */
export async function saveAccountRoster(supabase: SupabaseClient, rosterId: string, roster: Roster): Promise<string> {
  const rows = toAccountRows(roster);

  if (rows.players.length > 0) {
    const { error } = await supabase
      .from("roster_players")
      .upsert(
        rows.players.map((p) => ({ roster_id: rosterId, ...p })),
        { onConflict: "roster_id,player_id" },
      );
    if (error) throw error;
  }

  let removal = supabase.from("roster_players").delete().eq("roster_id", rosterId);
  if (rows.players.length > 0) {
    // PostgREST list syntax: ("id1","id2"). Ids are ESPN numbers (D/ST ones start with "-").
    const keep = rows.players.map((p) => `"${p.player_id.replace(/"/g, "")}"`).join(",");
    removal = removal.not("player_id", "in", `(${keep})`);
  }
  const { error: removeError } = await removal;
  if (removeError) throw removeError;

  const { data, error } = await supabase
    .from("rosters")
    .update({ name: rows.name, scoring_format: rows.scoringFormat, season: nflSeason(new Date()) })
    .eq("id", rosterId)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new RosterGoneError();
  return data.updated_at as string;
}

/** ESPN leagues this account has imported a roster from (for league chat rooms). */
export async function fetchLeagueRosters(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ leagueId: string; name: string }[]> {
  const { data, error } = await supabase
    .from("rosters")
    .select("espn_league_id, name")
    .eq("user_id", userId)
    .not("espn_league_id", "is", null);
  if (error) throw error;
  const seen = new Set<string>();
  const leagues: { leagueId: string; name: string }[] = [];
  for (const row of data ?? []) {
    const leagueId = row.espn_league_id as string | null;
    if (!leagueId || seen.has(leagueId)) continue;
    seen.add(leagueId);
    leagues.push({ leagueId, name: (row.name as string) || "My league" });
  }
  return leagues;
}
