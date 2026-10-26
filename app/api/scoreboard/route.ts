import type { NextRequest } from "next/server";
import { getScoreboard } from "@/lib/data/sports";

/** GET /api/scoreboard?week=7 — this week's games (shared 5-second cache). */
export async function GET(request: NextRequest) {
  const week = Number(request.nextUrl.searchParams.get("week")) || undefined;
  const season = Number(request.nextUrl.searchParams.get("season")) || undefined;
  try {
    return Response.json({ ...(await getScoreboard(week, season)), servedAt: new Date().toISOString() });
  } catch (error) {
    console.error("scoreboard failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
