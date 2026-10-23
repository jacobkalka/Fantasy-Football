/**
 * Supabase for server code (the sign-in Route Handlers in app/auth).
 *
 * Reads and writes the sign-in cookies of the current request. Create a new
 * one per request; never share it. Uses the publishable key, so the database's
 * row-level security still applies (this is NOT the all-powerful secret key).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabaseEnv } from "./config";

/** A per-request server client, or null when the database isn't connected. */
export async function createSupabaseServerClient() {
  const env = readSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. Only Route Handlers use this
          // client today, and they can; the browser refreshes its own session.
        }
      },
    },
  });
}
