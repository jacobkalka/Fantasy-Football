import type { NextRequest } from "next/server";
import { parseStartSitQuery } from "@/lib/startsit/query";
import { buildStartSit, StartSitInputError } from "@/lib/startsit/service";

/**
 * GET /api/startsit?ids=3915416,4362628&format=ppr[&explain=1]
 * Who to start among 2-4 players this week: each player's adjusted projection,
 * floor/ceiling and factors, plus the pick, a confidence level and the reasons.
 * With explain=1 it also asks Claude for a short friendly summary (when configured).
 */
export async function GET(request: NextRequest) {
  const query = parseStartSitQuery(request.nextUrl.searchParams);
  if (!query.ok) return Response.json({ error: query.error }, { status: 400 });

  try {
    const result = await buildStartSit(query.ids, query.format, { explain: query.explain });
    return Response.json(result);
  } catch (error) {
    if (error instanceof StartSitInputError) return Response.json({ error: error.message }, { status: 400 });
    console.error("startsit failed", query.ids, error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
