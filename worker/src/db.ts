/**
 * The database connection, using the "postgres" package (postgres.js).
 *
 * Why it's loaded with require() and described by our own small types below:
 * the web app's type check and build look at every .ts file in the repository,
 * including this folder, but only install the app's packages, not the worker's.
 * Importing "postgres" normally would break the app's build on Vercel. These few
 * lines keep the worker fully separate.
 */
import { createRequire } from "node:module";

export type Row = Record<string, unknown>;

/** Anything you can run SQL on: the whole database or one transaction. */
export interface Queryable {
  /** Runs one SQL statement with $1, $2... placeholders and returns the rows. */
  query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Runs `work` in one transaction: all of it is saved, or none of it. */
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// The parts of postgres.js we use (see node_modules/postgres/types/index.d.ts).
interface PostgresSql {
  unsafe(text: string, params?: unknown[]): PromiseLike<Row[]>;
  begin<T>(work: (sql: PostgresSql) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
}
type PostgresFactory = (url: string, options: Record<string, unknown>) => PostgresSql;

function loadDriver(): PostgresFactory {
  const require = createRequire(import.meta.url);
  try {
    return require("postgres") as PostgresFactory;
  } catch {
    throw new Error('The "postgres" package is missing. Run "npm install" in the worker folder first.');
  }
}

/** Local databases don't use SSL; anything else (Supabase) does unless the URL says otherwise. */
export function sslSetting(databaseUrl: string): { ssl?: false | "require" } {
  const url = new URL(databaseUrl);
  if (url.searchParams.has("sslmode")) return {}; // the URL decides
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  // "require" = encrypted. Supabase signs its certificates with its own authority,
  // which Node doesn't know, so the certificate itself isn't checked.
  return { ssl: local ? false : "require" };
}

/** Wraps postgres.js in our Queryable shape. Values go as parameters, never pasted into SQL. */
function wrap(sql: PostgresSql): Queryable {
  return {
    async query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
      return (await sql.unsafe(text, [...params])) as T[];
    },
  };
}

export function connect(databaseUrl: string): Db {
  const postgres = loadDriver();
  const sql = postgres(databaseUrl, {
    max: 2, // one writer is plenty; a second for /health-style reads
    idle_timeout: 60, // seconds; frees the pooler connection between games
    connect_timeout: 15,
    prepare: false, // works with Supabase's session AND transaction poolers
    onnotice: () => {},
    connection: { application_name: "fantasylab-worker" },
    ...sslSetting(databaseUrl),
  });
  const db = wrap(sql);
  return {
    query: db.query,
    transaction<T>(work: (tx: Queryable) => Promise<T>) {
      return sql.begin(async (tx) => {
        // A stuck statement must not hold the game's rows locked forever.
        await tx.unsafe("set local statement_timeout = '20s'");
        return work(wrap(tx));
      });
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
