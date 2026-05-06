import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import type { ActionOutcome } from './types';

/**
 * Deterministic combat outcome.
 *
 * We compare the actor's `damage` to a threshold derived from the target's
 * `defense`. No randomness — the same inputs always produce the same result,
 * which keeps state transitions reproducible (per abstract-design §12).
 */
export function resolveAttackOutcome(actorDamage: number, targetDefense: number): 'hit' | 'miss' {
  return actorDamage >= Math.ceil(targetDefense / 4) ? 'hit' : 'miss';
}

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

  const outcome = resolveAttackOutcome(actor.damage, target.defense);
  if (outcome === 'hit') {
    await repo.setAgentHp(target.id, target.hp - actor.damage);
  }

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
  };
  // Placeholder render — runTurn replaces this with the actor's narration.
  return Ok({ render: '…', event });
}
