import "server-only";

/** Admin Mode storage: the two server-only tables (supabase/migrations/20261027000000_admin_mode.sql). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminStore } from "./service";

export function supabaseAdminStore(db: SupabaseClient): AdminStore {
  return {
    async failures(since, { userId, ipHash }) {
      const sinceIso = new Date(since).toISOString();
      const [byUser, byAddress] = await Promise.all([
        db.from("admin_attempts").select("created_at").eq("user_id", userId).eq("outcome", "failure").gte("created_at", sinceIso).limit(100),
        db.from("admin_attempts").select("created_at").eq("ip_hash", ipHash).eq("outcome", "failure").gte("created_at", sinceIso).limit(100),
      ]);
      if (byUser.error) throw byUser.error;
      if (byAddress.error) throw byAddress.error;
      const times = (rows: { created_at: string }[] | null) => (rows ?? []).map((r) => Date.parse(r.created_at));
      return { byUser: times(byUser.data), byAddress: times(byAddress.data) };
    },
    async record({ userId, ipHash, outcome }) {
      const { error } = await db.from("admin_attempts").insert({ user_id: userId, ip_hash: ipHash, outcome });
      if (error) throw error;
    },
    async createSession({ id, userId, tokenHash, expiresAt }) {
      const { error } = await db
        .from("admin_sessions")
        .insert({ id, user_id: userId, token_hash: tokenHash, expires_at: new Date(expiresAt).toISOString() });
      if (error) throw error;
    },
    async findSession(id) {
      const { data, error } = await db.from("admin_sessions").select("user_id, token_hash, expires_at, revoked_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        userId: data.user_id as string,
        tokenHash: data.token_hash as string,
        expiresAt: Date.parse(data.expires_at as string),
        revokedAt: data.revoked_at ? Date.parse(data.revoked_at as string) : null,
      };
    },
    async revokeSession(id) {
      const { error } = await db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
      if (error) throw error;
    },
  };
}
