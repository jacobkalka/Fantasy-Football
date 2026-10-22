import type { NextRequest } from "next/server";
import { getGameDetail } from "@/lib/data/sports";
import { buildGameView } from "@/lib/live/game-view";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";

/** GET /api/games/401872996?format=ppr — Game Center data (shared 5-second cache while live). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d{6,12}$/.test(id)) return Response.json({ error: "Unknown game" }, { status: 400 });
  const formatParam = request.nextUrl.searchParams.get("format") as ScoringFormat;
  const format: ScoringFormat = SCORING_FORMATS.includes(formatParam) ? formatParam : "ppr";
  try {
    return Response.json(buildGameView(await getGameDetail(id), format));
  } catch (error) {
    console.error("game failed", id, error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
