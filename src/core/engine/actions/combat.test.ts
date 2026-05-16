import { AttackOutcome } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { resolveCombat } from './combat';

describe('resolveCombat', () => {
  it('misses when roll exceeds the hit threshold', () => {
    // seed=1 first draw ~0.627; threshold = damage/(damage+defense) = 10/20 = 0.5 → miss
    const result = resolveCombat({ attackerDamage: 10, defenderHp: 10, defenderDefense: 10, rng: makeRng(1) });
    expect(result.outcome).toBe(AttackOutcome.Miss);
    expect(result.damageDealt).toBe(0);
    expect(result.defenderHpAfter).toBe(10);
    expect(result.defenderDied).toBe(false);
  });

  it('hits when attacker damage dwarfs defense', () => {
    // damage=50, defense=4 → threshold ~0.926; seed=1 first draw ~0.627 < 0.926 → hit
    const result = resolveCombat({ attackerDamage: 50, defenderHp: 10, defenderDefense: 4, rng: makeRng(1) });
    expect(result.outcome).toBe(AttackOutcome.Hit);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(result.defenderHpAfter).toBe(10 - result.damageDealt);
  });

  it('marks defenderDied when hp reaches zero', () => {
    const result = resolveCombat({ attackerDamage: 50, defenderHp: 1, defenderDefense: 1, rng: makeRng(1) });
    if (result.outcome === AttackOutcome.Hit) {
      expect(result.defenderDied).toBe(result.defenderHpAfter <= 0);
    }
  });

  it('defenderDied is false on a miss even if hp is 1', () => {
    const result = resolveCombat({ attackerDamage: 1, defenderHp: 1, defenderDefense: 100, rng: makeRng(1) });
    expect(result.outcome).toBe(AttackOutcome.Miss);
    expect(result.defenderDied).toBe(false);
  });

  it('damage is capped by attacker damage stat (rollD upper bound)', () => {
    const attackerDamage = 5;
    for (let seed = 0; seed < 50; seed++) {
      const result = resolveCombat({ attackerDamage, defenderHp: 100, defenderDefense: 0, rng: makeRng(seed) });
      if (result.outcome === AttackOutcome.Hit) {
        expect(result.damageDealt).toBeGreaterThanOrEqual(1);
        expect(result.damageDealt).toBeLessThanOrEqual(attackerDamage);
      }
    }
  });

  it('produces identical results given the same seed (pure / deterministic)', () => {
    const run = () => resolveCombat({ attackerDamage: 7, defenderHp: 20, defenderDefense: 3, rng: makeRng(42) });
    expect(run()).toEqual(run());
  });

  it('returns Miss with zero damage when both damage and defense are 0', () => {
    const result = resolveCombat({ attackerDamage: 0, defenderHp: 5, defenderDefense: 0, rng: makeRng(1) });
    expect(result.outcome).toBe(AttackOutcome.Miss);
    expect(result.damageDealt).toBe(0);
  });
});
