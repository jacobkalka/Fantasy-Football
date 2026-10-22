import { describe, expect, it } from "vitest";
import { parseStartSitQuery } from "./query";

const parse = (query: string) => parseStartSitQuery(new URLSearchParams(query));

describe("parseStartSitQuery", () => {
  it("reads ids, format and explain", () => {
    expect(parse("ids=4362628,4426515&format=half&explain=1")).toEqual({
      ok: true,
      ids: ["4362628", "4426515"],
      format: "half",
      explain: true,
    });
  });

  it("defaults to PPR, trims spaces and drops duplicates", () => {
    expect(parse("ids= 1 ,2,1")).toEqual({ ok: true, ids: ["1", "2"], format: "ppr", explain: false });
  });

  it("rejects bad input with a message a person can read", () => {
    expect(parse("ids=1")).toMatchObject({ ok: false, error: "Pick at least two different players to compare." });
    expect(parse("ids=1,1")).toMatchObject({ ok: false });
    expect(parse("")).toMatchObject({ ok: false });
    expect(parse("ids=1,2,3,4,5")).toMatchObject({ ok: false, error: "Compare at most 4 players at a time." });
    expect(parse("ids=1,abc")).toMatchObject({ ok: false });
    // D/ST ids are negative; they aren't supported yet.
    expect(parse("ids=1,-16012")).toMatchObject({ ok: false });
    expect(parse("ids=1,2&format=superflex")).toMatchObject({ ok: false, error: "Scoring format must be standard, half or ppr." });
  });
});
