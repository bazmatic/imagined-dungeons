import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderMoveSelf } from '../templates';
import type { ActionOutcome } from './types';

export async function handleMove(
  action: Extract<Action, { kind: 'move' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const exit = view.exits.find((e) => e.direction === action.direction);
  if (!exit) return Err("You can't go that way.");
  if (exit.locked) {
    const keyId = exit.lockedByItem;
    if (keyId === null) return Err(`The ${exit.label} is locked.`);
    const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
    const holdsKey = inventory.some((i) => i.id === keyId);
    if (!holdsKey) return Err(`The ${exit.label} is locked.`);
    await repo.setExitLocked(exit.id, false);
  }

  await repo.moveAgent(action.actorId, exit.to);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Move,
    witnesses,
    createdAt: new Date(),
    from: view.location.id,
    to: exit.to,
    direction: action.direction,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderMoveSelf(action.direction), event });
}
