/** Room for size variation: slices differ in size, so the count is sized for the total plus this share. */
export const DEFAULT_HEADROOM = 0.15;

/**
 * How many slices keep every slice under the caller's alert threshold (the position size at which the
 * caller assumes trackers and alert bots start to flag a wallet). The threshold is always an input:
 * there is no default, because it depends on the trackers the caller cares about.
 *
 * `headroom` is room for size variation (default 0.15, so the count is sized for 115% of the total).
 * `reachable` is false when more than `max` slices would be needed.
 */
export function alertSafeSlices(
  totalNotional: number,
  threshold: number,
  opts: { headroom?: number; max?: number } = {},
): { slices: number; reachable: boolean } {
  if (!(threshold > 0)) throw new RangeError("alertSafeSlices: threshold must be a positive number");
  const headroom = opts.headroom ?? DEFAULT_HEADROOM;
  const slices = Math.max(1, Math.ceil((Math.max(0, totalNotional) * (1 + headroom)) / threshold));
  return { slices, reachable: opts.max === undefined || slices <= opts.max };
}

/** Slices whose notional is above the threshold. */
export function slicesAbove(notionals: number[], threshold: number): number {
  return notionals.filter((x) => x > threshold).length;
}
