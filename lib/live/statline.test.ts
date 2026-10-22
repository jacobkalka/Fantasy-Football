import { describe, expect, it } from "vitest";
import { statLineSummary } from "./statline";

describe("statLineSummary", () => {
  it("summarizes a quarterback (C.J. Stroud, Week 6 box score)", () => {
    expect(statLineSummary({ passCmp: 24, passAtt: 34, passYds: 312, passTd: 3, passInt: 1, rushAtt: 1, rushYds: 5 }, "QB")).toBe(
      "24/34 · 312 yds · 3 TD · 1 INT · 1 car · 5 rush yds",
    );
  });

  it("summarizes a kicker", () => {
    expect(statLineSummary({ fgMade: 2, fgAtt: 2, fgMade40_49: 1, fgMade50_59: 1, xpMade: 4, xpAtt: 4 }, "K")).toBe(
      "2/2 FG · 1 from 50+ · 4/4 XP",
    );
  });

  it("summarizes a defense", () => {
    expect(statLineSummary({ dstPa: 6, dstYa: 245, dstSack: 3, dstInt: 2, dstIntTd: 1 }, "DST")).toBe(
      "6 pts allowed · 245 yds allowed · 3 sacks · 2 INT · 1 TD",
    );
  });
});
