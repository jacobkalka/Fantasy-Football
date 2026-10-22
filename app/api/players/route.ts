import { getPlayers, getScoreboard } from "@/lib/data/sports";
import { connection } from "next/server";

/**
 * GET /api/players: every fantasy-relevant player (about 1,000), most-rostered first.
 * The phone downloads this once and searches it instantly as you type.
 */
export async function GET() {
  // Runs per request (from the shared cache), never at build time: ESPN might be down during a deploy.
  await connection();
  try {
    const board = await getScoreboard();
    const players = await getPlayers(board.season);
    return Response.json(
      { season: board.season, players },
      { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("players failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
