/**
 * A throwaway local PostgreSQL 16 for the worker's database tests: the same idea
 * as scripts/test-db.sh. It creates an empty database in a temporary folder,
 * applies supabase/tests/local_stub.sql (a stand-in for Supabase) and every real
 * migration, and deletes it all afterwards. Never touches a real Supabase project.
 *
 * Tests skip themselves when PostgreSQL or the worker's packages aren't installed.
 */
import { execFileSync } from "node:child_process";
import { chownSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function findPgBin(): string | null {
  const candidates = [
    process.env.PG_BIN,
    "/usr/lib/postgresql/16/bin",
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/local/opt/postgresql@16/bin",
  ];
  try {
    for (const version of readdirSync("/usr/lib/postgresql")) candidates.push(`/usr/lib/postgresql/${version}/bin`);
  } catch {
    // not a Debian-style install
  }
  return candidates.find((dir) => dir && existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) ?? null;
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

/** Why the database tests can't run here, or null if they can. */
export function whyNoPostgres(): string | null {
  if (!findPgBin()) return "PostgreSQL server programs (initdb, pg_ctl) not found; set PG_BIN";
  try {
    createRequire(import.meta.url).resolve("postgres");
  } catch {
    return 'the worker\'s packages aren\'t installed (run "npm install" in worker/)';
  }
  if (isRoot) {
    try {
      execFileSync("id", ["-u", "postgres"], { stdio: "ignore" });
    } catch {
      return "running as root without a 'postgres' system user to start the database";
    }
  }
  return null;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export interface LocalPostgres {
  url: string;
  /** Runs a .sql file with psql (stops at the first error). */
  runFile(path: string): void;
  stop(): void;
}

export async function startLocalPostgres(): Promise<LocalPostgres> {
  const bin = findPgBin();
  if (!bin) throw new Error("PostgreSQL not found");
  // PostgreSQL refuses to run as root, so as root it runs as the "postgres" user.
  const asDbUser = (cmd: string, args: string[]) =>
    isRoot ? execFileSync("runuser", ["-u", "postgres", "--", cmd, ...args], { stdio: "pipe" }) : execFileSync(cmd, args, { stdio: "pipe" });

  const work = mkdtempSync(join(isRoot ? "/tmp" : tmpdir(), "feed-worker-db-"));
  if (isRoot) chownSync(work, Number(execFileSync("id", ["-u", "postgres"]).toString().trim()), -1);
  const data = join(work, "data");
  const port = await freePort();
  let started = false;

  const stop = () => {
    if (started) {
      try {
        asDbUser(join(bin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]);
      } catch {
        // already stopped
      }
      started = false;
    }
    rmSync(work, { recursive: true, force: true });
  };

  try {
    asDbUser(join(bin, "initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C", "--no-sync"]);
    asDbUser(join(bin, "pg_ctl"), [
      "-D", data, "-l", join(work, "postgres.log"), "-w", "-t", "60",
      "-o", `-p ${port} -c listen_addresses=127.0.0.1 -k '' -c fsync=off -c full_page_writes=off -c synchronous_commit=off`,
      "start",
    ]);
    started = true;

    const psql = existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql";
    const runFile = (path: string) => {
      execFileSync(
        psql,
        ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "--single-transaction", "-f", path],
        { stdio: "pipe", env: { ...process.env, PGCLIENTENCODING: "UTF8" } },
      );
    };
    runFile(join(ROOT, "supabase/tests/local_stub.sql"));
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const file of migrations) runFile(join(ROOT, "supabase/migrations", file));

    return { url: `postgresql://postgres@127.0.0.1:${port}/postgres`, runFile, stop };
  } catch (error) {
    stop();
    const stderr = (error as { stderr?: Buffer }).stderr?.toString();
    throw new Error(`Couldn't start the local test database: ${stderr || String(error)}`);
  }
}
