import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { getNewsArticles, getPlayersNews } from "@/lib/data/sports";

const MAX_IDS = 20;

/**
 * GET /api/news            ESPN's NFL news (league-wide), as cards.
 * GET /api/news?ids=1,2,3   Fantasy news about these players (your roster), newest first.
 * Headlines, summaries, images and links only: articles are read on ESPN.
 */
export async function GET(request: NextRequest) {
  await connection();
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()))]
    .filter((id) => /^\d{1,12}$/.test(id))
    .sort()
    .slice(0, MAX_IDS);
  try {
    const result = ids.length ? await getPlayersNews(ids) : await getNewsArticles();
    return Response.json(
      { ...result, servedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.error("news failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "ESPN news isn't responding right now." }, { status: 502 });
  }
}
