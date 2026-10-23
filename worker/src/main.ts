/**
 * The worker's front door. Commands:
 *
 *   npm start                                  run forever (what Railway runs)
 *   npm run once                               one tick, then exit (checks your setup)
 *   npm run replay -- 401872996 [--speed 60]   replay a finished game as if live
 *   npm run clean-replays [-- 401872996]       delete replay data (one game or all)
 *
 * See worker/README.md.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sports } from "@/lib/providers";
import { ConfigError, readConfig } from "./config";
import { connect, type Db } from "./db";
import { healthResponse, startHealthServer } from "./health";
import { describeError, log } from "./log";
import { runReplay } from "./replay";
import { deleteReplays } from "./store";
import { LiveWorker } from "./worker";

const USAGE = `Usage:
  npm start                                  run the live worker
  npm run once                               run one tick and exit
  npm run replay -- <espnGameId> [--speed 60]
  npm run clean-replays [-- <espnGameId>]`;

/** "--speed 60" or "--speed=60". */
function option(args: string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return args[i].includes("=") ? args[i].split("=")[1] : args[i + 1];
}

async function openDatabase(url: string): Promise<Db> {
  const db = connect(url);
  const [row] = await db.query<{ version: string }>("select current_setting('server_version') as version");
  log(`database connected (PostgreSQL ${row.version})`);
  return db;
}

/** Ctrl+C / Railway's stop signal → let the current step finish, then exit. */
function onStopSignal(handler: (signal: string) => Promise<void>) {
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      log(`${signal} received, shutting down`);
      // Never hang: Railway kills the process anyway after a short while.
      setTimeout(() => {
        log("shutdown took too long, exiting");
        process.exit(1);
      }, 15_000).unref();
      handler(signal).then(
        () => process.exit(0),
        (error) => {
          log(`shutdown error: ${describeError(error)}`);
          process.exit(1);
        },
      );
    });
  }
}

async function runLive(once: boolean) {
  const config = readConfig();
  const db = await openDatabase(config.databaseUrl);
  const worker = new LiveWorker({ provider: sports, db, config });
  log(
    `worker starting: live poll ${config.liveIntervalMs / 1000}s, ` +
      `ESPN cap ${config.maxRequestsPerMinute}/min, ` +
      `${config.pollAllLiveGames ? "all live games" : "games with tracked players"}`,
  );

  if (once) {
    const report = await worker.tick();
    await db.close();
    process.exit(report.error ? 1 : 0);
  }

  const server = startHealthServer(
    config.port,
    () => healthResponse(worker.health(), worker.currentIntervalMs(), Date.now()),
    (port) => log(`health check listening on port ${port} (/health)`),
  );
  onStopSignal(async () => {
    await worker.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
    log("stopped cleanly");
  });
  await worker.run();
}

async function replay(args: string[]) {
  const gameId = args[0];
  if (!gameId || !/^\d{6,12}$/.test(gameId)) throw new ConfigError(`Which game? Give an ESPN game id.\n${USAGE}`);
  const speed = Number(option(args, "speed") ?? 60);
  if (!Number.isFinite(speed) || speed < 1 || speed > 10_000) throw new ConfigError("--speed must be from 1 to 10000.");

  const config = readConfig();
  const db = await openDatabase(config.databaseUrl);
  let stop = false;
  let replaying: Promise<unknown> = Promise.resolve();
  onStopSignal(async () => {
    stop = true; // runReplay notices within a second and marks the game "Replay stopped"
    await replaying;
    await db.close();
  });
  const run = runReplay({ provider: sports, db, espnGameId: gameId, speed, shouldStop: () => stop });
  replaying = run.catch(() => {});
  const result = await run;
  log(`replay done: ${result.plays} plays written to game ${result.dbGameId} in ${result.writes} steps`);
  await db.close();
  process.exit(0);
}

async function cleanReplays(args: string[]) {
  const gameId = args[0];
  if (gameId && !/^\d{6,12}$/.test(gameId)) throw new ConfigError(`"${gameId}" isn't an ESPN game id.`);
  const config = readConfig();
  const db = await openDatabase(config.databaseUrl);
  const removed = await deleteReplays(db, gameId);
  log(`removed ${removed} replay game(s) and everything attached to them`);
  await db.close();
}

/**
 * On your computer, settings can live in the project's .env.local (the same file
 * the web app uses; never committed). Variables already set (e.g. on Railway) win.
 */
function loadLocalEnv() {
  const file = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  loadLocalEnv();
  const [command = "run", ...args] = process.argv.slice(2);
  switch (command) {
    case "run":
      return runLive(false);
    case "once":
      return runLive(true);
    case "replay":
      return replay(args);
    case "clean-replays":
      return cleanReplays(args);
    default:
      console.error(USAGE);
      process.exit(2);
  }
}

main().catch((error) => {
  log(error instanceof ConfigError ? error.message : `fatal: ${describeError(error)}`);
  process.exit(1);
});
