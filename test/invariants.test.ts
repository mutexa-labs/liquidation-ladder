import { tierAt, tiersFor, type Side, type Tier } from "@mutexa/liq-math";
import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  MIN_LEVERAGE,
  planLoans,
  planSlices,
  type Jitter,
  type Placement,
  type PlanInput,
} from "../src/index";

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Arbitrary test markets: one single-tier, one with a margin table whose second tier starts low enough
// for planned slices to cross it.
const markets: Tier[][] = [
  tiersFor(50),
  tiersFor(20, [
    { lowerBound: "0", maxLeverage: 20 },
    { lowerBound: "25000", maxLeverage: 10 },
  ]),
  tiersFor(3),
];

function randomInput(r: () => number, placement?: Placement): PlanInput {
  const tiers = markets[Math.floor(r() * markets.length)]!;
  return {
    side: (r() > 0.5 ? 1 : -1) as Side,
    entry: 0.01 + r() * 90_000,
    notional: 100 + r() * 500_000,
    leverage: 0.2 + r() * 60,
    slices: 1 + Math.floor(r() * 14),
    band: r(),
    placement: placement ?? (r() > 0.5 ? "around" : "beyond"),
    sizeJitter: r(),
    seed: Math.floor(r() * 1e9),
    tiers,
    szDecimals: 6,
  };
}

const RUNS = 400;
const EPS = 1e-9;

describe("planSlices invariants", () => {
  it("sum of slice notionals equals the sum of rounded sizes × entry and never exceeds the total", () => {
    const r = seeded(1);
    for (let i = 0; i < RUNS; i++) {
      const p = planSlices(randomInput(r));
      const sum = p.slices.reduce((a, s) => a + s.notional, 0);
      const fromSizes = p.slices.reduce((a, s) => a + s.size * p.input.entry, 0);
      expect(sum).toBeCloseTo(fromSizes, 6);
      expect(sum).toBeLessThanOrEqual(p.input.notional * (1 + EPS));
      for (const s of p.slices) expect(Math.round(s.size * 1e6) / 1e6).toBeCloseTo(s.size, 12);
    }
  });

  it('"beyond" never puts a slice closer to price than the single position', () => {
    const r = seeded(2);
    for (let i = 0; i < RUNS; i++) {
      const p = planSlices(randomInput(r, "beyond"));
      for (const s of p.slices) {
        if (s.size === 0) continue;
        expect(s.distance).toBeGreaterThanOrEqual(p.single.distance - 1e-6);
      }
    }
  });

  it('"around" keeps total margin at notional ÷ target when nothing is capped', () => {
    const r = seeded(3);
    let checked = 0;
    for (let i = 0; i < RUNS; i++) {
      const input = { ...randomInput(r, "around"), tiers: markets[0]!, leverage: 1 + r() * 10, band: r() * 0.5 };
      const p = planSlices(input);
      const target = Math.min(Math.max(input.leverage, MIN_LEVERAGE), p.maxLeverage);
      const allInside = p.slices.every((s) => s.leverage < p.maxLeverage - 1e-9 && s.leverage > MIN_LEVERAGE + 1e-9);
      if (p.capped || !allInside) continue;
      const realNotional = p.slices.reduce((a, s) => a + s.notional, 0);
      // six rescaling passes, so the total converges to within a few parts per million
      expect(p.totalMargin / (realNotional / target)).toBeCloseTo(1, 4);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("every slice is at or under its tier's max leverage", () => {
    const r = seeded(4);
    for (let i = 0; i < RUNS; i++) {
      const p = planSlices(randomInput(r));
      for (const s of p.slices) {
        if (s.size === 0) continue;
        // the cap is applied at the planned notional, before rounding the size down
        expect(s.leverage).toBeLessThanOrEqual(tierAt(p.input.tiers, s.notional).maxLeverage * (1 + 1e-9) + 1e-9);
      }
    }
  });

  it("is deterministic for a seed", () => {
    const r = seeded(5);
    for (let i = 0; i < 50; i++) {
      const input = randomInput(r);
      expect(planSlices(input)).toStrictEqual(planSlices({ ...input }));
    }
  });

  it("orders the band: near is the slice liquidation closest to entry", () => {
    const r = seeded(6);
    for (let i = 0; i < RUNS; i++) {
      const p = planSlices(randomInput(r));
      const d = (x: number) => Math.abs(x - p.input.entry);
      expect(d(p.band.near)).toBeLessThanOrEqual(d(p.band.far) + 1e-9);
    }
  });
});

describe("planLoans invariants", () => {
  it("keeps every loan at or under max LTV and never adds debt", () => {
    const r = seeded(7);
    for (let i = 0; i < RUNS; i++) {
      const ltv = 0.3 + r() * 0.6;
      const price = 1 + r() * 5000;
      const collateralAmount = 1 + r() * 1000;
      const debtUsd = collateralAmount * price * ltv * r();
      const q = planLoans({
        collateral: { symbol: "X", ltv, liqThreshold: Math.min(0.98, ltv + 0.02 + r() * 0.1), priceUsd: price },
        collateralAmount,
        debtUsd,
        loans: 1 + Math.floor(r() * 10),
        band: r(),
        placement: r() > 0.5 ? "around" : "beyond",
        sizeJitter: r(),
        seed: Math.floor(r() * 1e9),
      });
      expect(q.overMax).toBe(false);
      for (const l of q.loans) expect(l.ltv).toBeLessThanOrEqual(ltv + 1e-9);
      const debt = q.loans.reduce((a, l) => a + l.debtUsd, 0);
      expect(debt).toBeLessThanOrEqual(debtUsd * (1 + 1e-9) + 1e-9);
    }
  });

  it('"beyond" never liquidates a loan before the single loan', () => {
    const r = seeded(8);
    for (let i = 0; i < RUNS; i++) {
      const price = 10 + r() * 4000;
      const q = planLoans({
        collateral: { symbol: "X", ltv: 0.8, liqThreshold: 0.85, priceUsd: price },
        collateralAmount: 10,
        debtUsd: 10 * price * 0.8 * r(),
        loans: 2 + Math.floor(r() * 8),
        band: r(),
        placement: "beyond",
        sizeJitter: r(),
        seed: i,
      });
      for (const l of q.loans) expect(l.liq).toBeLessThanOrEqual(q.single.liq * (1 + 1e-9));
    }
  });

  it("flags a single loan above max LTV", () => {
    const q = planLoans({
      collateral: { symbol: "X", ltv: 0.5, liqThreshold: 0.6, priceUsd: 100 },
      collateralAmount: 1,
      debtUsd: 55,
      loans: 3,
      band: 0.5,
      placement: "around",
      sizeJitter: 0,
      seed: 1,
    });
    expect(q.overMax).toBe(true);
  });
});

describe("buildSchedule invariants", () => {
  it("child sizes add up to each slice size and stay inside the window", () => {
    const r = seeded(9);
    const jitters: Jitter[] = ["off", "light", "heavy"];
    for (let i = 0; i < RUNS; i++) {
      const szDecimals = Math.floor(r() * 5);
      const step = 10 ** -szDecimals;
      const slices = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, k) => ({
        index: k + 1,
        size: Math.round((step * 10 + r() * 500) / step) * step,
      }));
      const windowMs = Math.floor(r() * 86_400_000);
      const orders = buildSchedule({
        slices,
        windowMs,
        children: 1 + Math.floor(r() * 6),
        jitter: jitters[i % 3]!,
        seed: i,
        szDecimals,
      });
      for (const s of slices) {
        const sum = orders.filter((o) => o.slice === s.index).reduce((a, o) => a + o.size, 0);
        expect(sum).toBeCloseTo(s.size, Math.max(0, szDecimals - 1));
      }
      for (const o of orders) {
        expect(o.at).toBeGreaterThanOrEqual(0);
        expect(o.at).toBeLessThanOrEqual(windowMs);
      }
      const times = orders.map((o) => o.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it("is deterministic for a seed", () => {
    const input = {
      slices: [
        { index: 1, size: 3.5 },
        { index: 2, size: 1.25 },
      ],
      windowMs: 600_000,
      children: 4,
      jitter: "heavy" as const,
      seed: 77,
      szDecimals: 2,
    };
    expect(buildSchedule(input)).toStrictEqual(buildSchedule({ ...input }));
  });
});
