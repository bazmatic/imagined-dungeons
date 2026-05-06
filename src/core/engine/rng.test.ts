import { describe, expect, it } from 'vitest';
import { makeRng, rollD } from './rng';

describe('makeRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = makeRng(1);
    const b = makeRng(1);
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different first values for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    // Almost certainly all four differ.
    for (let i = 0; i < 4; i++) {
      expect(seqA[i]).not.toBe(seqB[i]);
    }
  });

  it('advances the seed across calls to next()', () => {
    const rng = makeRng(1);
    const before = rng.seed;
    rng.next();
    rng.next();
    rng.next();
    expect(rng.seed).not.toBe(before);
  });

  it('returns floats in [0, 1)', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('rollD', () => {
  it('returns an integer in [1, n] for positive n', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rollD(rng, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('returns 0 when n is 0', () => {
    const rng = makeRng(1);
    expect(rollD(rng, 0)).toBe(0);
  });

  it('returns 0 when n is negative', () => {
    const rng = makeRng(1);
    expect(rollD(rng, -3)).toBe(0);
  });

  it('produces the same rolls for the same seed', () => {
    const a = makeRng(99);
    const b = makeRng(99);
    const rollsA = [rollD(a, 10), rollD(a, 10), rollD(a, 10)];
    const rollsB = [rollD(b, 10), rollD(b, 10), rollD(b, 10)];
    expect(rollsA).toEqual(rollsB);
  });
});
