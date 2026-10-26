import "server-only";

/**
 * Supabase with the SECRET key, for the few server jobs row-level security can't express:
 * reading a user's encrypted ESPN cookies, the admin-code attempt log. Never import this from
 * browser code (the "server-only" line makes that a build error). Returns null when the
 * secret key isn't configured, and callers treat that as "feature unavailable".
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./config";

let client: SupabaseClient | null | undefined;

export function supabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client;
  const env = readSupabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  client =
    env && secret
      ? createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return client;
}
