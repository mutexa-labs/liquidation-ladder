import { describe, expect, it } from "vitest";
import { alertSafeSlices, costPreview, DEFAULT_HEADROOM, slicesAbove } from "../src/index";

describe("alertSafeSlices", () => {
  it("sizes the count for the total plus headroom", () => {
    // 100000 · 1.15 / 30000 = 3.83 → 4
    expect(alertSafeSlices(100_000, 30_000)).toEqual({ slices: 4, reachable: true });
    expect(alertSafeSlices(100_000, 30_000, { headroom: 0 })).toEqual({ slices: 4, reachable: true });
    expect(alertSafeSlices(90_000, 30_000, { headroom: 0 })).toEqual({ slices: 3, reachable: true });
    expect(DEFAULT_HEADROOM).toBe(0.15);
  });

  it("reports when the cap cannot keep slices under the threshold", () => {
    expect(alertSafeSlices(1_000_000, 10_000, { max: 12 })).toEqual({ slices: 115, reachable: false });
  });

  it("never returns fewer than one slice and refuses a missing threshold", () => {
    expect(alertSafeSlices(0, 5_000).slices).toBe(1);
    expect(() => alertSafeSlices(1_000, 0)).toThrow(RangeError);
    expect(() => alertSafeSlices(1_000, Number.NaN)).toThrow(RangeError);
  });

  it("counts slices above a threshold", () => {
    expect(slicesAbove([10, 20, 30], 15)).toBe(2);
    expect(slicesAbove([10, 20, 30], 30)).toBe(0);
  });
});

describe("costPreview", () => {
  it("adds fills and account costs, not fee on size", () => {
    const c = costPreview({ notionals: [10_000, 20_000, 30_000], feeRate: 0.0005, accountCost: 2 });
    expect(c.fills).toEqual({ single: 2, split: 6 });
    expect(c.venueFees).toBeCloseTo(60_000 * 0.0005 * 2, 9);
    expect(c.accountCosts).toEqual({ single: 2, split: 6 });
    expect(c.extra).toBe(4);
    expect(c.railFeesIncluded).toBe(false);
  });

  it("leaves fees unknown without a rate", () => {
    expect(costPreview({ notionals: [1, 2], feeRate: null, accountCost: 3 })).toMatchObject({
      venueFees: null,
      extra: 3,
    });
    expect(costPreview({ notionals: [1, 2], feeRate: null, accountCost: 0 }).extra).toBeNull();
    expect(costPreview({ notionals: [1, 2], feeRate: 0, accountCost: 0 }).extra).toBe(0);
  });
});
