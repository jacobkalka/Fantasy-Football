/**
 * When to ask ESPN for what (plan §4.4). Pure functions: no fetching, no clock
 * reading, so every rule is tested in test/schedule.test.ts.
 *
 *   Nothing on        → scoreboard every 5 minutes
 *   Kickoff ≤ 30 min  → scoreboard every 30 seconds
 *   Any game live     → scoreboard every ~8 seconds, plus play-by-play every ~8 seconds
 *                       for live games that have a tracked player (or every live
 *                       game if POLL_ALL_LIVE_GAMES is on, or if nobody tracks anyone)
 *
 * Plus: errors back off exponentially, every wait gets ±10% jitter, and a
 * sliding 60-second budget caps ESPN requests no matter what.
 */
import type { WorkerConfig } from "./config";

export type Phase = "live" | "soon" | "idle";

/** The bits of a game the schedule needs. */
export interface ScheduleGame {
  id: string;
  state: "pre" | "in" | "post";
  /** ISO time. */
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
}

/** A game whose kickoff passed this long ago but still says "pre" is treated as postponed. */
const LATE_START_LIMIT_MS = 6 * 60 * 60_000;

/** Which polling speed the current games call for. */
export function phaseFor(games: readonly ScheduleGame[], now: number, kickoffWindowMs: number): Phase {
  if (games.some((g) => g.state === "in")) return "live";
  const soon = games.some((g) => {
    if (g.state !== "pre") return false;
    const untilKickoff = Date.parse(g.kickoff) - now;
    // Also covers a kickoff that is a little late: ESPN still says "pre" for a few minutes.
    return untilKickoff <= kickoffWindowMs && untilKickoff > -LATE_START_LIMIT_MS;
  });
  return soon ? "soon" : "idle";
}

export function baseInterval(phase: Phase, config: Pick<WorkerConfig, "liveIntervalMs" | "soonIntervalMs" | "idleIntervalMs">): number {
  if (phase === "live") return config.liveIntervalMs;
  if (phase === "soon") return config.soonIntervalMs;
  return config.idleIntervalMs;
}

/** ±10% so the worker never settles into lockstep with anything else. */
export function withJitter(ms: number, random: () => number): number {
  return Math.round(ms * (0.9 + 0.2 * random()));
}

/**
 * Wait before the next attempt after `failures` errors in a row: live interval × 2^failures
 * (8 s, 16 s, 32 s, ...), never less than the normal interval and never more than maxBackoffMs.
 */
export function backoffMs(failures: number, normalMs: number, config: Pick<WorkerConfig, "liveIntervalMs" | "maxBackoffMs">): number {
  if (failures <= 0) return normalMs;
  const exponential = config.liveIntervalMs * 2 ** Math.min(failures, 20);
  return Math.min(config.maxBackoffMs, Math.max(normalMs, exponential));
}

/** Delay until the next tick, with backoff and jitter. */
export function nextDelayMs(
  phase: Phase,
  failures: number,
  config: Pick<WorkerConfig, "liveIntervalMs" | "soonIntervalMs" | "idleIntervalMs" | "maxBackoffMs">,
  random: () => number,
): number {
  return withJitter(backoffMs(failures, baseInterval(phase, config), config), random);
}

/** ESPN requests one game's play-by-play costs (summary + plays list). */
export const DETAIL_COST = 2;

/** At most this many finished games are caught up per tick, so live games keep their pace. */
export const MAX_CATCH_UPS_PER_TICK = 4;

export interface DetailChoiceInput {
  games: readonly ScheduleGame[];
  /** Teams of players on anyone's roster. Empty = nobody tracks anyone. */
  trackedTeamIds: ReadonlySet<string>;
  pollAllLiveGames: boolean;
  /** Finished games already written with their final play-by-play. */
  finalized: ReadonlySet<string>;
  /** Last successful play-by-play fetch per game (ms). Never fetched = first in line. */
  lastFetchedAt: ReadonlyMap<string, number>;
  /** Games that failed recently are skipped until this time (ms). */
  retryAfter: ReadonlyMap<string, number>;
  /** ESPN requests still allowed in this minute. */
  budget: number;
  now: number;
}

export interface DetailChoice {
  /** Game ids to fetch play-by-play for, this tick. */
  gameIds: string[];
  /** Live games that want play-by-play (some may have to wait for budget). */
  wanted: number;
  /** Their ids. */
  liveIds: string[];
  /** True when nobody tracks a player, so every game counts. */
  fallbackToAll: boolean;
}

/**
 * Which games get a play-by-play fetch this tick.
 *
 * 1. Live games that matter (a tracked player's team is playing, or every live game
 *    when POLL_ALL_LIVE_GAMES is on or nobody tracks anyone), least recently fetched first,
 *    so if the budget is tight every game still gets its turn.
 * 2. Then finished games that matter but haven't been written as final yet (the last
 *    plays and official box score; also catches up after a restart), newest first.
 */
export function chooseDetailGames(input: DetailChoiceInput): DetailChoice {
  const fallbackToAll = input.trackedTeamIds.size === 0;
  const matters = (g: ScheduleGame) =>
    input.pollAllLiveGames ||
    fallbackToAll ||
    input.trackedTeamIds.has(g.homeTeamId) ||
    input.trackedTeamIds.has(g.awayTeamId);
  const waiting = (g: ScheduleGame) => (input.retryAfter.get(g.id) ?? 0) > input.now;

  const live = input.games.filter((g) => g.state === "in" && matters(g));
  const liveReady = live
    .filter((g) => !waiting(g))
    .sort((a, b) => (input.lastFetchedAt.get(a.id) ?? 0) - (input.lastFetchedAt.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  const catchUp = input.games
    .filter((g) => g.state === "post" && !input.finalized.has(g.id) && matters(g) && !waiting(g))
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff) || a.id.localeCompare(b.id))
    .slice(0, MAX_CATCH_UPS_PER_TICK);

  let budget = input.budget;
  const gameIds: string[] = [];
  for (const game of [...liveReady, ...catchUp]) {
    if (budget < DETAIL_COST) break;
    gameIds.push(game.id);
    budget -= DETAIL_COST;
  }
  return { gameIds, wanted: live.length, liveIds: live.map((g) => g.id), fallbackToAll };
}

/**
 * A hard cap on requests in any rolling 60-second window. The worker asks
 * `remaining()` before fetching and calls `spend()` for each request it starts.
 * (The ESPN provider retries a failed request once internally, so in the worst
 * case the real count can be a little higher; keep the cap comfortably below
 * anything ESPN might mind.)
 */
export class RequestBudget {
  private readonly times: number[] = [];

  constructor(
    readonly perMinute: number,
    private readonly windowMs = 60_000,
  ) {}

  private prune(now: number) {
    while (this.times.length > 0 && this.times[0] <= now - this.windowMs) this.times.shift();
  }

  remaining(now: number): number {
    this.prune(now);
    return Math.max(0, this.perMinute - this.times.length);
  }

  /** Records `count` requests. Returns false (and records nothing) if that would break the cap. */
  spend(count: number, now: number): boolean {
    if (this.remaining(now) < count) return false;
    for (let i = 0; i < count; i++) this.times.push(now);
    return true;
  }

  /** How long until at least `count` requests are allowed again (0 = now). */
  waitFor(count: number, now: number): number {
    this.prune(now);
    const over = this.times.length + count - this.perMinute;
    if (over <= 0) return 0;
    return Math.max(0, this.times[over - 1] + this.windowMs - now);
  }

  used(now: number): number {
    this.prune(now);
    return this.times.length;
  }
}
