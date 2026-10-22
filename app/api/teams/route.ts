import { getTeams } from "@/lib/data/sports";
import { connection } from "next/server";
import { teamLite, type TeamLite } from "@/lib/live/types";

/** GET /api/teams: all 32 teams with colors and logos. */
export async function GET() {
  // Runs per request (from the shared cache), never at build time: ESPN might be down during a deploy.
  await connection();
  try {
    const teams: Record<string, TeamLite> = {};
    for (const team of await getTeams()) teams[team.id] = teamLite(team);
    return Response.json(
      { teams },
      { headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" } },
    );
  } catch (error) {
    console.error("teams failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
