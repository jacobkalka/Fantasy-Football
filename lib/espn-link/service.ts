import "server-only";

/**
 * Your ESPN login for private leagues (DECISIONS.md, "ESPN leagues"). The two cookies are
 * encrypted with AES-256-GCM (secret-box.ts) before they're stored, and only this server code
 * ever decrypts them, to call ESPN. They're never logged, never returned to a browser, and
 * "Disconnect ESPN" deletes them.
 */
import type { LeagueCredentials } from "@/lib/providers/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { open, seal, SecretBoxError } from "./secret-box";

export type ConnectionStatus = "active" | "expired" | "error";

export class EspnLinkUnavailableError extends Error {
  constructor() {
    super("Private leagues need the server's database key and encryption key (see docs/SETUP.md).");
  }
}

function admin() {
  const client = supabaseAdmin();
  if (!client || !process.env.ESPN_COOKIE_ENCRYPTION_KEY) throw new EspnLinkUnavailableError();
  return client;
}

/** True when private-league support is configured on this server. */
export function espnLinkAvailable(): boolean {
  return Boolean(supabaseAdmin() && process.env.ESPN_COOKIE_ENCRYPTION_KEY);
}

export async function saveCredentials(userId: string, credentials: LeagueCredentials) {
  const db = admin();
  const swid = credentials.swid.trim().replace(/^\{?/, "{").replace(/\}?$/, "}").toUpperCase();
  const { error } = await db.from("espn_connections").upsert({
    user_id: userId,
    encrypted_espn_s2: seal(credentials.espnS2.trim()),
    encrypted_swid: seal(swid),
    status: "active",
  });
  if (error) throw new Error("Couldn't save the ESPN connection");
}

/** The decrypted cookies, or null when this user hasn't connected ESPN. */
export async function readCredentials(userId: string): Promise<{ credentials: LeagueCredentials; status: ConnectionStatus } | null> {
  const db = admin();
  const { data, error } = await db
    .from("espn_connections")
    .select("encrypted_espn_s2, encrypted_swid, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Couldn't read the ESPN connection");
  if (!data) return null;
  try {
    return {
      credentials: { espnS2: open(data.encrypted_espn_s2 as string), swid: open(data.encrypted_swid as string) },
      status: (data.status as ConnectionStatus) ?? "active",
    };
  } catch (error) {
    if (error instanceof SecretBoxError) {
      // The key changed or the value was damaged: treat as needing a reconnect.
      await setStatus(userId, "error");
      return null;
    }
    throw error;
  }
}

export async function setStatus(userId: string, status: ConnectionStatus) {
  const db = admin();
  await db.from("espn_connections").update({ status }).eq("user_id", userId);
}

export async function deleteCredentials(userId: string) {
  const db = admin();
  const { error } = await db.from("espn_connections").delete().eq("user_id", userId);
  if (error) throw new Error("Couldn't delete the ESPN connection");
}
