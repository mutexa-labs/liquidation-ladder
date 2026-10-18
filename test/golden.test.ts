// Golden plans: outputs of the Mutexa app's own planner code (src/shared/liq.ts, aave.ts and schedule.ts,
// app commit 9522120, 2026-10-18) for fixed inputs and seeds. This package must reproduce them exactly,
// so a seed saved on a device keeps producing the same plan after the app switches to this package.
import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  planLoans,
  planSlices,
  type LoanPlanInput,
  type PlanInput,
  type ScheduleInput,
} from "../src/index";
import golden from "./fixtures/dapp-golden.json" with { type: "json" };

type Case<I> = { name: string; input: I; output: unknown };

describe("identical to the app planner for fixed seeds", () => {
  it.each((golden.plans as Case<PlanInput>[]).map((c) => [c.name, c] as const))("planSlices: %s", (_, c) => {
    expect(planSlices(c.input)).toStrictEqual(c.output);
  });

  it.each((golden.loans as Case<LoanPlanInput>[]).map((c) => [c.name, c] as const))("planLoans: %s", (_, c) => {
    expect(planLoans(c.input)).toStrictEqual(c.output);
  });

  it.each((golden.schedules as Case<ScheduleInput>[]).map((c) => [c.name, c] as const))("buildSchedule: %s", (_, c) => {
    expect(buildSchedule(c.input)).toStrictEqual(c.output);
  });
});
