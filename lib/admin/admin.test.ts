import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { codeCheckFrom, hashCode, parseHash, verifyCode } from "./code";
import { combinedLockout, lockoutFor, SHORT_LIMIT, SHORT_WINDOW_MS } from "./lockout";
import { attemptAdmin, signCookie, verifyAdminCookie, type AdminConfig, type AdminStore, type AttemptOutcome, type StoredSession } from "./service";

// Codes here are random on every run: no real administrator code is ever in the tests.
const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const otherCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");
const SECRET = "test-secret-that-is-at-least-32-characters";

function memoryStore() {
  const attempts: { userId: string; ipHash: string; outcome: AttemptOutcome; at: number }[] = [];
  const sessions = new Map<string, StoredSession>();
  let clock = Date.now();
  const store: AdminStore = {
    async failures(since, { userId, ipHash }) {
      const wrong = attempts.filter((a) => a.outcome === "failure" && a.at >= since);
      return { byUser: wrong.filter((a) => a.userId === userId).map((a) => a.at), byAddress: wrong.filter((a) => a.ipHash === ipHash).map((a) => a.at) };
    },
    async record(a) {
      attempts.push({ ...a, at: clock });
    },
    async createSession(s) {
      sessions.set(s.id, { userId: s.userId, tokenHash: s.tokenHash, expiresAt: s.expiresAt, revokedAt: null });
    },
    async findSession(id) {
      return sessions.get(id) ?? null;
    },
    async revokeSession(id) {
      const s = sessions.get(id);
      if (s) s.revokedAt = clock;
    },
  };
  return { store, attempts, sessions, tick: (ms: number) => (clock += ms), now: () => clock };
}

describe("the administrator code check", () => {
  it("accepts only the configured code, from a hash or a plain server secret", async () => {
    const code = randomCode();
    const hash = await hashCode(code);
    expect(hash).not.toContain(code);
    expect(parseHash(hash)).not.toBeNull();
    const fromHash = codeCheckFrom({ hash })!;
    expect(await verifyCode(code, fromHash, SECRET)).toBe(true);
    expect(await verifyCode(otherCode(code), fromHash, SECRET)).toBe(false);
    expect(await verifyCode("", fromHash, SECRET)).toBe(false);
    const fromPlain = codeCheckFrom({ code })!;
    expect(await verifyCode(` ${code} `, fromPlain, SECRET)).toBe(true);
    expect(await verifyCode(otherCode(code), fromPlain, SECRET)).toBe(false);
  });

  it("fails securely when the setting is missing or malformed (no fallback code)", () => {
    expect(codeCheckFrom({})).toBeNull();
    expect(codeCheckFrom({ hash: "sha1:abc" })).toBeNull();
    expect(codeCheckFrom({ code: "123" })).toBeNull();
  });
});

describe("brute-force protection", () => {
  it("locks after 5 wrong codes in 15 minutes, and after 20 in a day", () => {
    const now = Date.now();
    const four = [1, 2, 3, 4].map((m) => now - m * 60_000);
    expect(lockoutFor(four, now).locked).toBe(false);
    const five = [...four, now - 30_000];
    const locked = lockoutFor(five, now);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfter).toBeGreaterThan(SHORT_WINDOW_MS / 1000 - 60);
    expect(lockoutFor(five, now + SHORT_WINDOW_MS + 1000).locked).toBe(false);
    const spread = Array.from({ length: 20 }, (_, i) => now - i * 50 * 60_000);
    expect(lockoutFor(spread, now).locked).toBe(true);
    expect(combinedLockout([], five, now).locked).toBe(true);
  });

  it("stops checking codes once locked, even the right one, and logs every try", async () => {
    const code = randomCode();
    const config: AdminConfig = { check: codeCheckFrom({ hash: await hashCode(code) })!, secret: SECRET, sessionMs: 3600_000 };
    const mem = memoryStore();
    for (let i = 0; i < SHORT_LIMIT; i++) {
      const r = await attemptAdmin({ code: otherCode(code), userId: "u1", ipHash: "ip1", store: mem.store, config, now: mem.now() });
      expect(r).toEqual({ ok: false, reason: "incorrect" });
      mem.tick(1000);
    }
    const locked = await attemptAdmin({ code, userId: "u1", ipHash: "ip1", store: mem.store, config, now: mem.now() });
    expect(locked.ok).toBe(false);
    expect(locked.ok === false && locked.reason).toBe("locked");
    // Another account from the same address is locked too.
    const sameAddress = await attemptAdmin({ code, userId: "u2", ipHash: "ip1", store: mem.store, config, now: mem.now() });
    expect(sameAddress.ok === false && sameAddress.reason).toBe("locked");
    expect(mem.attempts.map((a) => a.outcome)).toEqual(["failure", "failure", "failure", "failure", "failure", "locked", "locked"]);
    expect(JSON.stringify(mem.attempts)).not.toContain(code);
  });
});

describe("admin sessions", () => {
  async function signedIn() {
    const code = randomCode();
    const config: AdminConfig = { check: codeCheckFrom({ code })!, secret: SECRET, sessionMs: 3600_000 };
    const mem = memoryStore();
    const result = await attemptAdmin({ code, userId: "u1", ipHash: "ip", store: mem.store, config, now: mem.now() });
    if (!result.ok) throw new Error("expected success");
    return { mem, cookie: result.cookie, config };
  }

  it("is valid only for the account it was made for, and only on the server's say-so", async () => {
    const { mem, cookie } = await signedIn();
    const check = (c: string | undefined, userId = "u1", now = mem.now()) => verifyAdminCookie({ cookie: c, userId, store: mem.store, secret: SECRET, now });
    expect((await check(cookie)).active).toBe(true);
    expect((await check(cookie, "u2")).active).toBe(false);
    expect((await check(undefined)).active).toBe(false);
    expect((await check(cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).active).toBe(false);
    // A forged cookie with a later expiry fails its signature.
    const [v, id, token, , sig] = cookie.split(".");
    expect((await check([v, id, token, String(mem.now() + 9e9), sig].join("."))).active).toBe(false);
    // A cookie signed with another secret fails.
    expect((await check(signCookie("another-secret-another-secret-123", { id, token, userId: "u1", expiresAt: mem.now() + 1000 }))).active).toBe(false);
    // Expired.
    expect((await check(cookie, "u1", mem.now() + 3600_000 + 1)).active).toBe(false);
  });

  it("stops working the moment it's disabled", async () => {
    const { mem, cookie } = await signedIn();
    const [, id] = cookie.split(".");
    await mem.store.revokeSession(id);
    expect((await verifyAdminCookie({ cookie, userId: "u1", store: mem.store, secret: SECRET, now: mem.now() })).active).toBe(false);
  });
});
