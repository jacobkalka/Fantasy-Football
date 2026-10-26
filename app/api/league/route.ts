import type { NextRequest } from "next/server";
import { getPublicLeague } from "@/lib/data/sports";
import { espnLinkAvailable, readCredentials, setStatus } from "@/lib/espn-link/service";
import { LeagueNotFoundError, LeaguePrivateError, sports } from "@/lib/providers";
import { currentUser } from "@/lib/supabase/session";

/**
 * GET /api/league?id=123456&season=2026
 * An ESPN league: teams, records, this week's matchups with lineups, live scores, ESPN's live
 * projections and win probability. Public leagues come from a shared cache. Private leagues use
 * the signed-in user's ESPN login (decrypted on the server only); the cookies never leave it.
 *
 * Errors carry a `code` the app turns into a next step:
 *   private (connect ESPN) · expired (reconnect ESPN) · not-found · unavailable · espn-down
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  const season = Number(params.get("season"));
  if (!/^\d{1,12}$/.test(id) || !Number.isInteger(season) || season < 2018 || season > 2100) {
    return Response.json({ error: "That isn't a valid ESPN league id.", code: "bad-request" }, { status: 400 });
  }
  const servedAt = () => new Date().toISOString();
  try {
    const lookup = await getPublicLeague(id, season);
    if (lookup.status === "ok") return Response.json({ ...lookup.league, private: false, servedAt: servedAt() });
    if (lookup.status === "not-found") {
      return Response.json({ error: "ESPN has no league with that id for this season.", code: "not-found" }, { status: 404 });
    }

    // Private league: only with this user's own ESPN login.
    const user = await currentUser();
    if (!user) {
      return Response.json(
        { error: "This league is private. Sign in and connect your ESPN account to see it.", code: "private" },
        { status: 401 },
      );
    }
    if (!espnLinkAvailable()) {
      return Response.json(
        { error: "Private leagues aren't set up on this server yet.", code: "unavailable" },
        { status: 503 },
      );
    }
    const saved = await readCredentials(user.id);
    if (!saved) {
      return Response.json(
        { error: "This league is private. Connect your ESPN account to see it.", code: "private" },
        { status: 401 },
      );
    }
    try {
      const league = await sports.getLeague(id, season, saved.credentials);
      if (saved.status !== "active") await setStatus(user.id, "active");
      const now = servedAt();
      return Response.json(
        { ...league, private: true, fetchedAt: now, servedAt: now },
        { headers: { "cache-control": "private, no-store" } },
      );
    } catch (error) {
      if (error instanceof LeaguePrivateError) {
        await setStatus(user.id, "expired");
        return Response.json(
          { error: "Your ESPN login has expired or can't see this league. Reconnect ESPN.", code: "expired" },
          { status: 401 },
        );
      }
      if (error instanceof LeagueNotFoundError) {
        return Response.json({ error: "ESPN has no league with that id for this season.", code: "not-found" }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    console.error("league failed", id, error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "ESPN isn't responding right now.", code: "espn-down" }, { status: 502 });
  }
}
