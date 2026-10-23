/**
 * The live loop. Each "tick":
 *   1. fetch this week's scoreboard (1 ESPN request)
 *   2. now and then: refresh teams + players (every 6 h) and tracked players' injury status (every 10 min)
 *   3. pick the games that need play-by-play (schedule.ts) and fetch them
 *   4. write everything to the database: one transaction for the scoreboard,
 *      then one transaction per game
 *   5. log one summary line and wait until the next tick
 *
 * ESPN is only reached through the provider (lib/providers), and the database
 * only through store.ts, so tests swap in sample data and a local database.
 */
import { teamIdOf } from "@/lib/live/team";
import type { DataProvider, Game, GameDetail, Scoreboard } from "@/lib/providers/types";
import type { WorkerConfig } from "./config";
import type { Db } from "./db";
import { describeError, log as defaultLog, type Logger } from "./log";
import { buildGameRows, gameRow, playerRows, teamRow, teamRows, type NamedPlayer } from "./rows";
import {
  baseInterval,
  backoffMs,
  chooseDetailGames,
  DETAIL_COST,
  nextDelayMs,
  phaseFor,
  RequestBudget,
  type Phase,
  type ScheduleGame,
} from "./schedule";
import {
  applyInjuryStatuses,
  changedAnything,
  readTrackedPlayers,
  upsertGames,
  upsertPlayers,
  upsertTeams,
  writeGameRows,
  type GameWriteResult,
  type TrackedPlayer,
} from "./store";

/** The parts of the data provider (lib/providers) the worker uses. */
export type WorkerProvider = Pick<
  DataProvider,
  "getScoreboard" | "getGameDetail" | "getTeams" | "getPlayers" | "getPlayerOutlooks"
>;

export interface WorkerDeps {
  provider: WorkerProvider;
  db: Db;
  config: WorkerConfig;
  now?: () => number;
  random?: () => number;
  log?: Logger;
}

/** What one tick did (also used by the tests). */
export interface TickReport {
  phase: Phase;
  games: number;
  liveGames: number;
  /** Live games that want play-by-play / how many we fetched this tick. */
  detailsWanted: number;
  detailIds: string[];
  detailsFailed: string[];
  writes: Record<string, GameWriteResult>;
  statusChanges: number;
  requests: number;
  nextDelayMs: number;
  durationMs: number;
  /** Something worth knowing that isn't an error. */
  note?: string;
  error?: string;
}

/** What /health shows. */
export interface HealthSnapshot {
  startedAt: string;
  phase: Phase;
  lastTickAt: string | null;
  lastEspnFetchAt: string | null;
  lastWriteAt: string | null;
  /** Games whose play-by-play is being followed right now. */
  gamesTracked: string[];
  trackedPlayers: number;
  consecutiveFailures: number;
  lastError: string | null;
}

const INJURY_CHUNK = 50;
const REFERENCE_RETRY_MS = 30 * 60_000;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function scheduleGame(game: Game): ScheduleGame {
  return {
    id: game.id,
    state: game.state,
    kickoff: game.kickoff,
    homeTeamId: game.home.team.id,
    awayTeamId: game.away.team.id,
  };
}

/** "JAX@HOU" for the logs. */
function label(game: Game | undefined): string {
  return game ? `${game.away.team.abbr}@${game.home.team.abbr}` : "?";
}

function summarize(writes: Record<string, GameWriteResult>) {
  const total = { playsNew: 0, playsChanged: 0, playsDeleted: 0, points: 0, stats: 0, injuries: 0 };
  for (const w of Object.values(writes)) {
    total.playsNew += w.plays.inserted;
    total.playsChanged += w.plays.updated;
    total.playsDeleted += w.plays.deleted;
    total.points += w.points.inserted + w.points.updated + w.points.deleted;
    total.stats += w.stats.inserted + w.stats.updated + w.stats.deleted;
    total.injuries += w.injuries;
  }
  return total;
}

export class LiveWorker {
  private readonly provider: WorkerProvider;
  private readonly db: Db;
  private readonly config: WorkerConfig;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly log: Logger;
  private readonly budget: RequestBudget;

  private failures = 0;
  private phase: Phase = "idle";
  private requestsThisTick = 0;
  /** Finished games already written with their final play-by-play (kept in memory only). */
  readonly finalized = new Set<string>();
  private readonly lastFetchedAt = new Map<string, number>();
  private readonly retryAfter = new Map<string, number>();
  private readonly gameFailures = new Map<string, number>();
  private tracked: { at: number; players: TrackedPlayer[] } | null = null;
  private nextReferenceAt = 0;
  private nextInjuryAt = 0;

  private readonly startedAt: number;
  private lastTickAt: number | null = null;
  private lastEspnFetchAt: number | null = null;
  private lastWriteAt: number | null = null;
  private gamesTracked: string[] = [];
  private lastError: string | null = null;

  private stopping = false;
  private wake: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(deps: WorkerDeps) {
    this.provider = deps.provider;
    this.db = deps.db;
    this.config = deps.config;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.log = deps.log ?? defaultLog;
    this.budget = new RequestBudget(this.config.maxRequestsPerMinute);
    this.startedAt = this.now();
  }

  health(): HealthSnapshot {
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      phase: this.phase,
      lastTickAt: iso(this.lastTickAt),
      lastEspnFetchAt: iso(this.lastEspnFetchAt),
      lastWriteAt: iso(this.lastWriteAt),
      gamesTracked: this.gamesTracked,
      trackedPlayers: this.tracked?.players.length ?? 0,
      consecutiveFailures: this.failures,
      lastError: this.lastError,
    };
  }

  /** Normal wait for the current phase (used by /health to judge "stale"). */
  currentIntervalMs(): number {
    return baseInterval(this.phase, this.config);
  }

  /** Counts a request against the per-minute cap. False = over budget, don't fetch. */
  private spend(count: number): boolean {
    const ok = this.budget.spend(count, this.now());
    if (ok) this.requestsThisTick += count;
    return ok;
  }

  private async trackedPlayers(): Promise<TrackedPlayer[]> {
    const now = this.now();
    if (!this.tracked || now - this.tracked.at >= this.config.trackedCacheMs) {
      this.tracked = { at: now, players: await readTrackedPlayers(this.db) };
    }
    return this.tracked.players;
  }

  /** Teams and the player list: rarely change, so every few hours. Failures only delay them. */
  private async refreshReference(season: number): Promise<void> {
    if (this.now() < this.nextReferenceAt || !this.spend(2)) return;
    try {
      const [teams, players] = await Promise.all([this.provider.getTeams(), this.provider.getPlayers(season)]);
      this.lastEspnFetchAt = this.now();
      const rows = playerRows(players);
      const [teamCount, playerCount] = await this.db.transaction(async (tx) => [
        await upsertTeams(tx, teams.map(teamRow).filter((t) => t !== null)),
        await upsertPlayers(tx, rows),
      ]);
      this.lastWriteAt = this.now();
      this.tracked = null; // teams of tracked players may be known now
      this.nextReferenceAt = this.now() + this.config.referenceIntervalMs;
      this.log(
        `reference teams=${teams.length} (+${teamCount.inserted} ~${teamCount.updated}) ` +
          `players=${rows.length} (+${playerCount.inserted} ~${playerCount.updated})`,
      );
    } catch (error) {
      this.nextReferenceAt = this.now() + REFERENCE_RETRY_MS;
      this.log(`reference refresh failed (retry in 30 min): ${describeError(error)}`);
    }
  }

  /** ESPN fantasy injury status for tracked players; records changes as injury events. */
  private async refreshInjuryStatuses(tracked: TrackedPlayer[], board: Scoreboard): Promise<number> {
    const ids = tracked.map((p) => p.playerId).filter((id) => /^\d+$/.test(id)); // D/ST units have no injuries
    if (ids.length === 0 || this.now() < this.nextInjuryAt) return 0;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += INJURY_CHUNK) chunks.push(ids.slice(i, i + INJURY_CHUNK));
    if (this.budget.remaining(this.now()) < chunks.length + 1) return 0; // keep room for the scoreboard
    this.spend(chunks.length);
    try {
      const outlooks = (
        await Promise.all(chunks.map((chunk) => this.provider.getPlayerOutlooks(chunk, board.season, board.week)))
      ).flat();
      this.lastEspnFetchAt = this.now();
      const changes = await applyInjuryStatuses(
        this.db,
        outlooks.map((o) => ({ player_id: o.playerId, status: o.injuryStatus })),
      );
      this.lastWriteAt = this.now();
      this.nextInjuryAt = this.now() + this.config.injuryIntervalMs;
      for (const c of changes) this.log(`injury status ${c.player_id}: ${c.note} → ${c.status}`);
      return changes.length;
    } catch (error) {
      this.nextInjuryAt = this.now() + this.config.injuryIntervalMs;
      this.log(`injury status check failed: ${describeError(error)}`);
      return 0;
    }
  }

  private gameFailed(gameId: string) {
    const failures = (this.gameFailures.get(gameId) ?? 0) + 1;
    this.gameFailures.set(gameId, failures);
    this.retryAfter.set(gameId, this.now() + backoffMs(failures, this.config.liveIntervalMs, this.config));
  }

  /** One full pass. Never throws: problems are reported in `error` and slow the next tick down. */
  async tick(): Promise<TickReport> {
    const started = this.now();
    this.requestsThisTick = 0;
    const report: TickReport = {
      phase: this.phase,
      games: 0,
      liveGames: 0,
      detailsWanted: 0,
      detailIds: [],
      detailsFailed: [],
      writes: {},
      statusChanges: 0,
      requests: 0,
      nextDelayMs: 0,
      durationMs: 0,
    };

    try {
      if (!this.spend(1)) {
        // Over the per-minute cap: not an error, just wait until a request frees up.
        report.nextDelayMs = Math.max(1000, this.budget.waitFor(1, this.now()));
        report.note = "waiting for the request budget";
        return this.finish(report, started, true);
      }
      const board = await this.provider.getScoreboard();
      this.lastEspnFetchAt = this.now();
      report.games = board.games.length;
      report.liveGames = board.games.filter((g) => g.state === "in").length;

      await this.refreshReference(board.season); // first, so tracked players' teams are known
      const tracked = await this.trackedPlayers();
      report.statusChanges = await this.refreshInjuryStatuses(tracked, board);

      // What to fetch.
      const games = board.games.map(scheduleGame);
      const phase = phaseFor(games, this.now(), this.config.kickoffWindowMs);
      if (phase !== this.phase) this.log(`phase ${this.phase} → ${phase}`);
      this.phase = report.phase = phase;
      const trackedTeamIds = new Set(
        tracked
          .map((p) => p.teamId ?? teamIdOf({ playerId: p.playerId, teamId: null, name: "", position: "DST" }))
          .filter((id): id is string => Boolean(id)),
      );
      const choice = chooseDetailGames({
        games,
        // Empty = nobody tracks anyone (or no team is known yet): every game counts.
        trackedTeamIds,
        pollAllLiveGames: this.config.pollAllLiveGames,
        finalized: this.finalized,
        lastFetchedAt: this.lastFetchedAt,
        retryAfter: this.retryAfter,
        // Keep enough for the next minute of scoreboard checks, so they're never starved.
        budget: this.budget.remaining(this.now()) - Math.ceil(60_000 / this.config.liveIntervalMs),
        now: this.now(),
      });
      report.detailsWanted = choice.wanted;
      report.detailIds = choice.gameIds;
      this.spend(choice.gameIds.length * DETAIL_COST);

      // Fetch play-by-play for those games, all at once.
      const settled = await Promise.allSettled(choice.gameIds.map((id) => this.provider.getGameDetail(id)));
      const details = new Map<string, GameDetail>();
      settled.forEach((result, i) => {
        const id = choice.gameIds[i];
        if (result.status === "fulfilled") {
          details.set(id, result.value);
          this.lastEspnFetchAt = this.now();
        } else {
          report.detailsFailed.push(id);
          this.gameFailed(id);
          this.log(`play-by-play failed for ${id}: ${describeError(result.reason)}`);
        }
      });

      // Write the scoreboard (games we have no fresher detail for) in one transaction.
      await this.db.transaction(async (tx) => {
        await upsertTeams(tx, teamRows(board.games));
        await upsertGames(tx, board.games.filter((g) => !details.has(g.id)).map((g) => gameRow(g)));
      });
      this.lastWriteAt = this.now();

      // Then each game in its own transaction.
      const named: NamedPlayer[] = tracked
        .filter((p) => p.name)
        .map((p) => ({ playerId: p.playerId, name: p.name ?? "", teamId: p.teamId }));
      const byId = new Map(board.games.map((g) => [g.id, g]));
      for (const [id, detail] of details) {
        const rows = buildGameRows(detail, { scoreboardGame: byId.get(id), trackedPlayers: named });
        // The plays list failed but the summary worked: keep the stored stats (they include 2-pt tries).
        const playsMissing = detail.plays.length === 0 && rows.game.state !== "pre";
        if (playsMissing) rows.stats = [];
        try {
          const result = await this.db.transaction((tx) => writeGameRows(tx, rows));
          this.lastWriteAt = this.now();
          report.writes[id] = result;
          this.lastFetchedAt.set(id, this.now());
          this.gameFailures.delete(id);
          this.retryAfter.delete(id);
          if (rows.game.state === "post" && !playsMissing) this.finalized.add(id);
          if (!result.deletionsApplied) {
            this.log(`${label(byId.get(id))}: play list shrank suspiciously; not marking plays deleted this time`);
          }
        } catch (error) {
          report.detailsFailed.push(id);
          this.gameFailed(id);
          this.log(`writing ${label(byId.get(id))} (${id}) failed: ${describeError(error)}`);
        }
      }

      this.gamesTracked = choice.liveIds;
      this.lastError =
        report.detailsFailed.length > 0 ? `play-by-play failed for ${report.detailsFailed.join(", ")}` : null;
      report.nextDelayMs = nextDelayMs(this.phase, 0, this.config, this.random);
      return this.finish(report, started, true);
    } catch (error) {
      report.error = describeError(error);
      this.lastError = report.error;
      return this.finish(report, started, false);
    }
  }

  private finish(report: TickReport, started: number, ok: boolean): TickReport {
    if (ok) {
      this.failures = 0;
    } else {
      this.failures += 1;
      if (report.nextDelayMs === 0) report.nextDelayMs = nextDelayMs(this.phase, this.failures, this.config, this.random);
    }
    report.requests = this.requestsThisTick;
    report.durationMs = this.now() - started;
    this.lastTickAt = this.now();

    const t = summarize(report.writes);
    const changed = Object.values(report.writes).filter(changedAnything).length;
    this.log(
      [
        `tick ${report.phase}`,
        `games=${report.games}`,
        `live=${report.liveGames}`,
        `pbp=${report.detailIds.length - report.detailsFailed.length}/${report.detailIds.length}` +
          (report.detailsWanted > report.detailIds.length ? ` (want ${report.detailsWanted})` : ""),
        `plays=+${t.playsNew}/~${t.playsChanged}/-${t.playsDeleted}`,
        `points=${t.points}`,
        `stats=${t.stats}`,
        `injuries=+${t.injuries}`,
        report.statusChanges ? `status=+${report.statusChanges}` : "",
        `games_changed=${changed}`,
        `espn=${report.requests} (${this.budget.remaining(this.now())}/${this.config.maxRequestsPerMinute} left)`,
        `took=${report.durationMs}ms`,
        `next=${(report.nextDelayMs / 1000).toFixed(1)}s`,
        report.note ? `(${report.note})` : "",
        report.error ? `ERROR ${report.error}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    return report;
  }

  /** Ticks until stop() is called. */
  run(): Promise<void> {
    this.loop ??= (async () => {
      while (!this.stopping) {
        const report = await this.tick();
        if (this.stopping) break;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, report.nextDelayMs);
          this.wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        this.wake = null;
      }
    })();
    return this.loop;
  }

  /** Finishes the current tick (if any), then stops. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.wake?.();
    await this.loop;
  }
}
