import { describe, expect, it } from "vitest";
import type { StatLine } from "@/lib/stats";
import { addStatLines, diffStatLines, scoreDelta } from "./delta";
import { SCORING_PRESETS } from "./rules";
import { scoreStatLine } from "./score";

describe("diffStatLines", () => {
  it("returns only the stats that changed", () => {
    const before: StatLine = { rushAtt: 10, rushYds: 45, rec: 2, recYds: 18 };
    const after: StatLine = { rushAtt: 11, rushYds: 57, rushTd: 1, rec: 2, recYds: 18 };
    // rushAtt 11 − 10 = 1, rushYds 57 − 45 = 12, rushTd 1 − 0 = 1; rec and recYds didn't change.
    expect(diffStatLines(before, after)).toEqual({ rushAtt: 1, rushYds: 12, rushTd: 1 });
  });

  it("returns negative values when a stat goes down (stat corrections)", () => {
    // TD overturned: ruled down at the 1, so 1 yard and the TD come off.
    const before: StatLine = { rushYds: 50, rushTd: 1 };
    const after: StatLine = { rushYds: 49 };
    // rushYds 49 − 50 = −1, rushTd 0 − 1 = −1
    expect(diffStatLines(before, after)).toEqual({ rushYds: -1, rushTd: -1 });
  });

  it("returns an empty line when nothing changed (missing counts as zero)", () => {
    expect(diffStatLines({ recYds: 20 }, { recYds: 20 })).toEqual({});
    expect(diffStatLines({}, { passTd: 0 })).toEqual({});
  });
});

describe("scoreDelta", () => {
  it("scores one play", () => {
    // 12 rush yds × 0.1 = 1.2, 1 rush TD × 6 = 6 → 7.2 (the carry itself is worth 0)
    const result = scoreDelta({ rushAtt: 1, rushYds: 12, rushTd: 1 }, SCORING_PRESETS.ppr);
    expect(result.points).toBe(7.2);
    expect(result.parts).toEqual([
      { key: "rushYds", amount: 12, points: 1.2 },
      { key: "rushTd", amount: 1, points: 6 },
    ]);
  });

  it("gives negative points for a stat correction that takes points away", () => {
    // Catch overturned: 8 rec yds and 1 catch come off.
    const delta = diffStatLines({ rec: 6, recYds: 80 }, { rec: 5, recYds: 72 });
    expect(delta).toEqual({ rec: -1, recYds: -8 });
    // −8 rec yds × 0.1 = −0.8; −1 catch × 0 / 0.5 / 1
    expect(scoreDelta(delta, SCORING_PRESETS.standard).points).toBe(-0.8); // −0.8 + 0
    expect(scoreDelta(delta, SCORING_PRESETS.half).points).toBe(-1.3); // −0.8 − 0.5
    expect(scoreDelta(delta, SCORING_PRESETS.ppr).points).toBe(-1.8); // −0.8 − 1

    // TD overturned: −1 rush yd × 0.1 = −0.1, −1 rush TD × 6 = −6 → −6.1
    expect(scoreDelta({ rushYds: -1, rushTd: -1 }, SCORING_PRESETS.ppr).points).toBe(-6.1);
  });

  it("scores an empty change as 0", () => {
    expect(scoreDelta({}, SCORING_PRESETS.ppr)).toEqual({ points: 0, parts: [] });
  });
});

describe("addStatLines", () => {
  it("adds two lines key by key", () => {
    const a: StatLine = { rushAtt: 1, rushYds: 10 };
    const b: StatLine = { rushAtt: 1, rushYds: -2, fumLost: 1 };
    // rushAtt 1 + 1 = 2, rushYds 10 + (−2) = 8, fumLost 0 + 1 = 1
    expect(addStatLines(a, b)).toEqual({ rushAtt: 2, rushYds: 8, fumLost: 1 });
  });

  it("leaves out stats that add up to zero", () => {
    // A TD (1) plus a correction that removes it (−1) = 0, so the key disappears.
    expect(addStatLines({ rushTd: 1, rushYds: 3 }, { rushTd: -1 })).toEqual({ rushYds: 3 });
  });

  it("doesn't change the lines passed in", () => {
    const a: StatLine = { recYds: 10 };
    const b: StatLine = { recYds: 5 };
    addStatLines(a, b);
    expect(a).toEqual({ recYds: 10 });
    expect(b).toEqual({ recYds: 5 });
  });

  it("undoes diffStatLines: before + (after − before) = after", () => {
    const before: StatLine = { rec: 6, recYds: 80, recTd: 1 };
    const after: StatLine = { rec: 7, recYds: 74, targets: 9 };
    expect(addStatLines(before, diffStatLines(before, after))).toEqual(after);
  });

  it("rebuilds a game from its plays, and play points add up to the game total", () => {
    const plays: StatLine[] = [
      { rushAtt: 1, rushYds: 5 }, //                   PPR: 0.5
      { rushAtt: 1, rushYds: -2 }, //                  PPR: −0.2
      { targets: 1, rec: 1, recYds: 12 }, //           PPR: 1.2 + 1 = 2.2
      { rushAtt: 1, rushYds: 3, rushTd: 1 }, //        PPR: 0.3 + 6 = 6.3
    ];
    // Play points: 0.5 − 0.2 + 2.2 + 6.3 = 8.8
    const game = plays.reduce((sum, play) => addStatLines(sum, play), {});
    // rushAtt 3, rushYds 5 − 2 + 3 = 6, rushTd 1, targets 1, rec 1, recYds 12
    expect(game).toEqual({ rushAtt: 3, rushYds: 6, rushTd: 1, targets: 1, rec: 1, recYds: 12 });
    // Game: 6 × 0.1 + 6 + 12 × 0.1 + 1 = 0.6 + 6 + 1.2 + 1 = 8.8
    expect(scoreStatLine(game, SCORING_PRESETS.ppr).total).toBe(8.8);

    const playPoints = plays.map((play) => scoreDelta(play, SCORING_PRESETS.ppr).points);
    expect(playPoints).toEqual([0.5, -0.2, 2.2, 6.3]);
  });
});
