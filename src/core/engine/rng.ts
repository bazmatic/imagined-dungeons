/**
 * Seedable PRNG (Mulberry32).
 *
 * Pure, dependency-free, ~10 lines of math. Used to make combat outcomes
 * probabilistic while remaining fully reproducible: same seed in -> same
 * sequence out. The seed is part of the world state (see abstract-design §12).
 */

export interface Rng {
  /** Returns a float in [0, 1). Advances the seed. */
  next(): number;
  /** The current 32-bit seed. Read this to persist after a turn. */
  seed: number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    get seed() {
      return s;
    },
    set seed(v: number) {
      s = v >>> 0;
    },
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Roll [1..n] inclusive using the supplied rng. Returns 0 if n <= 0. */
export function rollD(rng: Rng, n: number): number {
  if (n <= 0) return 0;
  return 1 + Math.floor(rng.next() * n);
}
