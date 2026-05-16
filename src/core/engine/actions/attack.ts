import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { makeRng } from '../rng';
import { resolveCombat } from './combat';
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
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const actor = view.actor;
  const target = await repo.getAgent(action.targetAgentId);
  if (target.locationId !== view.location.id) {
    return Err(`${target.label} isn't here.`);
  }

  const seed = await repo.getRngSeed();
  const rng = makeRng(seed);

  const combat = resolveCombat({
    attackerDamage: actor.damage,
    defenderHp: target.hp,
    defenderDefense: target.defense,
    rng,
  });
  const { outcome, damageDealt } = combat;

  if (combat.outcome === 'hit') {
    await repo.setAgentHp(target.id, combat.defenderHpAfter);
  }

  await repo.setRngSeed(rng.seed);

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const worldId = await repo.getWorldId();
  const event: DomainEvent = {
    id: nextEventId(),
    worldId,
    actorId: action.actorId,
    kind: EventKind.Attack,
    witnesses,
    createdAt: new Date(),
    targetAgentId: action.targetAgentId,
    outcome,
    damageDealt,
  };

  // If the target is killed, drop their inventory and emit a Death event.
  if (combat.defenderDied) {
    const targetItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: target.id });
    for (const item of targetItems) {
      await repo.transferItem(item.id, { kind: OwnerKind.Location, id: view.location.id });
    }
    const deathEvent: DomainEvent = {
      id: nextEventId(),
      worldId,
      actorId: action.actorId,
      kind: EventKind.Death,
      witnesses,
      createdAt: new Date(),
      targetAgentId: action.targetAgentId,
      locationId: view.location.id,
    };
    await repo.appendEvent(deathEvent);
  }

  const render: Segment[] = [];
  if (outcome === 'hit') {
    render.push({ kind: SegmentKind.Hit, text: `You hit ${target.label} for ${damageDealt} damage.` });
    if (combat.defenderDied) {
      render.push({ kind: SegmentKind.Death, text: `${target.label} is slain!` });
    }
  } else {
    render.push({ kind: SegmentKind.Miss, text: `You miss ${target.label}.` });
  }

  return Ok({ render, event });
}
