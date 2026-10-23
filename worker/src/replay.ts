/**
 * Replay mode: plays a FINISHED game back into the database as if it were live,
 * so the app can be tested on days with no games.
 *
 *   npm run replay -- 401872996 --speed 60
 *
 * It fetches the game's real plays once, then writes them in the order and
 * rhythm they really happened (each play has a real-world time), sped up
 * `speed` times: at 60×, one real minute of football takes one second.
 *
 * Everything it writes is marked: the game id becomes "replay-401872996" and
 * each play id gets the same "replay-" prefix, so replays never mix with real
 * data. `npm run clean-replays` deletes them all.
 */
import type { AttributedPlay, DataProvider, Game, GameDetail } from "@/lib/providers/types";
import type { Db } from "./db";
import { log as defaultLog, type Logger } from "./log";
import { buildGameRows, REPLAY_PREFIX } from "./rows";
import { deleteReplays, writeGameRows } from "./store";

export interface TimedPlay {
  play: AttributedPlay;
  /** When it happened, in ms after the first play. */
  atMs: number;
}

/**
 * Each play's real-world time, relative to the first. A play without a time
 * (the coin toss has none) takes the previous play's; times never go backwards.
 */
export function replayTimeline(plays: readonly AttributedPlay[]): TimedPlay[] {
  const sorted = [...plays].sort((a, b) => a.sequence - b.sequence);
  const times = sorted.map((p) => (p.wallclock ? Date.parse(p.wallclock) : NaN)).filter(Number.isFinite);
  const start = times.length > 0 ? Math.min(...times) : 0;
  let previous = 0;
  return sorted.map((play) => {
    const at = play.wallclock ? Date.parse(play.wallclock) - start : NaN;
    previous = Number.isFinite(at) ? Math.max(previous, at) : previous;
    return { play, atMs: previous };
  });
}

/** How many plays have happened `gameMs` into the replay. */
export function playsUntil(timeline: readonly TimedPlay[], gameMs: number): number {
  let count = 0;
  while (count < timeline.length && timeline[count].atMs <= gameMs) count++;
  return count;
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/** "4:12 - 3rd · Replay", like ESPN's live status line. */
export function replayStatusText(period: number, clock: string): string {
  const quarter = period > 4 ? "OT" : ORDINAL[period] ?? `${period}th`;
  return `${clock} - ${quarter} · Replay`;
}

/** The game as it stood after `shown` plays (or the final result once `done`). */
export function replayGameState(real: Game, shown: readonly AttributedPlay[], startedAt: string, done: boolean): Game {
  const last = shown.at(-1);
  const base = { ...real, kickoff: startedAt };
  if (done) {
    return {
      ...base,
      state: "post",
      completed: true,
      period: real.period || last?.period || 4,
      clock: real.clock || "0:00",
      statusText: `${real.statusText || "Final"} · Replay`,
      situation: undefined,
    };
  }
  const period = last?.period || 1;
  const clock = last?.clock || "15:00";
  return {
    ...base,
    state: "in",
    completed: false,
    period,
    clock,
    statusText: replayStatusText(period, clock),
    home: { ...real.home, score: last?.homeScore ?? 0, linescores: [] },
    away: { ...real.away, score: last?.awayScore ?? 0, linescores: [] },
    situation: { possessionTeamId: last?.teamId, isRedZone: false, lastPlayText: last?.text },
  };
}

export interface ReplayOptions {
  provider: Pick<DataProvider, "getGameDetail">;
  db: Db;
  espnGameId: string;
  /** 60 = one real minute per second. */
  speed: number;
  /** How often to write, in real ms. */
  stepMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Return true to stop early (Ctrl+C). */
  shouldStop?: () => boolean;
  log?: Logger;
}

export interface ReplayResult {
  dbGameId: string;
  plays: number;
  writes: number;
  stopped: boolean;
}

/** The replay itself. Resolves when the game is over (or stopped). */
export async function runReplay(options: ReplayOptions): Promise<ReplayResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? defaultLog;
  const stepMs = options.stepMs ?? 1000;

  const detail = await options.provider.getGameDetail(options.espnGameId);
  if (detail.game.state !== "post") {
    throw new Error(`Game ${options.espnGameId} isn't finished yet ("${detail.game.statusText}"). Only finished games can be replayed.`);
  }
  if (detail.plays.length === 0) throw new Error(`ESPN has no plays for game ${options.espnGameId}.`);

  const dbGameId = REPLAY_PREFIX + options.espnGameId;
  const removed = await deleteReplays(options.db, options.espnGameId);
  if (removed > 0) log(`replay ${options.espnGameId}: removed the previous replay`);

  const timeline = replayTimeline(detail.plays);
  const lengthMin = Math.round((timeline.at(-1)?.atMs ?? 0) / 60_000);
  const title = `${detail.game.away.team.abbr}@${detail.game.home.team.abbr}`;
  log(
    `replay ${title} (${options.espnGameId}) as ${dbGameId}: ${timeline.length} plays over ${lengthMin} min of real time, ` +
      `at ${options.speed}× ≈ ${Math.max(1, Math.round((lengthMin * 60) / options.speed))} s`,
  );

  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  let shown = -1;
  let writes = 0;
  let stopped = false;

  /** Writes the game as it stands after `count` plays. */
  const write = async (count: number, mode: "live" | "final" | "stopped") => {
    const plays = timeline.slice(0, count).map((t) => t.play);
    let game = replayGameState(detail.game, plays, startedAt, mode === "final");
    if (mode === "stopped") {
      // Leave the game looking finished rather than stuck "live" forever.
      game = { ...game, state: "post", statusText: "Replay stopped", situation: undefined };
    }
    const replayDetail: GameDetail = {
      ...detail,
      game,
      plays,
      // The official box score would give the final totals away, so until the end
      // each player's line is added up from the plays shown so far.
      boxscore: mode === "final" ? detail.boxscore : {},
    };
    const rows = buildGameRows(replayDetail, { idPrefix: REPLAY_PREFIX });
    await options.db.transaction((tx) => writeGameRows(tx, rows));
    writes++;
    const status = mode === "final" ? "FINAL" : mode === "stopped" ? "STOPPED" : game.statusText.replace(" · Replay", "");
    log(
      `replay ${title} ${status} ${game.away.team.abbr} ${game.away.score}-${game.home.score} ${game.home.team.abbr} · ` +
        `${count}/${timeline.length} plays (+${count - Math.max(0, shown)})`,
    );
    shown = count;
  };

  for (;;) {
    if (options.shouldStop?.()) {
      stopped = true;
      await write(Math.max(0, shown), "stopped");
      break;
    }
    const count = playsUntil(timeline, (now() - startedAtMs) * options.speed);
    const done = count >= timeline.length;
    if (count !== shown || done) await write(count, done ? "final" : "live");
    if (done) break;
    await sleep(stepMs);
  }
  return { dbGameId, plays: Math.max(0, shown), writes, stopped };
}
