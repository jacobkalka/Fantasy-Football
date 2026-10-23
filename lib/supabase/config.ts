/**
 * Is the database (Supabase) connected?
 *
 * Accounts, roster saving and chat only switch on when both public Supabase
 * settings are filled in (see .env.example and docs/SETUP.md, part 4). Until
 * then the rest of the app keeps working on this device, and the sign-in and
 * chat screens explain what's missing.
 *
 * Only the two NEXT_PUBLIC_ values are read here. They are safe in a browser.
 * SUPABASE_SECRET_KEY is never read by this file (or any browser code).
 */

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

/** The setup guide section that explains how to connect the database. */
export const SUPABASE_SETUP_URL =
  "https://github.com/jacobkalka/Fantasy-Football/blob/claude/epic-lamport-wvbbwz/docs/SETUP.md#4-create-the-database-supabase";

/**
 * True when a key must never be used in a browser: a new-style secret key
 * ("sb_secret_…") or an old-style "service_role" key. If one of these lands in
 * the NEXT_PUBLIC_ setting by mistake, we refuse to use it.
 */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const json = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return json.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * The Supabase settings, or null if they're missing or unusable.
 * `env` is only passed by tests; the app reads the real settings.
 */
export function readSupabaseEnv(
  env: { url?: string; key?: string } = {
    // Written out in full so Next.js can copy the values into the browser code at build time.
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
): SupabaseEnv | null {
  const url = env.url?.trim();
  const key = env.key?.trim();
  if (!url || !key) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) return null;
  if (looksLikeSecretKey(key)) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a SECRET key. Use the publishable key there, and rotate the secret key in Supabase.",
    );
    return null;
  }
  return { url: parsed.origin, publishableKey: key };
}

/** The one check every screen uses: are accounts and chat available at all? */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}
