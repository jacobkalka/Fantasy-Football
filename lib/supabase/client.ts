/**
 * The browser's connection to Supabase (sign-in, the database, live chat).
 *
 * Loaded on demand: when the database isn't connected, the Supabase code is
 * never even downloaded. Every caller gets the same single connection.
 * Uses only the publishable key; row-level security in the database decides
 * what each signed-in person may read or change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./config";

let pending: Promise<SupabaseClient | null> | null = null;

/** The Supabase client, or null when the database isn't set up (or on the server). */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const env = readSupabaseEnv();
  if (!env) return Promise.resolve(null);
  pending ??= import("@supabase/ssr")
    .then(({ createBrowserClient }) => createBrowserClient(env.url, env.publishableKey))
    .catch((error: unknown) => {
      // A failed download (flaky connection): try again next time.
      pending = null;
      throw error;
    });
  return pending;
}

/** Like loadSupabase, but throws a friendly error instead of returning null. */
export async function requireSupabase(): Promise<SupabaseClient> {
  const supabase = await loadSupabase();
  if (!supabase) throw new Error("Accounts aren't switched on yet.");
  return supabase;
}
