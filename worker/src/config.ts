/**
 * The worker's settings, read from environment variables (Railway → Variables,
 * or your terminal when running locally). Only DATABASE_URL is required.
 */

export interface WorkerConfig {
  /** Postgres connection string (Supabase → Connect → Session pooler). Never logged. */
  databaseUrl: string;
  /** Port for the /health page. Railway sets PORT itself. */
  port: number;
  /** How often to poll while a game is live (plan §4.4: about every 8 seconds). */
  liveIntervalMs: number;
  /** How often to poll in the half hour before a kickoff. */
  soonIntervalMs: number;
  /** How often to poll when nothing is happening. */
  idleIntervalMs: number;
  /** "Kickoff is soon" means within this long. */
  kickoffWindowMs: number;
  /** Hard cap on ESPN requests in any 60-second window. */
  maxRequestsPerMinute: number;
  /** true = fetch play-by-play for every live game, not just games with a tracked player. */
  pollAllLiveGames: boolean;
  /** How often to check tracked players' injury status in ESPN's fantasy feed. */
  injuryIntervalMs: number;
  /** How often to refresh the team list and player list. */
  referenceIntervalMs: number;
  /** How long to remember which players are on someone's roster before asking the database again. */
  trackedCacheMs: number;
  /** Longest wait between attempts after errors. */
  maxBackoffMs: number;
}

export const DEFAULTS: Omit<WorkerConfig, "databaseUrl"> = {
  port: 8080,
  liveIntervalMs: 8_000,
  soonIntervalMs: 30_000,
  idleIntervalMs: 5 * 60_000,
  kickoffWindowMs: 30 * 60_000,
  maxRequestsPerMinute: 120,
  pollAllLiveGames: false,
  injuryIntervalMs: 10 * 60_000,
  referenceIntervalMs: 6 * 60 * 60_000,
  trackedCacheMs: 60_000,
  maxBackoffMs: 5 * 60_000,
};

/** Every environment variable the worker reads (for the README and .env.example). */
export const ENV_VARS = [
  "DATABASE_URL",
  "PORT",
  "POLL_ALL_LIVE_GAMES",
  "ESPN_MAX_REQUESTS_PER_MINUTE",
  "LIVE_POLL_SECONDS",
] as const;

export class ConfigError extends Error {}

/** Environment variables by name (process.env, or a plain object in tests). */
export type Env = Readonly<Record<string, string | undefined>>;

function readNumber(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be a number from ${min} to ${max} (got "${raw}").`);
  }
  return value;
}

function readBoolean(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new ConfigError(`${name} must be true or false (got "${raw}").`);
}

/**
 * Reads the settings. `requireDatabase: false` lets commands that don't touch
 * the database (none today, but handy in tests) run without DATABASE_URL.
 */
export function readConfig(env: Env = process.env, { requireDatabase = true } = {}): WorkerConfig {
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (requireDatabase && !databaseUrl) {
    throw new ConfigError(
      "DATABASE_URL is not set. Copy the Session pooler connection string from Supabase " +
        "(Connect → Connection string) and set it as DATABASE_URL. See worker/README.md.",
    );
  }
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    // Don't echo the value: it contains the database password.
    throw new ConfigError("DATABASE_URL must start with postgresql:// (check you copied the whole string).");
  }
  return {
    ...DEFAULTS,
    databaseUrl,
    port: readNumber(env, "PORT", DEFAULTS.port, 1, 65535),
    liveIntervalMs: readNumber(env, "LIVE_POLL_SECONDS", DEFAULTS.liveIntervalMs / 1000, 5, 120) * 1000,
    maxRequestsPerMinute: readNumber(env, "ESPN_MAX_REQUESTS_PER_MINUTE", DEFAULTS.maxRequestsPerMinute, 10, 1000),
    pollAllLiveGames: readBoolean(env, "POLL_ALL_LIVE_GAMES", DEFAULTS.pollAllLiveGames),
  };
}
