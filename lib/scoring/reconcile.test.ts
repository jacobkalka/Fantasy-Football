import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";

describe("reconcile", () => {
  it("is ok when our math matches the box score exactly", () => {
    expect(reconcile(19.88, 19.88)).toEqual({ ok: true, drift: 0, headline: 19.88 });
  });

  it("is ok when the drift is within the tolerance", () => {
    // 19.92 − 19.88 = 0.04, which is within 0.05
    expect(reconcile(19.92, 19.88)).toEqual({ ok: true, drift: 0.04, headline: 19.88 });
    // 10.05 − 10 = 0.05, exactly at the limit, still ok
    // (plain JavaScript says 0.05000000000000071, which would wrongly fail)
    expect(reconcile(10.05, 10)).toEqual({ ok: true, drift: 0.05, headline: 10 });
  });

  it("is not ok when the drift is too big, and still shows the official number", () => {
    // We missed a 6-point TD: 13.88 − 19.88 = −6
    expect(reconcile(13.88, 19.88)).toEqual({ ok: false, drift: -6, headline: 19.88 });
    // We counted 0.1 too many: 20.4 − 20.3 = 0.1
    expect(reconcile(20.4, 20.3)).toEqual({ ok: false, drift: 0.1, headline: 20.3 });
  });

  it("accepts a custom tolerance", () => {
    // 20.5 − 20 = 0.5
    expect(reconcile(20.5, 20, 1).ok).toBe(true);
    expect(reconcile(20.5, 20, 0).ok).toBe(false);
  });

  it("tidies floating-point leftovers in the official number", () => {
    expect(reconcile(21.24, 21.240000000000002)).toEqual({ ok: true, drift: 0, headline: 21.24 });
  });
});
