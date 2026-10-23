import { getPlayers, getScoreboard } from "@/lib/data/sports";
import { connection } from "next/server";

/**
 * GET /api/players: every fantasy-relevant player (about 1,000), most-rostered first.
 * The phone downloads this once per visit and searches it instantly as you type.
 */
export async function GET() {
  // Runs per request (from the shared cache), never at build time: ESPN might be down during a deploy.
  await connection();
  try {
    const board = await getScoreboard();
    const players = await getPlayers(board.season);
    return Response.json(
      { season: board.season, players },
      // Short browser copies: the list includes injury status. (Offline support never stores /api/.)
      { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=900" } },
    );
  } catch (error) {
    console.error("players failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
