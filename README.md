# @mutexa/ladder

Split one perp position or one loan into slices whose liquidation prices form a band instead of one public
line, size the slices against your own alert threshold, preview what splitting costs, and spread the orders
over time with a seeded, jittered schedule.

- `planSlices` — isolated perp slices with staggered leverage, seeded size variation, tier caps and size
  rounding. "around" keeps the same capital as one position; "beyond" never puts a slice closer to price than
  the single position would be, at the cost of more margin.
- `planLoans` — the same for a loan: collateral split, debt staggered and rescaled, every loan capped at max LTV.
- `alertSafeSlices` — how many slices keep every slice under your alert threshold.
- `costPreview` — fills, venue fees and per-account costs with and without splitting.
- `buildSchedule` — child orders over a time window with `off`, `light` or `heavy` jitter.

Pure functions, no I/O. Liquidation prices come from [`@mutexa/liq-math`](https://github.com/mutexa-labs/liq-math),
which is checked against the venues' own numbers with golden vectors.

## Install

```sh
pnpm add github:mutexa-labs/liquidation-ladder#v0.1.0
```

Node 22 or later. ESM only. When installing from git, allow the two packages to build on install
(pnpm 10+ asks for this): add `@mutexa/ladder` and `@mutexa/liq-math` to `allowBuilds` in
`pnpm-workspace.yaml`, as the error message suggests.

## Quick start

From [`test/readme.test.ts`](test/readme.test.ts):

```ts
import { tiersFor } from "@mutexa/liq-math";
import { alertSafeSlices, buildSchedule, costPreview, planSlices } from "@mutexa/ladder";

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
```

The fee rate, account cost and alert threshold above are example inputs for the test, not recommendations.
Use your own.

## API

| Export | What it does |
|---|---|
| `planSlices(input: PlanInput): Plan` | Splits a perp position into isolated slices. Returns the slices (`notional`, `size`, `margin`, `leverage`, `liq`, `distance`), `totalMargin`, `blendedLeverage`, the band (`near` = closest liquidation to entry, `far`), the single-position comparison, `maxLeverage` and `capped` (asked for "around" but at or near max leverage the band could only extend away from price). |
| `planLoans(input: LoanPlanInput): LoanPlan` | Splits a loan. Returns the loans, the single loan, total and extra collateral, the band, `capped` and `overMax` (the single loan is above max LTV, so it could not be opened). |
| `alertSafeSlices(totalNotional, threshold, { headroom?, max? })` | `{ slices, reachable }`. `headroom` (default `0.15`) is room for size variation. No default threshold. |
| `slicesAbove(notionals, threshold)` | How many slices are above the threshold. |
| `costPreview({ notionals, feeRate, accountCost })` | Fills (open and close), venue fees, account costs and the extra cost of splitting. `feeRate` is a fraction per fill (`0.00045` = 0.045%), or `null` when unknown. Privacy rail fees are never included (`railFeesIncluded: false`). |
| `buildSchedule(input: ScheduleInput): ScheduledOrder[]` | Child orders `{ id, slice, at, size }`, `at` in ms from the start of the window. Child sizes are rounded to the size step and add up to each slice. |
| `MIN_LEVERAGE` | `0.2`: isolated margin can be topped up past the notional. |
| Types | `PlanInput`, `Plan`, `Slice`, `Placement`, `LoanPlanInput`, `LoanPlan`, `LoanCollateral`, `PlannedLoan`, `CostInput`, `CostPreview`, `ScheduleInput`, `ScheduledOrder`, `Jitter`, and `Side`, `Tier` from liq-math. |

### Inputs

| `PlanInput` field | Meaning |
|---|---|
| `side` | `1` long, `-1` short |
| `entry`, `notional`, `leverage` | Entry price, total size in USD, blended target leverage |
| `slices` | Number of slices |
| `band` | `0..1`, how far leverage is staggered across slices |
| `placement` | `"around"` or `"beyond"` |
| `sizeJitter` | `0..1`, size variation across slices |
| `seed` | Seed for the size variation. The same seed gives the same plan |
| `tiers`, `szDecimals` | The market's tiers (`tiersFor` from liq-math) and size decimals |

### Jitter levels

| Level | Timing | Child size noise | Slice order |
|---|---|---|---|
| `off` | evenly spaced | none | fixed rotation |
| `light` | evenly spaced ±40% of a step | ±20% | shuffled |
| `heavy` | uniformly random over the window | ±50% | shuffled |

## Tests

- **Identical to the app.** `test/fixtures/dapp-golden.json` holds plans, loan plans and schedules produced by
  the Mutexa app's own planner code for fixed inputs and seeds. The package must reproduce them exactly, so a
  plan saved with a seed stays the same.
- **Invariants on random inputs.** Slice notionals equal rounded sizes × entry and never exceed the total;
  "beyond" never puts a slice inside the single liquidation; "around" keeps total margin at notional ÷ target
  when nothing is capped; every slice is at or under its tier's max leverage; every loan is at or under max LTV;
  schedule child sizes add up to each slice and times stay inside the window; plans are deterministic per seed.

## How Mutexa uses it

The Mutexa app plans with this code in the planner, the lending page, the hedge view, the tracker's re-plan of
any public address, and scheduled paper runs. The linkability score of a plan is
[`@mutexa/linkability`](https://github.com/mutexa-labs/linkability).

## Limitations

- **Plans, not orders.** Nothing here signs, sends or funds anything.
- **Isolated margin only** for perps. Loans: one collateral and one debt asset, Aave-style max LTV and
  liquidation threshold.
- **Funding drift.** Liquidation prices are computed at entry. Funding changes isolated margin over time.
- **Rounding.** Sizes are rounded down to the size step, so the planned total can be slightly under the asked
  notional. The plan reports the real figures.
- **What splitting does not hide** (whitepaper §5.2): venues still see their own accounts; clustering by timing
  is still possible, and jitter makes it harder, not impossible; very large positions still move markets;
  splitting adds venue fills and privacy rails add their own fees and delays; fills routed with an integrator
  code are marked as Mutexa fills, so the cover is the set of all Mutexa users.

Not in this release: cross-margin slicing, multi-collateral loans, venue-specific order types.

## Stability

0.x: any change that alters a plan for the same input and seed is a minor version with a changelog entry.

## License

MIT © 2026 Mutexa
