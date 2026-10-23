import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupabaseConfigured, looksLikeSecretKey, readSupabaseEnv } from "./config";

function jwt(payload: object) {
  const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
}

describe("readSupabaseEnv", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is null when either value is missing or blank", () => {
    expect(readSupabaseEnv({})).toBeNull();
    expect(readSupabaseEnv({ url: "https://abc.supabase.co" })).toBeNull();
    expect(readSupabaseEnv({ key: "sb_publishable_123" })).toBeNull();
    expect(readSupabaseEnv({ url: "  ", key: "  " })).toBeNull();
  });

  it("accepts a project URL and publishable key", () => {
    expect(readSupabaseEnv({ url: " https://abc.supabase.co/ ", key: " sb_publishable_123 " })).toEqual({
      url: "https://abc.supabase.co",
      publishableKey: "sb_publishable_123",
    });
  });

  it("accepts an old-style anon key", () => {
    const anon = jwt({ role: "anon" });
    expect(readSupabaseEnv({ url: "https://abc.supabase.co", key: anon })?.publishableKey).toBe(anon);
  });

  it("rejects URLs that aren't https (except localhost)", () => {
    expect(readSupabaseEnv({ url: "not a url", key: "k" })).toBeNull();
    expect(readSupabaseEnv({ url: "http://abc.supabase.co", key: "k" })).toBeNull();
    expect(readSupabaseEnv({ url: "http://localhost:54321", key: "k" })?.url).toBe("http://localhost:54321");
  });

  it("refuses a secret key pasted into the public setting", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readSupabaseEnv({ url: "https://abc.supabase.co", key: "sb_secret_abc" })).toBeNull();
    expect(readSupabaseEnv({ url: "https://abc.supabase.co", key: jwt({ role: "service_role" }) })).toBeNull();
  });
});

describe("looksLikeSecretKey", () => {
  it("spots secret and service_role keys only", () => {
    expect(looksLikeSecretKey("sb_secret_x")).toBe(true);
    expect(looksLikeSecretKey(jwt({ role: "service_role" }))).toBe(true);
    expect(looksLikeSecretKey(jwt({ role: "anon" }))).toBe(false);
    expect(looksLikeSecretKey("sb_publishable_x")).toBe(false);
    expect(looksLikeSecretKey("a.b.c")).toBe(false);
  });
});

describe("isSupabaseConfigured", () => {
  it("is false in tests and builds without the settings", () => {
    // The test runner has no Supabase settings, just like a fresh deploy.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) expect(isSupabaseConfigured()).toBe(false);
  });
});
