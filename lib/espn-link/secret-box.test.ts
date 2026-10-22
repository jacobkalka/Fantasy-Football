import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, seal, SecretBoxError, validateEspnCookies } from "./secret-box";

const key = randomBytes(32).toString("base64");
const otherKey = randomBytes(32).toString("base64");

describe("secret box", () => {
  it("round-trips a value and never stores it in the clear", () => {
    const cookie = "AEB" + "x".repeat(200);
    const sealed = seal(cookie, key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(cookie);
    expect(open(sealed, key)).toBe(cookie);
  });

  it("uses a fresh random IV every time", () => {
    expect(seal("same", key)).not.toBe(seal("same", key));
  });

  it("refuses the wrong key and tampered values", () => {
    const sealed = seal("secret", key);
    expect(() => open(sealed, otherKey)).toThrow(SecretBoxError);
    const parts = sealed.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 1;
    const tampered = [parts[0], parts[1], parts[2], flipped.toString("base64url")].join(".");
    expect(() => open(tampered, key)).toThrow(SecretBoxError);
    expect(() => open("garbage", key)).toThrow(SecretBoxError);
  });

  it("explains a missing or wrong-size key", () => {
    expect(() => seal("x", undefined)).toThrow(/not set/);
    expect(() => seal("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("validateEspnCookies", () => {
  const s2 = "AEBx".repeat(40);
  it("accepts well-formed cookies, with or without braces on SWID", () => {
    expect(validateEspnCookies(s2, "{0A1B2C3D-4E5F-6789-ABCD-EF0123456789}")).toBeNull();
    expect(validateEspnCookies(s2, "0a1b2c3d-4e5f-6789-abcd-ef0123456789")).toBeNull();
  });
  it("catches common copy-paste mistakes", () => {
    expect(validateEspnCookies("short", "{0A1B2C3D-4E5F-6789-ABCD-EF0123456789}")).toMatch(/too short/);
    expect(validateEspnCookies(s2, "not-a-swid")).toMatch(/curly braces/);
  });
});
