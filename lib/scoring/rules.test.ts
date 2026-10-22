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
    const offense = [
      "passYds", "passTd", "passInt", "pass2pt", "rushYds", "rushTd", "rush2pt",
      "recYds", "recTd", "rec2pt", "fumLost", "retTd", "fumRecTd", "rec",
    ] as const;
    const picked = Object.fromEntries(offense.map((key) => [key, SCORING_PRESETS.standard[key]]));
    expect(picked).toEqual({
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

  it("match ESPN's default kicker scoring", () => {
    const k = SCORING_PRESETS.ppr;
    expect([k.fgMade0_39, k.fgMade40_49, k.fgMade50_59, k.fgMade60]).toEqual([3, 4, 5, 6]);
    expect(k.fgMiss).toBe(-1);
    expect(k.xpMade).toBe(1);
    expect(k.xpMiss ?? 0).toBe(0); // ESPN's default doesn't take a point off for a missed PAT
  });

  it("match ESPN's default D/ST scoring, with exactly one tier on at a time", () => {
    const d = SCORING_PRESETS.standard;
    expect([d.dstSack, d.dstInt, d.dstFumRec, d.dstBlk, d.dstSafety]).toEqual([1, 2, 2, 2, 2]);
    expect([d.dstIntTd, d.dstFumTd, d.dstBlkTd]).toEqual([6, 6, 6]);
    const pa = [d.dstPa0, d.dstPa1_6, d.dstPa7_13, d.dstPa14_17, d.dstPa18_21, d.dstPa22_27, d.dstPa28_34, d.dstPa35_45, d.dstPa46];
    expect(pa.map((v) => v ?? 0)).toEqual([5, 4, 3, 1, 0, 0, -1, -3, -5]);
    const ya = [d.dstYa0_99, d.dstYa100_199, d.dstYa200_299, d.dstYa300_349, d.dstYa350_399, d.dstYa400_449, d.dstYa450_499, d.dstYa500_549, d.dstYa550];
    expect(ya.map((v) => v ?? 0)).toEqual([5, 3, 2, 0, -1, -3, -5, -6, -7]);
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
