import { describe, expect, it } from "vitest";
import { formatBreakdown, formatPoints } from "./format";
import { SCORING_PRESETS } from "./rules";
import { scoreStatLine } from "./score";

const MINUS = "−"; // the real minus sign "−", not the hyphen "-"

describe("formatPoints", () => {
  it("shows a plus sign and two decimals for positive points", () => {
    expect(formatPoints(9.4)).toBe("+9.40");
    expect(formatPoints(6)).toBe("+6.00");
    expect(formatPoints(19.88)).toBe("+19.88");
    expect(formatPoints(100)).toBe("+100.00");
  });

  it("uses the real minus sign for negative points", () => {
    expect(formatPoints(-2)).toBe(`${MINUS}2.00`);
    expect(formatPoints(-6.1)).toBe(`${MINUS}6.10`);
    expect(formatPoints(-2).charCodeAt(0)).toBe(0x2212);
  });

  it("shows plain 0.00 for zero, with no sign", () => {
    expect(formatPoints(0)).toBe("0.00");
    expect(formatPoints(-0)).toBe("0.00");
    // Hundredths are kept: 1 pass yd = +0.04. Float noise rounds to zero, never "−0.00".
    expect(formatPoints(0.04)).toBe("+0.04");
    expect(formatPoints(-0.001)).toBe("0.00");
  });

  it("rounds halves away from zero", () => {
    // 1.005 is stored as 1.00499..., so (1.005).toFixed(2) would give "1.00".
    expect(formatPoints(1.005)).toBe("+1.01");
    expect(formatPoints(-1.005)).toBe(`${MINUS}1.01`);
    expect(formatPoints(9.444)).toBe("+9.44");
  });

  it("cleans up floating-point leftovers", () => {
    expect(formatPoints(0.1 * 3)).toBe("+0.30"); // 0.30000000000000004
  });
});

describe("formatBreakdown", () => {
  it("describes a 74-yard receiving TD in PPR", () => {
    // 74 rec yds × 0.1 = 7.4, 1 rec TD × 6 = 6, 1 catch × 1 = 1 → 14.4 total
    const result = scoreStatLine({ targets: 1, rec: 1, recYds: 74, recTd: 1 }, SCORING_PRESETS.ppr);
    expect(result.total).toBe(14.4);
    expect(formatBreakdown(result.parts)).toBe("+7.4 yds, +6 TD, +1 reception");
  });

  it("describes an interception", () => {
    // 1 INT × −2 = −2 (the attempt itself is worth 0)
    const result = scoreStatLine({ passAtt: 1, passInt: 1 }, SCORING_PRESETS.ppr);
    expect(formatBreakdown(result.parts)).toBe(`${MINUS}2 INT`);
  });

  it("keeps two decimals for passing yards so small gains still show", () => {
    // 74 pass yds × 0.04 = 2.96, 1 pass TD × 4 = 4
    const result = scoreStatLine({ passAtt: 1, passCmp: 1, passYds: 74, passTd: 1 }, SCORING_PRESETS.standard);
    expect(formatBreakdown(result.parts)).toBe("+2.96 yds, +4 TD");
    // 1 pass yd × 0.04 = 0.04
    expect(formatBreakdown(scoreStatLine({ passYds: 1 }, SCORING_PRESETS.standard).parts)).toBe("+0.04 yds");
  });

  it("pluralises receptions and fumbles", () => {
    // Half-PPR, 5 catches × 0.5 = 2.5
    expect(formatBreakdown([{ key: "rec", amount: 5, points: 2.5 }])).toBe("+2.5 receptions");
    expect(formatBreakdown([{ key: "rec", amount: 1, points: 0.5 }])).toBe("+0.5 reception");
    // 1 fumble × −2 = −2; 2 fumbles × −2 = −4
    expect(formatBreakdown([{ key: "fumLost", amount: 1, points: -2 }])).toBe(`${MINUS}2 fumble lost`);
    expect(formatBreakdown([{ key: "fumLost", amount: 2, points: -4 }])).toBe(`${MINUS}4 fumbles lost`);
  });

  it("labels 2-point conversions and return TDs", () => {
    expect(formatBreakdown([{ key: "rush2pt", amount: 1, points: 2 }])).toBe("+2 2-pt");
    expect(formatBreakdown([{ key: "retTd", amount: 1, points: 6 }])).toBe("+6 TD");
  });

  it("shows stat corrections as negatives", () => {
    // Catch overturned in PPR: −8 rec yds × 0.1 = −0.8, −1 catch × 1 = −1
    expect(
      formatBreakdown([
        { key: "recYds", amount: -8, points: -0.8 },
        { key: "rec", amount: -1, points: -1 },
      ]),
    ).toBe(`${MINUS}0.8 yds, ${MINUS}1 reception`);
  });

  it("returns an empty string when nothing scored", () => {
    expect(formatBreakdown([])).toBe("");
  });
});
