export type CostInput = {
  notionals: number[]; // USD per slice
  feeRate: number | null; // venue fee per fill as a fraction of notional (0.00045 = 0.045%); null when unknown
  accountCost: number; // USD the caller expects per account (gas, deposit and withdraw)
};

export type CostPreview = {
  fills: { single: number; split: number }; // open + close
  venueFees: number | null; // open + close, the same with and without splitting
  accountCosts: { single: number; split: number };
  extra: number | null; // extra cost of splitting; null when neither a fee rate nor an account cost is given
  railFeesIncluded: false;
};

/**
 * Fills, venue fees and per-account costs of one position against the same position split into slices.
 * Percentage fees scale with notional, so splitting adds fills but not fee on size. Privacy rail fees and
 * delays are never included: they depend on the rail used on each chain.
 */
export function costPreview(x: CostInput): CostPreview {
  const n = x.notionals.length;
  const total = x.notionals.reduce((a, b) => a + b, 0);
  const venueFees = x.feeRate !== null ? total * x.feeRate * 2 : null;
  return {
    fills: { single: 2, split: 2 * n },
    venueFees,
    accountCosts: { single: x.accountCost, split: x.accountCost * n },
    extra: venueFees === null && x.accountCost === 0 ? null : x.accountCost * (n - 1),
    railFeesIncluded: false,
  };
}
