/**
 * Encrypts ESPN login cookies (espn_s2, SWID) before they're stored, and decrypts
 * them only on the server when we call ESPN for a private league.
 *
 * AES-256-GCM: the stored value can't be read without the key, and any tampering
 * is detected. The key lives only in the server's environment
 * (ESPN_COOKIE_ENCRYPTION_KEY, 32 random bytes as base64: `openssl rand -base64 32`).
 * Never import this file from browser code.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export class SecretBoxError extends Error {}

function keyFrom(base64: string | undefined): Buffer {
  if (!base64) throw new SecretBoxError("ESPN_COOKIE_ENCRYPTION_KEY is not set");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new SecretBoxError("ESPN_COOKIE_ENCRYPTION_KEY must be 32 bytes (base64)");
  return key;
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function seal(plaintext: string, keyBase64 = process.env.ESPN_COOKIE_ENCRYPTION_KEY): string {
  const key = keyFrom(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function open(sealed: string, keyBase64 = process.env.ESPN_COOKIE_ENCRYPTION_KEY): string {
  const key = keyFrom(keyBase64);
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new SecretBoxError("Not a sealed value");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or a modified value. Never echo the value itself in errors or logs.
    throw new SecretBoxError("Couldn't decrypt (wrong key or tampered value)");
  }
}

/** Basic shape checks so obvious copy-paste mistakes get a friendly message before we store anything. */
export function validateEspnCookies(espnS2: string, swid: string): string | null {
  const s2 = espnS2.trim();
  const id = swid.trim();
  if (s2.length < 50 || /\s/.test(s2)) return "espn_s2 looks too short. Copy the whole value (it's a long string).";
  if (!/^\{?[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}?$/i.test(id)) {
    return "SWID should look like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}, including the curly braces.";
  }
  return null;
}
