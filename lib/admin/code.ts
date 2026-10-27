/**
 * The administrator code check (DECISIONS.md, "Admin Mode").
 *
 * The code itself never appears in the app or the repository. The server holds, in a hosting
 * secret, either a scrypt hash of it (ADMIN_ACCESS_CODE_HASH, recommended; make one with
 * `node scripts/admin-code-hash.mjs`) or the code (ADMIN_ACCESS_CODE). Either way the check
 * takes the same time whatever is typed, and nothing about the code is ever sent anywhere.
 */
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const HASH_PREFIX = "scrypt";
const DEFAULTS = { N: 16384, r: 8, p: 1, keyLength: 32 };
const MAX_MEMORY = 64 * 1024 * 1024;

function scrypt(input: string, salt: Buffer, N: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(input, salt, keyLength, { N, r, p, maxmem: MAX_MEMORY }, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

/** "scrypt:16384:8:1:<salt>:<hash>" (base64url). Used by the setup script, never at request time. */
export async function hashCode(code: string, salt: Buffer = randomBytes(16)): Promise<string> {
  const { N, r, p, keyLength } = DEFAULTS;
  const key = await scrypt(code, salt, N, r, p, keyLength);
  return [HASH_PREFIX, N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

export function parseHash(stored: string): ParsedHash | null {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64url");
  const key = Buffer.from(parts[5], "base64url");
  const powerOfTwo = Number.isInteger(N) && N >= 1024 && N <= 1 << 20 && (N & (N - 1)) === 0;
  if (!powerOfTwo || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 4) return null;
  if (salt.length < 16 || key.length < 16) return null;
  return { N, r, p, salt, key };
}

/** What the server compares a typed code against. */
export type CodeCheck = { kind: "hash"; hash: ParsedHash } | { kind: "plain"; code: string };

export function codeCheckFrom(env: { hash?: string; code?: string }): CodeCheck | null {
  if (env.hash?.trim()) {
    const hash = parseHash(env.hash);
    return hash ? { kind: "hash", hash } : null;
  }
  const code = env.code?.trim();
  return code && code.length >= 6 ? { kind: "plain", code } : null;
}

/**
 * Does `typed` match? Constant time: the same work and a fixed-length comparison whether the
 * guess is right, wrong, empty or malformed, so timing reveals nothing.
 */
export async function verifyCode(typed: string, check: CodeCheck, pepper: string): Promise<boolean> {
  const guess = typeof typed === "string" ? typed.trim().slice(0, 64) : "";
  if (check.kind === "hash") {
    const { N, r, p, salt, key } = check.hash;
    const derived = await scrypt(guess, salt, N, r, p, key.length);
    return timingSafeEqual(derived, key);
  }
  // Compare HMACs, not the strings, so the comparison is fixed-length and constant-time.
  const mac = (value: string) => createHmac("sha256", pepper).update(value).digest();
  return timingSafeEqual(mac(guess), mac(check.code));
}
