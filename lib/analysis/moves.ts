/** Adding and removing players (trades, pickups), including who you'd drop to make room. */
import type { InjuryStatus, Position } from "@/lib/providers/types";
import { expectedPerGame } from "./metrics";
import { marketValueOf, type LeagueModel } from "./model";
import { teamCore, type TeamCore } from "./rating";
import { rosterSize } from "./settings";
import type { AnalysisPlayer } from "./universe";

/** A player as shown in an answer. */
export interface PlayerBrief {
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  injuryStatus: InjuryStatus;
  /** Expected points per remaining game (ESPN rest-of-season); null without a projection. */
  perGame: number | null;
  /** 0-100 trade value. */
  value: number;
}

export function brief(p: AnalysisPlayer, model: LeagueModel): PlayerBrief {
  const perGame = expectedPerGame(p);
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    teamId: p.teamId,
    headshot: p.headshot,
    injuryStatus: p.injuryStatus,
    perGame: perGame === null ? null : Math.round(perGame * 10) / 10,
    value: marketValueOf(model, p.id),
  };
}

export interface MoveResult {
  players: AnalysisPlayer[];
  core: TeamCore;
  /** Players dropped because the roster went over the limit. */
  dropped: AnalysisPlayer[];
  /** Roster spots this move opens up (when you get fewer players than you give). */
  openSpots: number;
}

/**
 * Applies a move. If the roster ends up over the limit (the league's roster size, or your current
 * size if that's already bigger), it drops the player whose loss hurts the team least, never one
 * of the players just added; ties go to the lower trade value.
 */
export function applyMove(
  current: readonly AnalysisPlayer[],
  add: readonly AnalysisPlayer[],
  remove: readonly AnalysisPlayer[],
  model: LeagueModel,
): MoveResult {
  const removeIds = new Set(remove.map((p) => p.id));
  const addIds = new Set(add.map((p) => p.id));
  let players = [...current.filter((p) => !removeIds.has(p.id)), ...add.filter((p) => !current.some((c) => c.id === p.id))];
  const limit = Math.max(rosterSize(model.settings), current.length);
  const dropped: AnalysisPlayer[] = [];
  while (players.length > limit) {
    let best: { player: AnalysisPlayer; core: TeamCore } | null = null;
    for (const candidate of players) {
      if (addIds.has(candidate.id)) continue;
      const core = teamCore(
        players.filter((p) => p.id !== candidate.id),
        model,
      );
      const better =
        !best ||
        core.overall > best.core.overall + 1e-9 ||
        (Math.abs(core.overall - best.core.overall) <= 1e-9 &&
          marketValueOf(model, candidate.id) < marketValueOf(model, best.player.id));
      if (better) best = { player: candidate, core };
    }
    if (!best) break;
    dropped.push(best.player);
    players = players.filter((p) => p.id !== best!.player.id);
  }
  return { players, core: teamCore(players, model), dropped, openSpots: Math.max(0, current.length - players.length) };
}
