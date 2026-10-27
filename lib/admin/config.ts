import "server-only";

/**
 * Admin Mode's server settings, read only on the server (never NEXT_PUBLIC_):
 *   ADMIN_ACCESS_CODE_HASH  scrypt hash of the code (recommended; `node scripts/admin-code-hash.mjs`)
 *   ADMIN_ACCESS_CODE       or the code itself, as a hosting secret
 *   ADMIN_SESSION_SECRET    signs the Admin Mode cookie (32+ random characters)
 * Plus the database's secret key. Anything missing or malformed: Admin Mode is unavailable.
 * There is no built-in or fallback code.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { codeCheckFrom } from "./code";
import { SESSION_MS, type AdminConfig, type AdminStore } from "./service";
import { supabaseAdminStore } from "./store";

export function adminSetup(): { config: AdminConfig; store: AdminStore } | null {
  const check = codeCheckFrom({ hash: process.env.ADMIN_ACCESS_CODE_HASH, code: process.env.ADMIN_ACCESS_CODE });
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  const db = supabaseAdmin();
  if (!check || secret.length < 32 || !db) return null;
  return { config: { check, secret, sessionMs: SESSION_MS }, store: supabaseAdminStore(db) };
}
