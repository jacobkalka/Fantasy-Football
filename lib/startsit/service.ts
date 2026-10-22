/**
 * Builds a Start/Sit answer for the API route: gathers this week's data from the
 * shared caches, then hands it to the pure model. Each piece that fails is left
 * out (and the confidence drops) instead of failing the whole answer.
 */
import {
  getByeWeeks,
  getDefenseVsPosition,
  getPlayerOutlooks,
  getPlayers,
  getScoreboard,
  getTeams,
} from "@/lib/data/sports";
import type { ScoringFormat } from "@/lib/scoring";
import { aiConfigured, aiSummary } from "./ai";
import { assemblePlayerFactors, isOffense, throughWeekFor } from "./factors";
import { decide } from "./model";
import type { StartSitResult } from "./types";

/** A problem with what was asked for (unknown player, kicker…), not with ESPN. */
export class StartSitInputError extends Error {}

function logged<T>(label: string, fallback: T) {
  return (error: unknown) => {
    console.error(`startsit: ${label} unavailable`, error);
    return fallback;
  };
}

export async function buildStartSit(
  ids: string[],
  format: ScoringFormat,
  { explain = false }: { explain?: boolean } = {},
): Promise<StartSitResult> {
  const board = await getScoreboard();
  const { season, week } = board;
  const [players, teams, outlooks, byeWeeks, defense] = await Promise.all([
    getPlayers(season),
    getTeams().catch(logged("teams", [])),
    getPlayerOutlooks([...ids].sort(), season, week).catch(logged("projections", null)),
    getByeWeeks(season).catch(logged("bye weeks", null)),
    getDefenseVsPosition(season, throughWeekFor(board.seasonType, week)).catch(logged("defense vs position", null)),
  ]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const chosen = ids.map((id) => {
    const player = byId.get(id);
    if (!player) throw new StartSitInputError("One of those players couldn't be found.");
    if (!isOffense(player.position)) {
      throw new StartSitInputError("Start/Sit compares QBs, RBs, WRs and TEs for now (not kickers or defenses).");
    }
    return player;
  });

  const factors = assemblePlayerFactors({ format, week, players: chosen, outlooks, scoreboard: board, byeWeeks, defense, teams });
  const { players: verdicts, recommendation, noRecommendation } = decide(factors, format);
  const result: StartSitResult = {
    season,
    week,
    format,
    players: verdicts,
    recommendation,
    noRecommendation,
    aiAvailable: aiConfigured(),
    generatedAt: new Date().toISOString(),
  };
  if (explain) result.aiSummary = await aiSummary(result);
  return result;
}
