// Seeded Park–Miller (minimal standard) generator. Plans are reproducible on a device for a given seed.
//
// Two seed mixes are kept exactly as the Mutexa app has used them, so existing seeds produce the same
// plans: the planners use the seed as given, the scheduler mixes it first (seed · 7919 + 13).

const MOD = 2147483647;

function parkMiller(start: number): () => number {
  let s = start % MOD || 1;
  return () => (s = (s * 16807) % MOD) / MOD;
}

/** Generator used by planSlices and planLoans. */
export function rng(seed: number): () => number {
  return parkMiller(Math.floor(Math.abs(seed)));
}

/** Generator used by buildSchedule. */
export function scheduleRng(seed: number): () => number {
  return parkMiller(Math.floor(Math.abs(seed * 7919 + 13)));
}
