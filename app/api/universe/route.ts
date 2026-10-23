import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { analysisWeek, scoreUniverse } from "@/lib/analysis/universe";
import { getPlayerUniverse, getScoreboard } from "@/lib/data/sports";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";

/**
 * GET /api/universe?format=ppr: the ~650 most-rostered players with this week's projection,
 * ESPN's rest-of-season projection and week-by-week points, scored in one format (standard,
 * half or ppr; default ppr). The phone downloads it once and runs the team analysis
 * (lib/analysis) on it: ratings, weaknesses, trades, pickups.
 */
export async function GET(request: NextRequest) {
  // Runs per request (from the shared cache), never at build time: ESPN might be down during a deploy.
  await connection();
  const formatParam = request.nextUrl.searchParams.get("format") ?? "ppr";
  if (!(SCORING_FORMATS as readonly string[]).includes(formatParam)) {
    return Response.json({ error: "Scoring format must be standard, half or ppr." }, { status: 400 });
  }
  try {
    const board = await getScoreboard();
    const week = analysisWeek(board.seasonType, board.week);
    const universe = await getPlayerUniverse(board.season, week);
    return Response.json(scoreUniverse(universe, formatParam as ScoringFormat), {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("universe failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
