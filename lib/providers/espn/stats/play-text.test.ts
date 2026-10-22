import { describe, expect, it } from "vitest";
import {
  afterReplayReversal,
  ballLosses,
  creditedYards,
  firstGain,
  splitTry,
  twoPointTry,
} from "./play-text";

describe("play text helpers", () => {
  it("keeps only the corrected description after a replay reversal", () => {
    const text =
      "C.Hubbard up the middle to CAR 49 for no gain (M.Ojomo).Carolina challenged the short of the line to gain ruling, and the play was REVERSED.C.Hubbard up the middle to 50 for 1 yard (M.Ojomo).";
    expect(afterReplayReversal(text)).toBe("C.Hubbard up the middle to 50 for 1 yard (M.Ojomo).");
    expect(afterReplayReversal("no review here")).toBe("no review here");
  });

  it("splits off the extra point or two-point try", () => {
    expect(splitTry("J.Jordan left tackle for 25 yards, TOUCHDOWN. K.Fairbairn extra point is GOOD.")).toEqual({
      main: "J.Jordan left tackle for 25 yards, TOUCHDOWN. ",
      tryText: "K.Fairbairn extra point is GOOD.",
    });
    expect(splitTry("R.Johnson up the middle to ATL 45 for 4 yards.").tryText).toBe("");
  });

  it("reads the first gain with where it ended", () => {
    expect(firstGain("D.Swift left end pushed ob at CHI 42 for 11 yards (Av.Terrell).")).toMatchObject({
      yards: 11,
      end: { side: "CHI", line: 42 },
      reachedGoal: false,
    });
    expect(firstGain("C.Hubbard up the middle to 50 for 1 yard")).toMatchObject({ yards: 1, end: { line: 50 } });
    expect(firstGain("A.Estime left tackle to CLV 45 for no gain (T.Jones).")?.yards).toBe(0);
    expect(firstGain("C.Williams kneels to ATL 5 for -1 yards.")?.yards).toBe(-1);
    expect(firstGain("J.McNichols left guard for 31 yards, TOUCHDOWN NULLIFIED by Penalty.")).toMatchObject({
      yards: 31,
      end: undefined,
      reachedGoal: true,
    });
    expect(firstGain("T.Lawrence pass short left intended for J.Meyers INTERCEPTED")).toBeUndefined();
  });

  it("only trims yards for a foul spot that's inside the gain", () => {
    // Made-up texts that test the field geometry (not real plays).
    const inside = "X.Runner to AAA 44 for 4 yards.PENALTY on AAA-Y.Blocker, Offensive Holding, 10 yards, enforced at AAA 42.";
    expect(creditedYards(inside, firstGain(inside)!)).toBe(2);
    // The foul is past where the run ended (on the other team's half), so it doesn't count.
    const beyond = "X.Runner to AAA 45 for 10 yards.PENALTY on BBB-Y.Defender, Face Mask, 15 yards, enforced at BBB 40.";
    expect(creditedYards(beyond, firstGain(beyond)!)).toBe(10);
    const declined = "X.Runner to AAA 44 for 4 yards.Penalty on AAA-Y.Blocker, Offensive Holding, declined.";
    expect(creditedYards(declined, firstGain(declined)!)).toBe(4);
  });

  it("tells lost fumbles from kept ones by ESPN's capitals", () => {
    expect(ballLosses("FUMBLES (J.Bates), RECOVERED by ATL-H.Perkins at ATL 43.")).toEqual([{ kind: "FUMBLES", lost: true }]);
    expect(ballLosses("FUMBLES (K.Gordon), recovered by ATL-R.Neuzil at ATL 3.")).toEqual([{ kind: "FUMBLES", lost: false }]);
    expect(ballLosses("FUMBLES (W.Bailey), ball out of bounds at ARZ 43.")).toEqual([{ kind: "FUMBLES", lost: false }]);
    expect(ballLosses("Z.Branch MUFFS catch, RECOVERED by CHI-J.Blackwell at ATL 10.")).toEqual([{ kind: "MUFFS", lost: true }]);
  });

  it("reads two-point tries", () => {
    expect(twoPointTry("TWO-POINT CONVERSION ATTEMPT. M.Penix pass to Z.Branch is complete. ATTEMPT SUCCEEDS.")).toEqual({ succeeded: true, isPass: true });
    expect(twoPointTry("TWO-POINT CONVERSION ATTEMPT. B.Young pass to J.Metchie is incomplete. ATTEMPT FAILS.")).toEqual({ succeeded: false, isPass: true });
    expect(twoPointTry("K.Fairbairn extra point is GOOD.")).toBeUndefined();
  });
});
