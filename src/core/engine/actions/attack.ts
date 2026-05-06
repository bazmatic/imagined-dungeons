import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { makeRng, rollD } from '../rng';
import type { ActionOutcome } from './types';

/**
 * Probabilistic combat outcome, deterministic given the world's RNG seed.
 *
 * - To-hit: draw `roll = rng.next() * (damage + defense)`. Hit iff `roll < damage`.
 *   That gives a hit probability of `damage / (damage + defense)`.
 * - Damage on hit: uniform integer in [1, actor.damage] (rollD).
 *
 * State transitions stay reproducible (abstract-design §12) because the seed
 * is part of world state — same seed + same inputs -> same outcome. The seed
 * is advanced and persisted after every attack.
 */
export async function handleAttack(
  action: Extract<Action, { kind: 'attack' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const actor = view.actor;
  const target = await repo.getAgent(action.targetAgentId);
  if (target.locationId !== view.location.id) {
    return Err(`${target.label} isn't here.`);
  }

  const seed = await repo.getRngSeed();
  const rng = makeRng(seed);

  const total = actor.damage + target.defense;
  const hit = total > 0 && rng.next() * total < actor.damage;
  let damageDealt = 0;
  let outcome: 'hit' | 'miss' = 'miss';
  if (hit) {
    outcome = 'hit';
    damageDealt = rollD(rng, actor.damage);
    await repo.setAgentHp(target.id, target.hp - damageDealt);
  }

  await repo.setRngSeed(rng.seed);

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'attack',
    witnesses,
    createdAt: new Date(),
    targetAgentId: action.targetAgentId,
    outcome,
    damageDealt,
  };
  // Placeholder render — runTurn replaces this with the actor's narration.
  return Ok({ render: '…', event });
}
