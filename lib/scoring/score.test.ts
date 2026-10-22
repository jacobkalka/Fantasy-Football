import { describe, expect, it } from "vitest";
import { STAT_KEYS, type StatLine } from "@/lib/stats";
import { SCORING_FORMATS, SCORING_PRESETS, rulesForFormat, type ScoringRules } from "./rules";
import { SCORING_ORDER, roundPoints, scoreAllFormats, scoreStatLine } from "./score";

describe("roundPoints", () => {
  it("cleans up floating-point leftovers", () => {
    expect(0.1 * 3).not.toBe(0.3); // the problem is real: it's 0.30000000000000004
    expect(roundPoints(0.1 * 3)).toBe(0.3);
    expect(roundPoints(0.1 + 0.2)).toBe(0.3);
    expect(roundPoints(19.880000000000003)).toBe(19.88);
  });

  it("rounds halves away from zero, even when the stored number is slightly under", () => {
    // 1.005 is really stored as 1.00499999..., so plain Math.round(1.005 * 100) / 100 gives 1.
    expect(roundPoints(1.005)).toBe(1.01);
    // (2.675).toFixed(2) gives "2.67" for the same reason.
    expect(roundPoints(2.675)).toBe(2.68);
    expect(roundPoints(-1.005)).toBe(-1.01);
    expect(roundPoints(0.125)).toBe(0.13);
    expect(roundPoints(-0.125)).toBe(-0.13);
  });

  it("rounds to 2 decimals by default, or to the decimals asked for", () => {
    expect(roundPoints(11.4849)).toBe(11.48);
    expect(roundPoints(11.4851)).toBe(11.49);
    expect(roundPoints(9.45, 1)).toBe(9.5); // (9.45).toFixed(1) would give "9.4"
    expect(roundPoints(9.44, 1)).toBe(9.4);
    expect(roundPoints(-9.45, 1)).toBe(-9.5);
    expect(roundPoints(7)).toBe(7);
    expect(roundPoints(2.5, 0)).toBe(3);
  });

  it("never returns negative zero", () => {
    // toBe uses Object.is, which tells 0 and -0 apart.
    expect(roundPoints(-0)).toBe(0);
    expect(roundPoints(-0.001)).toBe(0);
  });
});

describe("scoreStatLine: QB", () => {
  // 287 pass yds × 0.04 = 11.48
  //   2 pass TD  × 4    =  8
  //   1 INT      × −2   = −2
  //  24 rush yds × 0.1  =  2.4
  // total = 11.48 + 8 − 2 + 2.4 = 19.88 (no catches, so every format agrees)
  const qbLine: StatLine = {
    passAtt: 34,
    passCmp: 23,
    passYds: 287,
    passTd: 2,
    passInt: 1,
    rushAtt: 4,
    rushYds: 24,
  };

  it.each(SCORING_FORMATS)("scores 19.88 in %s", (format) => {
    expect(scoreStatLine(qbLine, rulesForFormat(format)).total).toBe(19.88);
  });

  it("lists each scoring stat in display order, skipping ones worth 0", () => {
    // Attempts, completions and carries are worth 0, so they're left out.
    expect(scoreStatLine(qbLine, SCORING_PRESETS.standard).parts).toEqual([
      { key: "passYds", amount: 287, points: 11.48 },
      { key: "passTd", amount: 2, points: 8 },
      { key: "passInt", amount: 1, points: -2 },
      { key: "rushYds", amount: 24, points: 2.4 },
    ]);
  });
});

describe("scoreStatLine: RB and WR in all three formats", () => {
  // RB:  92 rush yds × 0.1 =  9.2
  //       1 rush TD  × 6   =  6
  //      31 rec yds  × 0.1 =  3.1
  //       1 fumble   × −2  = −2
  //      without catches: 9.2 + 6 + 3.1 − 2 = 16.3
  //      4 catches: standard +0 = 16.3, half +2 = 18.3, ppr +4 = 20.3
  const rbLine: StatLine = {
    rushAtt: 18,
    rushYds: 92,
    rushTd: 1,
    targets: 5,
    rec: 4,
    recYds: 31,
    fumLost: 1,
  };

  // WR: 103 rec yds  × 0.1 = 10.3
  //       2 rec TD   × 6   = 12
  //       1 2-pt     × 2   =  2
  //      −3 rush yds × 0.1 = −0.3 (lost yards on a jet sweep)
  //      without catches: 10.3 + 12 + 2 − 0.3 = 24
  //      7 catches: standard +0 = 24, half +3.5 = 27.5, ppr +7 = 31
  const wrLine: StatLine = {
    targets: 10,
    rec: 7,
    recYds: 103,
    recTd: 2,
    rec2pt: 1,
    rushAtt: 1,
    rushYds: -3,
  };

  it("scores the RB line", () => {
    expect(scoreStatLine(rbLine, SCORING_PRESETS.standard).total).toBe(16.3);
    expect(scoreStatLine(rbLine, SCORING_PRESETS.half).total).toBe(18.3);
    expect(scoreStatLine(rbLine, SCORING_PRESETS.ppr).total).toBe(20.3);
  });

  it("scores the WR line, including negative rushing yards", () => {
    expect(scoreStatLine(wrLine, SCORING_PRESETS.standard).total).toBe(24);
    expect(scoreStatLine(wrLine, SCORING_PRESETS.half).total).toBe(27.5);
    expect(scoreStatLine(wrLine, SCORING_PRESETS.ppr).total).toBe(31);
  });

  it("puts the reception part after receiving yards, TD and 2-pt", () => {
    expect(scoreStatLine(wrLine, SCORING_PRESETS.half).parts).toEqual([
      { key: "rushYds", amount: -3, points: -0.3 },
      { key: "recYds", amount: 103, points: 10.3 },
      { key: "recTd", amount: 2, points: 12 },
      { key: "rec2pt", amount: 1, points: 2 },
      { key: "rec", amount: 7, points: 3.5 }, // 7 × 0.5
    ]);
  });

  it("scoreAllFormats returns all three totals at once", () => {
    expect(scoreAllFormats(rbLine)).toEqual({ standard: 16.3, half: 18.3, ppr: 20.3 });
    expect(scoreAllFormats(wrLine)).toEqual({ standard: 24, half: 27.5, ppr: 31 });
  });
});

describe("scoreStatLine: fractional yardage and rounding", () => {
  it("gives clean numbers for fractional yardage", () => {
    // 3 rush yds × 0.1 = 0.3 (plain JavaScript says 0.30000000000000004)
    expect(scoreStatLine({ rushYds: 3 }, SCORING_PRESETS.standard)).toEqual({
      total: 0.3,
      parts: [{ key: "rushYds", amount: 3, points: 0.3 }],
    });
    // 1 rec yd × 0.1 + 2 rush yds × 0.1 = 0.1 + 0.2 = 0.3
    expect(scoreStatLine({ recYds: 1, rushYds: 2 }, SCORING_PRESETS.standard).total).toBe(0.3);
    // 333 pass yds × 0.04 = 13.32
    expect(scoreStatLine({ passYds: 333 }, SCORING_PRESETS.standard).total).toBe(13.32);
    // 1 pass yd × 0.04 = 0.04 (small, but still counts)
    expect(scoreStatLine({ passYds: 1 }, SCORING_PRESETS.standard).total).toBe(0.04);
  });

  it("rounds the exact total once instead of adding up rounded parts", () => {
    // Made-up league: 1 point per 8 yards, so each yard is worth 0.125.
    const rules: ScoringRules = { passYds: 0.125, rushYds: 0.125 };
    // 1 pass yd = 0.125 (shown as 0.13), 1 rush yd = 0.125 (shown as 0.13).
    // Exact total = 0.25. Adding the rounded parts would wrongly give 0.26.
    const result = scoreStatLine({ passYds: 1, rushYds: 1 }, rules);
    expect(result.parts.map((part) => part.points)).toEqual([0.13, 0.13]);
    expect(result.total).toBe(0.25);
  });

  it("scores nothing for an empty line, or one with only 0-point stats", () => {
    expect(scoreStatLine({}, SCORING_PRESETS.ppr)).toEqual({ total: 0, parts: [] });
    expect(
      scoreStatLine({ passAtt: 40, passCmp: 25, rushAtt: 3, targets: 9 }, SCORING_PRESETS.ppr),
    ).toEqual({ total: 0, parts: [] });
    expect(scoreAllFormats({})).toEqual({ standard: 0, half: 0, ppr: 0 });
  });

  it("uses whatever rules it's given (stats not in the rules score 0)", () => {
    // A league that pays 0.25 per completion and nothing else:
    // 20 completions × 0.25 = 5; the 250 pass yds score 0.
    expect(scoreStatLine({ passCmp: 20, passYds: 250 }, { passCmp: 0.25 }).total).toBe(5);
  });
});

describe("SCORING_ORDER", () => {
  it("contains every stat key exactly once", () => {
    expect([...SCORING_ORDER].sort()).toEqual([...STAT_KEYS].sort());
  });
});
