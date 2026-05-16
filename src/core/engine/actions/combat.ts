import { AttackOutcome } from '@core/domain/kinds';
import { rollD, type Rng } from '../rng';

export interface CombatInput {
  readonly attackerDamage: number;
  readonly defenderHp: number;
  readonly defenderDefense: number;
  readonly rng: Rng;
}

export interface CombatResult {
  readonly outcome: AttackOutcome;
  readonly damageDealt: number;
  readonly defenderHpAfter: number;
  readonly defenderDied: boolean;
}

/**
 * Pure combat resolution: consumes RNG draws but touches no repo.
 * Callers are responsible for reading the seed before and persisting it after.
 */
export function resolveCombat(input: CombatInput): CombatResult {
  const { attackerDamage, defenderHp, defenderDefense, rng } = input;
  const total = attackerDamage + defenderDefense;
  const hit = total > 0 && rng.next() * total < attackerDamage;
  let damageDealt = 0;
  let outcome: AttackOutcome = AttackOutcome.Miss;
  if (hit) {
    outcome = AttackOutcome.Hit;
    damageDealt = rollD(rng, attackerDamage);
  }
  const defenderHpAfter = defenderHp - damageDealt;
  return { outcome, damageDealt, defenderHpAfter, defenderDied: hit && defenderHpAfter <= 0 };
}
