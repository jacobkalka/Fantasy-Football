import type { NextRequest } from "next/server";
import { getPlayerNews, getPlayerOutlooks, getScoreboard } from "@/lib/data/sports";
import { rulesForFormat, SCORING_FORMATS, scoreStatLine, type ScoringFormat } from "@/lib/scoring";

/** GET /api/player/3139477?format=ppr: outlook, week-by-week points and news for one player. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/player/[id]">) {
  const { id } = await ctx.params;
  if (!/^-?\d{1,12}$/.test(id)) return Response.json({ error: "Unknown player" }, { status: 400 });
  const formatParam = request.nextUrl.searchParams.get("format") as ScoringFormat;
  const format: ScoringFormat = SCORING_FORMATS.includes(formatParam) ? formatParam : "ppr";
  const rules = rulesForFormat(format);
  try {
    const board = await getScoreboard();
    const [outlooks, news] = await Promise.all([
      getPlayerOutlooks([id], board.season, board.week).catch(() => []),
      id.startsWith("-") ? Promise.resolve([]) : getPlayerNews(id).catch(() => []),
    ]);
    const outlook = outlooks[0] ?? null;
    return Response.json({
      week: board.week,
      outlook: outlook?.outlook ?? null,
      injuryStatus: outlook?.injuryStatus ?? null,
      projection: outlook?.projection ? scoreStatLine(outlook.projection, rules).total : null,
      weeks: (outlook?.weeks ?? []).map((w) => ({ week: w.week, points: scoreStatLine(w.stats, rules).total })),
      news: news.slice(0, 6),
    });
  } catch (error) {
    console.error("player failed", id, error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
