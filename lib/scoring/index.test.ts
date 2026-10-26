// End-to-end example of how the pieces fit together, using the public "@/lib/scoring" import.
import { describe, expect, it } from "vitest";
import {
  diffStatLines,
  formatBreakdown,
  formatPoints,
  reconcile,
  rulesForFormat,
  scoreAllFormats,
  scoreDelta,
} from "@/lib/scoring";

describe("a 74-yard receiving TD, from stat change to play feed", () => {
  const before = { targets: 4, rec: 3, recYds: 26 };
  const after = { targets: 5, rec: 4, recYds: 100, recTd: 1 };

  it("works out what changed, what it's worth, and how to show it", () => {
    const delta = diffStatLines(before, after);
    expect(delta).toEqual({ targets: 1, rec: 1, recYds: 74, recTd: 1 });

    // PPR: 74 × 0.1 + 6 + 1 = 7.4 + 6 + 1 = 14.4
    const play = scoreDelta(delta, rulesForFormat("ppr"));
    expect(formatPoints(play.points)).toBe("+14.40");
    expect(formatBreakdown(play.parts)).toBe("+7.4 yds, +6 TD, +1 reception");

    // Standard: 7.4 + 6 = 13.4, half: 13.4 + 0.5 = 13.9, ppr: 13.4 + 1 = 14.4
    expect(scoreAllFormats(delta)).toEqual({ standard: 13.4, half: 13.9, ppr: 14.4 });
  });

  it("checks the game total against the official number", () => {
    // Game total in PPR: 100 × 0.1 + 6 + 4 × 1 = 10 + 6 + 4 = 20
    const computed = scoreAllFormats(after).ppr;
    expect(computed).toBe(20);
    expect(reconcile(computed, 20)).toEqual({ ok: true, drift: 0, headline: 20 });
  });
});
