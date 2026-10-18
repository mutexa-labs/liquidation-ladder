// Execution scheduler: turns planned slices into child orders spread over a time window. Timing and size
// are drawn from a seeded RNG so a schedule is reproducible on a device:
//   off   evenly spaced, equal child sizes, slices in a fixed rotation
//   light evenly spaced with ±40% timing noise, ±20% size noise, shuffled slice order
//   heavy uniformly random times over the window, ±50% size noise, shuffled slice order

import { roundSize } from "@mutexa/liq-math";
import { scheduleRng } from "./rng";

export type Jitter = "off" | "light" | "heavy";

/** `at` is milliseconds from the start of the window. */
export type ScheduledOrder = { id: number; slice: number; at: number; size: number };

export type ScheduleInput = {
  slices: { index: number; size: number }[];
  windowMs: number;
  children: number; // child orders per slice
  jitter: Jitter;
  seed: number;
  szDecimals: number;
};

export function buildSchedule(x: ScheduleInput): ScheduledOrder[] {
  const r = scheduleRng(x.seed);
  const k = Math.max(1, Math.round(x.children));
  const sizeNoise = x.jitter === "heavy" ? 0.5 : x.jitter === "light" ? 0.2 : 0;

  // child sizes per slice, rounded to the market's size step; the last child takes the remainder
  const pieces: { slice: number; size: number }[] = [];
  for (const s of x.slices) {
    const w = Array.from({ length: k }, () => 1 + sizeNoise * (r() * 2 - 1));
    const sum = w.reduce((a, b) => a + b, 0);
    let left = s.size;
    w.forEach((wi, j) => {
      const size = j === k - 1 ? Number(left.toFixed(x.szDecimals)) : roundSize((s.size * wi) / sum, x.szDecimals);
      left -= size;
      if (size > 0) pieces.push({ slice: s.index, size });
    });
  }

  // order of execution: rotation for "off", shuffled otherwise
  let seq = pieces;
  if (x.jitter === "off") {
    const bySlice = new Map<number, typeof pieces>();
    for (const p of pieces) bySlice.set(p.slice, [...(bySlice.get(p.slice) ?? []), p]);
    seq = [];
    for (let j = 0; j < k; j++) for (const list of bySlice.values()) if (list[j]) seq.push(list[j]!);
  } else {
    seq = [...pieces];
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [seq[i], seq[j]] = [seq[j]!, seq[i]!];
    }
  }

  const n = seq.length;
  const W = Math.max(0, x.windowMs);
  const step = n > 1 ? W / (n - 1) : 0;
  let times: number[];
  if (x.jitter === "heavy") {
    times = Array.from({ length: n }, () => r() * W).sort((a, b) => a - b);
    if (n) times[0] = Math.min(times[0]!, W * 0.02);
  } else if (x.jitter === "light") {
    times = seq.map((_, i) => Math.min(W, Math.max(0, i * step + (r() * 2 - 1) * 0.4 * step))).sort((a, b) => a - b);
  } else {
    times = seq.map((_, i) => i * step);
  }
  return seq.map((p, i) => ({ id: i + 1, slice: p.slice, at: Math.round(times[i]!), size: p.size }));
}
