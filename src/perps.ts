import { liqPrice, roundSize, tierAt, type Side, type Tier } from "@mutexa/liq-math";
import { rng } from "./rng";

/**
 * around: same capital as one position, leverage staggered on both sides of the target.
 * beyond: no slice liquidates before the single position would; costs more margin.
 */
export type Placement = "around" | "beyond";

export type PlanInput = {
  side: Side;
  entry: number;
  notional: number; // USD
  leverage: number; // blended target
  slices: number;
  band: number; // 0..1 leverage stagger across slices
  placement: Placement;
  sizeJitter: number; // 0..1 size variation across slices
  seed: number;
  tiers: Tier[];
  szDecimals: number;
};

export type Slice = {
  index: number;
  notional: number;
  size: number;
  margin: number;
  leverage: number;
  liq: number;
  distance: number; // fraction of entry, always positive
};

export type Plan = {
  input: PlanInput;
  slices: Slice[];
  totalMargin: number;
  blendedLeverage: number;
  band: { near: number; far: number }; // near = closest liquidation to entry
  single: { liq: number; distance: number; margin: number; leverage: number };
  maxLeverage: number;
  capped: boolean; // "around" was asked but the band could only extend away from price
};

/** Isolated margin can be topped up past the notional (effective leverage below 1x). */
export const MIN_LEVERAGE = 0.2;

/**
 * Splits one position into isolated slices. Slice leverage is staggered around the target so
 * liquidation prices spread into a band; in "around" margins are then rescaled so the total margin
 * equals notional / leverage (same capital as the single position). Leverage is capped at each slice's
 * tier max, and sizes are rounded down to the market's size step.
 */
export function planSlices(input: PlanInput): Plan {
  const { side, entry, notional, leverage, tiers, szDecimals } = input;
  const n = Math.max(1, Math.round(input.slices));
  const maxLev = tierAt(tiers, 0).maxLeverage;
  const target = Math.min(Math.max(leverage, MIN_LEVERAGE), maxLev);
  const totalMargin = notional / target;
  const at = <T>(arr: T[], i: number) => arr[i] as T;

  // notional weights with optional variation
  const r = rng(input.seed);
  const w = Array.from({ length: n }, () => 1 + input.sizeJitter * (r() * 2 - 1) * 0.6);
  const wSum = w.reduce((a, b) => a + b, 0);
  const notionals = w.map((x) => (x / wSum) * notional);

  // staggered leverage targets, highest first so slice 1 is closest to entry. At or near max leverage the
  // band can't extend toward price, so it only extends away (more margin).
  const capped = input.placement === "around" && input.band > 0 && n > 1 && target * (1 + input.band * 0.8) > maxLev;
  const beyond = input.placement === "beyond" || capped;
  const lev0 = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? (beyond ? 0 : 0.5) : i / (n - 1);
    return beyond ? target * (1 - input.band * 0.8 * t) : target * (1 + input.band * (0.5 - t) * 1.6);
  });
  let margins = notionals.map((x, i) =>
    Math.min(Math.max(x / Math.max(at(lev0, i), MIN_LEVERAGE), x / tierAt(tiers, x).maxLeverage), x / MIN_LEVERAGE),
  );
  for (let k = 0; k < (beyond ? 0 : 6); k++) {
    const scale = totalMargin / margins.reduce((a, b) => a + b, 0);
    margins = margins.map((m, i) => {
      const nt = at(notionals, i);
      const cap = tierAt(tiers, nt).maxLeverage;
      return Math.min(Math.max(m * scale, nt / cap), nt / MIN_LEVERAGE);
    });
  }

  const slices: Slice[] = notionals.map((nt, i) => {
    const size = roundSize(nt / entry, szDecimals);
    const realNotional = size * entry;
    const margin = at(margins, i) * (realNotional / nt || 0);
    const liq = liqPrice(side, entry, size, margin, tiers);
    return {
      index: i + 1,
      notional: realNotional,
      size,
      margin,
      leverage: margin > 0 ? realNotional / margin : 0,
      liq,
      distance: Math.abs(entry - liq) / entry,
    };
  });

  const liqs = slices.map((s) => s.liq).filter(Number.isFinite);
  const near = side === 1 ? Math.max(...liqs) : Math.min(...liqs);
  const far = side === 1 ? Math.min(...liqs) : Math.max(...liqs);
  const sumNotional = slices.reduce((a, s) => a + s.notional, 0);
  const sumMargin = slices.reduce((a, s) => a + s.margin, 0);

  const singleSize = roundSize(notional / entry, szDecimals);
  const singleMargin = (singleSize * entry) / target;
  const singleLiq = liqPrice(side, entry, singleSize, singleMargin, tiers);

  return {
    input,
    slices,
    totalMargin: sumMargin,
    blendedLeverage: sumMargin > 0 ? sumNotional / sumMargin : 0,
    band: { near, far },
    single: { liq: singleLiq, distance: Math.abs(entry - singleLiq) / entry, margin: singleMargin, leverage: target },
    maxLeverage: maxLev,
    capped,
  };
}
