import { connection, type NextRequest } from "next/server";
import { getPlayerResearch, PlayerNotFoundError } from "@/lib/players/service";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";

/**
 * GET /api/player/4362628/profile?format=ppr — the research profile for ANY NFL
 * player (or a D/ST, e.g. -16012): bio, career by season, this season game by game,
 * depth chart, news, plus the analysis (points per game, consistency, usage,
 * trends, sustainability, role labels, a plain-language summary, and what ESPN
 * doesn't publish). The live player sheet keeps using the lighter /api/player/[id].
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/player/[id]/profile">) {
  // Fetched per request (from the shared caches), never at build time.
  await connection();
  const { id } = await ctx.params;
  if (!/^-?\d{1,12}$/.test(id)) return Response.json({ error: "Unknown player" }, { status: 400 });
  const formatParam = request.nextUrl.searchParams.get("format") as ScoringFormat;
  const format: ScoringFormat = SCORING_FORMATS.includes(formatParam) ? formatParam : "ppr";
  try {
    const research = await getPlayerResearch(id, format);
    return Response.json(research, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=600" } });
  } catch (error) {
    if (error instanceof PlayerNotFoundError) return Response.json({ error: "No player with that id." }, { status: 404 });
    console.error("player profile failed", id, error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
