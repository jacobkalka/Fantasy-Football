import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { analysisWeek, scoreUniverse } from "@/lib/analysis/universe";
import { getPlayerUniverse, getScoreboard } from "@/lib/data/sports";
import { specFromParams } from "@/lib/scoring/spec";

/**
 * GET /api/universe?format=ppr: the ~650 most-rostered players with this week's projection,
 * ESPN's rest-of-season projection and week-by-week points, scored in one format (standard,
 * half or ppr; default ppr). The phone downloads it once and runs the team analysis
 * (lib/analysis) on it: ratings, weaknesses, trades, pickups.
 */
export async function GET(request: NextRequest) {
  // Runs per request (from the shared cache), never at build time: ESPN might be down during a deploy.
  await connection();
  // A preset (format=ppr) or a league's own rules (&rules=…).
  const spec = specFromParams(request.nextUrl.searchParams);
  try {
    const board = await getScoreboard();
    const week = analysisWeek(board.seasonType, board.week);
    const universe = await getPlayerUniverse(board.season, week);
    return Response.json(scoreUniverse(universe, spec.format, spec.rules), {
      // Projections and injuries: browser copies stay short. (Offline support never stores /api/.)
      headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("universe failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
