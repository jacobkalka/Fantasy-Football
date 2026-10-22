import { describe, expect, it } from "vitest";
import { SCORING_FORMATS, SCORING_PRESETS, rulesForFormat } from "./rules";

describe("scoring presets", () => {
  it("only differ in points per reception", () => {
    expect(SCORING_PRESETS.standard.rec).toBe(0);
    expect(SCORING_PRESETS.half.rec).toBe(0.5);
    expect(SCORING_PRESETS.ppr.rec).toBe(1);

    // Blank out `rec` and the three presets should be identical.
    const withoutRec = SCORING_FORMATS.map((format) => ({ ...SCORING_PRESETS[format], rec: 0 }));
    expect(withoutRec[1]).toEqual(withoutRec[0]);
    expect(withoutRec[2]).toEqual(withoutRec[0]);
  });

  it("match ESPN's default offensive scoring", () => {
    expect(SCORING_PRESETS.standard).toEqual({
      passYds: 0.04,
      passTd: 4,
      passInt: -2,
      pass2pt: 2,
      rushYds: 0.1,
      rushTd: 6,
      rush2pt: 2,
      recYds: 0.1,
      recTd: 6,
      rec2pt: 2,
      fumLost: -2,
      retTd: 6,
      fumRecTd: 6,
      rec: 0,
    });
  });

  it("give no points for attempts, completions, carries or targets", () => {
    for (const format of SCORING_FORMATS) {
      const rules = SCORING_PRESETS[format];
      expect(rules.passAtt ?? 0).toBe(0);
      expect(rules.passCmp ?? 0).toBe(0);
      expect(rules.rushAtt ?? 0).toBe(0);
      expect(rules.targets ?? 0).toBe(0);
    }
  });

  it("can't be changed by accident", () => {
    expect(Object.isFrozen(SCORING_PRESETS)).toBe(true);
    for (const format of SCORING_FORMATS) {
      expect(Object.isFrozen(SCORING_PRESETS[format])).toBe(true);
    }
  });
});

describe("rulesForFormat", () => {
  it("returns the matching preset", () => {
    expect(rulesForFormat("standard")).toBe(SCORING_PRESETS.standard);
    expect(rulesForFormat("half")).toBe(SCORING_PRESETS.half);
    expect(rulesForFormat("ppr")).toBe(SCORING_PRESETS.ppr);
  });
});
