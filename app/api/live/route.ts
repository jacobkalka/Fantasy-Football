import type { NextRequest } from "next/server";
import {
  getByeWeeks,
  getGameDetail,
  getPlayerOutlooks,
  getPlayers,
  getScoreboard,
  getTeams,
} from "@/lib/data/sports";
import { buildTeamLive, findGame, teamIdOf, type RosterInput } from "@/lib/live/team";
import type { GameDetail } from "@/lib/providers/types";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";

const MAX_PLAYERS = 20;

/**
 * GET /api/live?ids=4432577,3139477&format=ppr[&week=6]
 * Live points, game status and the play-by-play feed for a roster. Every ESPN call
 * underneath is a shared cache, so this stays cheap no matter how many people poll it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ids = [...new Set((params.get("ids") ?? "").split(",").map((s) => s.trim()))]
    .filter((id) => /^-?\d{1,12}$/.test(id))
    .slice(0, MAX_PLAYERS);
  const formatParam = params.get("format") as ScoringFormat;
  const format: ScoringFormat = SCORING_FORMATS.includes(formatParam) ? formatParam : "ppr";
  const week = Number(params.get("week")) || undefined;

  try {
    const current = await getScoreboard();
    const board = week && week !== current.week ? await getScoreboard(week, current.season) : current;
    const [players, teams, byeWeeks] = await Promise.all([
      getPlayers(board.season),
      getTeams(),
      getByeWeeks(board.season).catch(() => ({})),
    ]);
    const byId = new Map(players.map((p) => [p.id, p]));
    const roster: RosterInput[] = ids
      .map((id) => byId.get(id))
      .filter((p) => p !== undefined)
      .map((p) => ({ playerId: p.id, name: p.name, position: p.position, teamId: p.teamId }));

    // Fetch each started game once, even if several roster players are in it.
    const gameIds = new Set<string>();
    for (const player of roster) {
      const game = findGame(board.games, teamIdOf(player));
      if (game && game.state !== "pre") gameIds.add(game.id);
    }
    const details: Record<string, GameDetail> = {};
    let missing = 0;
    await Promise.all(
      [...gameIds].map(async (id) => {
        try {
          details[id] = await getGameDetail(id);
        } catch (error) {
          missing += 1;
          console.error("game detail failed", id, error);
        }
      }),
    );
    const outlooks = await getPlayerOutlooks([...ids].sort(), board.season, board.week).catch(() => []);
    const fetchedTimes = Object.values(details)
      .map((d) => (d as GameDetail & { fetchedAt?: string }).fetchedAt)
      .filter((t): t is string => Boolean(t));
    const fetchedAt = [board.fetchedAt, ...fetchedTimes].sort()[0];

    const live = buildTeamLive({ roster, format, scoreboard: board, details, outlooks, byeWeeks, teams, fetchedAt });
    return Response.json({ ...live, currentWeek: current.week, partial: missing > 0 });
  } catch (error) {
    console.error("live failed", error);
    return Response.json({ error: "ESPN isn't responding right now." }, { status: 502 });
  }
}
