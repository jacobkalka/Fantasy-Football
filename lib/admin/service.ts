/**
 * Admin Mode on the server: checking a code (with brute-force protection) and the admin session
 * that follows. Storage is behind AdminStore so the rules are tested without a database; the real
 * store (lib/admin/store.ts) uses two server-only tables no browser can read or write.
 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { verifyCode, type CodeCheck } from "./code";
import { combinedLockout, LONG_WINDOW_MS } from "./lockout";

export type AttemptOutcome = "success" | "failure" | "locked";

export interface StoredSession {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  revokedAt: number | null;
}

export interface AdminStore {
  /** Times (ms) of wrong codes since `since`, for this account and for this address. */
  failures(since: number, who: { userId: string; ipHash: string }): Promise<{ byUser: number[]; byAddress: number[] }>;
  record(attempt: { userId: string; ipHash: string; outcome: AttemptOutcome }): Promise<void>;
  createSession(session: { id: string; userId: string; tokenHash: string; expiresAt: number }): Promise<void>;
  findSession(id: string): Promise<StoredSession | null>;
  revokeSession(id: string): Promise<void>;
}

export interface AdminConfig {
  check: CodeCheck;
  /** Signs session cookies and hashes addresses. Server-only, at least 32 characters. */
  secret: string;
  /** How long Admin Mode stays on after the code is accepted. */
  sessionMs: number;
}

export const SESSION_MS = 8 * 3600_000;
export const COOKIE_NAME = "fl_admin";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const mac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The visitor's network address, hashed with the server secret (raw addresses are never stored). */
export function addressHash(secret: string, address: string): string {
  return mac(secret, `addr:${address.trim().toLowerCase() || "unknown"}`);
}

export type AttemptResult =
  | { ok: true; cookie: string; expiresAt: number }
  | { ok: false; reason: "incorrect" }
  | { ok: false; reason: "locked"; retryAfter: number };

/**
 * One try at the code. Locked out (too many wrong codes for this account or address) means the
 * code isn't even checked. Whatever happens is logged; the code typed is never stored or logged.
 */
export async function attemptAdmin({
  code,
  userId,
  ipHash,
  store,
  config,
  now = Date.now(),
}: {
  code: unknown;
  userId: string;
  ipHash: string;
  store: AdminStore;
  config: AdminConfig;
  now?: number;
}): Promise<AttemptResult> {
  const recent = await store.failures(now - LONG_WINDOW_MS, { userId, ipHash });
  const lockout = combinedLockout(recent.byUser, recent.byAddress, now);
  if (lockout.locked) {
    await store.record({ userId, ipHash, outcome: "locked" });
    return { ok: false, reason: "locked", retryAfter: lockout.retryAfter };
  }
  const typed = typeof code === "string" ? code : "";
  const right = await verifyCode(typed, config.check, config.secret);
  if (!right) {
    await store.record({ userId, ipHash, outcome: "failure" });
    return { ok: false, reason: "incorrect" };
  }
  await store.record({ userId, ipHash, outcome: "success" });
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + config.sessionMs;
  await store.createSession({ id, userId, tokenHash: sha256(token), expiresAt });
  return { ok: true, cookie: signCookie(config.secret, { id, token, userId, expiresAt }), expiresAt };
}

/** "v1.<session id>.<token>.<expiry>.<signature>": the signature binds it to one account. */
export function signCookie(secret: string, s: { id: string; token: string; userId: string; expiresAt: number }): string {
  const body = `v1.${s.id}.${s.token}.${s.expiresAt}`;
  return `${body}.${mac(secret, `${body}.${s.userId}`)}`;
}

/**
 * Is this cookie a live Admin Mode session for this account? The signature must match, it must
 * not have expired, and the session must still exist (not revoked) on the server with the same
 * token and account. Editing the cookie, copying it to another account or reusing it after
 * "Disable" all fail.
 */
export async function verifyAdminCookie({
  cookie,
  userId,
  store,
  secret,
  now = Date.now(),
}: {
  cookie: string | undefined;
  userId: string;
  store: AdminStore;
  secret: string;
  now?: number;
}): Promise<{ active: true; sessionId: string; expiresAt: number } | { active: false }> {
  if (!cookie || cookie.length > 400) return { active: false };
  const parts = cookie.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return { active: false };
  const [, id, token, exp, signature] = parts;
  const body = `v1.${id}.${token}.${exp}`;
  if (!sameText(signature, mac(secret, `${body}.${userId}`))) return { active: false };
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return { active: false };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { active: false };
  const session = await store.findSession(id);
  if (!session || session.revokedAt !== null || session.expiresAt <= now || session.userId !== userId) return { active: false };
  if (!sameText(session.tokenHash, sha256(token))) return { active: false };
  return { active: true, sessionId: id, expiresAt: Math.min(expiresAt, session.expiresAt) };
}

/** The session id in a cookie, for "Disable Admin Mode" (only after verifyAdminCookie said yes). */
export function sessionIdOf(cookie: string): string | null {
  const id = cookie.split(".")[1];
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
