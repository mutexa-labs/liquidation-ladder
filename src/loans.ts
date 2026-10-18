import { loanStats, type Loan } from "@mutexa/liq-math";
import type { Placement } from "./perps";
import { rng } from "./rng";

/** The collateral reserve's parameters. `ltv` and `liqThreshold` are fractions, `priceUsd` in USD. */
export type LoanCollateral = { symbol: string; ltv: number; liqThreshold: number; priceUsd: number };

export type LoanPlanInput = {
  collateral: LoanCollateral;
  collateralAmount: number; // tokens
  debtUsd: number;
  loans: number;
  band: number; // 0..1
  placement: Placement; // around: same collateral; beyond: no loan liquidates before the single loan (adds collateral)
  sizeJitter: number;
  seed: number;
};

export type PlannedLoan = Loan & { index: number };

export type LoanPlan = {
  loans: PlannedLoan[];
  single: PlannedLoan;
  totalCollateral: number;
  totalCollateralUsd: number;
  extraCollateral: number;
  band: { near: number; far: number };
  capped: boolean; // band could only extend away from price (single LTV close to max)
  overMax: boolean; // the single loan is above max LTV, so it can't be opened
};

const stats = (collateral: number, debtUsd: number, price: number, lt: number, index: number): PlannedLoan => ({
  index,
  ...loanStats(collateral, debtUsd, price, lt),
});

/**
 * Splits one loan into several. "around": collateral split by share, debt staggered then rescaled so total
 * debt matches, each loan capped at max LTV. "beyond": debt split by share, each loan at or below the single
 * LTV, collateral grows to fit.
 */
export function planLoans(x: LoanPlanInput): LoanPlan {
  const { collateral: c, collateralAmount, debtUsd } = x;
  const P = c.priceUsd;
  const LT = c.liqThreshold;
  const maxLtv = c.ltv;
  const n = Math.max(1, Math.round(x.loans));
  const single = stats(collateralAmount, debtUsd, P, LT, 0);
  const L = single.ltv;
  const overMax = L > maxLtv + 1e-9;
  const at = (arr: number[], i: number) => arr[i] as number;

  const r = rng(x.seed);
  const w = Array.from({ length: n }, () => 1 + x.sizeJitter * (r() * 2 - 1) * 0.6);
  const wSum = w.reduce((a, b) => a + b, 0);
  const share = w.map((v) => v / wSum);

  const capped = x.placement === "around" && x.band > 0 && n > 1 && L * (1 + x.band * 0.8) > maxLtv;
  const beyond = x.placement === "beyond" || capped;
  const target = share.map((_, i) => {
    const t = n === 1 ? (beyond ? 0 : 0.5) : i / (n - 1);
    return beyond ? L * (1 - x.band * 0.8 * t) : L * (1 + x.band * (0.5 - t) * 1.6);
  });

  let coll: number[];
  let debt: number[];
  if (beyond) {
    debt = share.map((s) => s * debtUsd);
    coll = debt.map((d, i) => (at(target, i) > 0 ? d / (at(target, i) * P) : collateralAmount * at(share, i)));
  } else {
    coll = share.map((s) => s * collateralAmount);
    debt = coll.map((q, i) => q * P * Math.min(at(target, i), maxLtv));
    for (let k = 0; k < 8; k++) {
      const sum = debt.reduce((a, b) => a + b, 0);
      if (!(sum > 0)) break;
      const scale = debtUsd / sum;
      debt = debt.map((d, i) => Math.min(d * scale, at(coll, i) * P * maxLtv));
    }
  }
  const loans = coll.map((q, i) => stats(q, at(debt, i), P, LT, i + 1));
  const liqs = loans.map((l) => l.liq).filter(Number.isFinite);
  const totalCollateral = coll.reduce((a, b) => a + b, 0);
  return {
    loans,
    single,
    totalCollateral,
    totalCollateralUsd: totalCollateral * P,
    extraCollateral: Math.max(0, totalCollateral - collateralAmount),
    band: { near: liqs.length ? Math.max(...liqs) : NaN, far: liqs.length ? Math.min(...liqs) : NaN },
    capped,
    overMax,
  };
}
