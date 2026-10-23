import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth-errors";
import { safeNextPath } from "./redirect";
import { normalizeUsername, usernameProblem } from "./username";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/chat")).toBe("/chat");
    expect(safeNextPath("/chat/game-401?x=1#end")).toBe("/chat/game-401?x=1#end");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "javascript:alert(1)", "/\nx"]) {
      expect(safeNextPath(bad)).toBe("/account");
    }
    expect(safeNextPath(null, "/")).toBe("/");
  });

  it("never sends people back into the sign-in pages", () => {
    expect(safeNextPath("/auth/sign-in")).toBe("/account");
  });
});

describe("usernames", () => {
  it("normalizes what people type", () => {
    expect(normalizeUsername("  Jo_Smith ")).toBe("jo_smith");
  });

  it("matches the database rule (3-24 of a-z, 0-9, _)", () => {
    expect(usernameProblem("jo_smith")).toBeNull();
    expect(usernameProblem("ABC")).toBeNull(); // lowercased before saving
    expect(usernameProblem("ab")).toMatch(/at least 3/);
    expect(usernameProblem("a".repeat(25))).toMatch(/at most 24/);
    expect(usernameProblem("jo smith")).toMatch(/only letters/);
    expect(usernameProblem("jo.smith")).toMatch(/only letters/);
    expect(usernameProblem("josé")).toMatch(/only letters/);
  });
});

describe("friendlyAuthError", () => {
  it("explains the common failures", () => {
    expect(friendlyAuthError({ code: "over_email_send_rate_limit", status: 429 })).toMatch(/Wait a minute/);
    expect(friendlyAuthError({ code: "otp_expired" })).toMatch(/expired/);
    expect(friendlyAuthError({ message: "Token has expired or is invalid", status: 403 })).toMatch(/wrong or has expired/);
    expect(friendlyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toMatch(/offline/);
    expect(friendlyAuthError({ code: "bad_code_verifier" })).toMatch(/different browser/);
    expect(friendlyAuthError({ status: 429 })).toMatch(/Too many/);
    expect(friendlyAuthError({ message: "?" })).toMatch(/Something went wrong/);
    expect(friendlyAuthError(null)).toMatch(/Something went wrong/);
  });
});
