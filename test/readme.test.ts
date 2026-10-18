// The README quick start is copied from this file. Keep them in sync.
import { expect, it } from "vitest";
import { tiersFor } from "@mutexa/liq-math";
import { alertSafeSlices, buildSchedule, costPreview, planSlices } from "../src/index";

it("README quick start", () => {
  // Long 120000 USD at 3000, 10x, on a market with max leverage 40 and no margin table.
  const tiers = tiersFor(40);

  // Your alert threshold: the size at which you assume trackers flag a wallet. Always your own number.
  const { slices } = alertSafeSlices(120_000, 25_000); // 6

  const plan = planSlices({
    side: 1,
    entry: 3000,
    notional: 120_000,
    leverage: 10,
    slices,
    band: 0.5, // stagger leverage across slices
    placement: "beyond", // no slice liquidates before the single position would
    sizeJitter: 0.3,
    seed: 42,
    tiers,
    szDecimals: 4,
  });
  // plan.single.liq  2734.18   one position, one public liquidation line
  // plan.band        { near: 2734.18, far: 2531.65 } every slice at or below the single line

  const cost = costPreview({ notionals: plan.slices.map((s) => s.notional), feeRate: 0.00045, accountCost: 1 });
  // cost.fills { single: 2, split: 12 }, cost.extra 5 (account costs), rail fees not included

  const orders = buildSchedule({
    slices: plan.slices,
    windowMs: 30 * 60_000,
    children: 2,
    jitter: "heavy",
    seed: 42,
    szDecimals: 4,
  });
  // 12 child orders at random times over 30 minutes

  expect(slices).toBe(6);
  expect(plan.single.liq).toBeCloseTo(2734.18, 2);
  expect(plan.band.near).toBeCloseTo(2734.18, 1);
  expect(plan.band.far).toBeCloseTo(2531.65, 1);
  expect(cost.fills).toEqual({ single: 2, split: 12 });
  expect(cost.extra).toBe(5);
  expect(orders).toHaveLength(12);
});
