import { describe, expect, it } from "vitest";
import { cleanPlayText, isKeyPlay } from "./play-text";

// Real play text from Week 6 (samples/core-plays-*.json and the validation games).
describe("cleanPlayText", () => {
  it("drops formation notes and tacklers", () => {
    expect(cleanPlayText("(Shotgun) P.Mahomes pass short left to K.Walker to LAC 33 for 5 yards (T.Jefferson).")).toBe(
      "P.Mahomes pass short left to K.Walker to LAC 33 for 5 yards.",
    );
    expect(cleanPlayText("K.Walker right end to LAC 39 for 3 yards (D.Henley; N.Barrett).")).toBe(
      "K.Walker right end to LAC 39 for 3 yards.",
    );
    expect(cleanPlayText("(No Huddle, Shotgun) D.Jones spiked the ball to stop the clock.")).toBe(
      "D.Jones spiked the ball to stop the clock.",
    );
    expect(
      cleanPlayText("(Shotgun) B.Irving up the middle to PIT 32 for -5 yards (N.Herbig, C.Heyward)."),
    ).toBe("B.Irving up the middle to PIT 32 for -5 yards.");
  });

  it("keeps the meaningful parts of scoring plays", () => {
    expect(
      cleanPlayText(
        "(Shotgun) J.Allen pass short middle to K.Coleman for 12 yards, TOUCHDOWN [M.Crosby]. T.Bass extra point is GOOD, Center-R.Ferguson, Holder-T.Doman.",
      ),
    ).toBe(
      "J.Allen pass short middle to K.Coleman for 12 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson, Holder-T.Doman.",
    );
  });

  it("drops eligible-receiver announcements", () => {
    expect(cleanPlayText("B.Fisher reported in as eligible. C.Stroud pass deep right to N.Collins to JAX 9 for 42 yards (D.Lloyd).")).toBe(
      "C.Stroud pass deep right to N.Collins to JAX 9 for 42 yards.",
    );
    expect(cleanPlayText("B.Fisher reported in as eligible.  (Shotgun) J.Jordan left tackle for 25 yards, TOUCHDOWN.")).toBe(
      "J.Jordan left tackle for 25 yards, TOUCHDOWN.",
    );
  });

  it("leaves non-name parentheses alone", () => {
    expect(cleanPlayText("R.Johnson up the middle to ATL 45 for 4 yards (J.Bates). FUMBLES (J.Bates), RECOVERED by ATL-H.Perkins at ATL 43.")).toBe(
      "R.Johnson up the middle to ATL 45 for 4 yards. FUMBLES, RECOVERED by ATL-H.Perkins at ATL 43.",
    );
  });
});

describe("isKeyPlay", () => {
  it("keeps touchdowns, injuries and plays worth a point or more", () => {
    expect(isKeyPlay({ kind: "points", points: 0.48, isTouchdown: false })).toBe(false);
    expect(isKeyPlay({ kind: "points", points: -0.2, isTouchdown: false })).toBe(false);
    expect(isKeyPlay({ kind: "points", points: 1.5, isTouchdown: false })).toBe(true);
    expect(isKeyPlay({ kind: "points", points: -2, isTouchdown: false })).toBe(true);
    expect(isKeyPlay({ kind: "points", points: 0.24, isTouchdown: true })).toBe(true);
    expect(isKeyPlay({ kind: "injury", points: 0, isTouchdown: false })).toBe(true);
  });
});
