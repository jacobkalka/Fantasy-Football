import { z } from "zod";
import { readCredentials, EspnLinkUnavailableError } from "@/lib/espn-link/service";
import { LeagueNotFoundError, LeaguePrivateError, sports } from "@/lib/providers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/session";

/**
 * POST /api/espn/verify-league { leagueId, season, name }
 * Proves you're in an ESPN league before its private chat room opens: the server reads the
 * league with YOUR ESPN login and checks that your ESPN account owns a team in it. Only then
 * is your membership saved as verified (the database refuses that flag from anyone but the server).
 */
const Body = z.object({
  leagueId: z.string().regex(/^\d{1,12}$/),
  season: z.number().int().min(2018).max(2100),
  name: z.string().min(1).max(60),
});
const noStore = { "cache-control": "private, no-store" };

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That isn't a valid league." }, { status: 400, headers: noStore });
  const db = supabaseAdmin();
  if (!db) return Response.json({ error: "League chat isn't set up on this server yet." }, { status: 503, headers: noStore });
  const { leagueId, season, name } = parsed.data;
  try {
    const saved = await readCredentials(user.id);
    if (!saved) {
      return Response.json(
        { error: "Connect your ESPN account so FantasyLab can confirm you're in this league.", code: "connect" },
        { status: 401, headers: noStore },
      );
    }
    const owned = await sports.getLeagueOwnership(leagueId, season, saved.credentials);
    if (owned.length === 0) {
      return Response.json(
        { error: "Your ESPN account doesn't own a team in this league.", code: "not-member" },
        { status: 403, headers: noStore },
      );
    }
    const { error } = await db.from("rosters").upsert(
      owned.map((teamId) => ({
        user_id: user.id,
        name,
        source: "espn",
        espn_league_id: leagueId,
        espn_team_id: String(teamId),
        season,
        espn_verified: true,
      })),
      { onConflict: "user_id,espn_league_id,espn_team_id,season" },
    );
    if (error) throw new Error("Couldn't save the membership");
    return Response.json({ verified: true, teams: owned }, { headers: noStore });
  } catch (error) {
    if (error instanceof EspnLinkUnavailableError) return Response.json({ error: error.message }, { status: 503, headers: noStore });
    if (error instanceof LeaguePrivateError) {
      return Response.json({ error: "Your ESPN login has expired. Reconnect ESPN.", code: "expired" }, { status: 401, headers: noStore });
    }
    if (error instanceof LeagueNotFoundError) return Response.json({ error: "ESPN has no such league." }, { status: 404, headers: noStore });
    console.error("league verification failed");
    return Response.json({ error: "Couldn't check with ESPN right now. Try again." }, { status: 502, headers: noStore });
  }
}
