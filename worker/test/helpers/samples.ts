/**
 * Test data: the real ESPN responses saved in samples/, read through the real
 * ESPN parsers, served by a fake provider. No network in tests.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseOutlooks, parsePlayersList } from "@/lib/providers/espn/fantasy";
import { parseScoreboard } from "@/lib/providers/espn/scoreboard";
import { parseBoxscore, parseCorePlays } from "@/lib/providers/espn/stats";
import { parseDrives, parseSummaryGame, parseTeamStats, parseWinProbability } from "@/lib/providers/espn/summary";
import { parseTeams } from "@/lib/providers/espn/teams";
import type { GameDetail, Player, PlayerOutlook, Scoreboard } from "@/lib/providers/types";
import type { WorkerProvider } from "../../src/worker";

const SAMPLES = fileURLToPath(new URL("../../../samples/", import.meta.url));

export function sample(name: string): unknown {
  return JSON.parse(readFileSync(`${SAMPLES}${name}`, "utf8"));
}

/** Raw core-plays response, so a test can edit a play's text and re-parse it. */
export function rawPlays(gameId: string): { items: Record<string, unknown>[] } {
  return sample(`core-plays-${gameId}.json`) as { items: Record<string, unknown>[] };
}

/** A game detail exactly as the provider builds it (see lib/providers/espn/index.ts). */
export function sampleDetail(gameId: string, plays: unknown = rawPlays(gameId)): GameDetail {
  const summary = sample(`summary-${gameId}-final.json`);
  return {
    game: parseSummaryGame(summary),
    drives: parseDrives(summary),
    plays: parseCorePlays(plays, gameId),
    boxscore: parseBoxscore(summary),
    teamStats: parseTeamStats(summary),
    winProbability: parseWinProbability(summary),
  };
}

/** Week 6, every game final. 401872996 = HOU@JAX, 401872999 = CHI@ATL. */
export function sampleBoard(): Scoreboard {
  return parseScoreboard(sample("scoreboard-week6-final.json"));
}

/** Week 7 before any game started (NE@CHI on Thursday night first). */
export function upcomingBoard(): Scoreboard {
  return parseScoreboard(sample("scoreboard.json"));
}

export const clone = <T>(value: T): T => structuredClone(value);

/** Serves sample data like the real provider would, and records every call. */
export class FakeProvider implements WorkerProvider {
  board: Scoreboard = sampleBoard();
  details = new Map<string, GameDetail>();
  players: Player[] = parsePlayersList(sample("fantasy-players-wl-trimmed.json"));
  outlooks: PlayerOutlook[] = parseOutlooks(sample("fantasy-kona-player-info.json"), 2026, 6);
  calls: string[] = [];
  failDetails = new Set<string>();

  async getScoreboard() {
    this.calls.push("scoreboard");
    return clone(this.board);
  }
  async getGameDetail(gameId: string) {
    this.calls.push(`detail:${gameId}`);
    const detail = this.details.get(gameId);
    if (!detail || this.failDetails.has(gameId)) throw new Error(`ESPN responded 503 for ${gameId}`);
    return clone(detail);
  }
  async getTeams() {
    this.calls.push("teams");
    return parseTeams(sample("teams.json"));
  }
  async getPlayers() {
    this.calls.push("players");
    return clone(this.players);
  }
  async getPlayerOutlooks(playerIds: string[]) {
    this.calls.push(`outlooks:${playerIds.length}`);
    return clone(this.outlooks.filter((o) => playerIds.includes(o.playerId)));
  }
}
