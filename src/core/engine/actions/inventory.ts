import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import type { Repository } from '../repository';
import { renderInventory } from '../templates';
import type { ActionOutcome } from './types';

export async function handleInventory(
  action: Extract<Action, { kind: 'inventory' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Inventory,
    witnesses: [action.actorId],
    createdAt: new Date(),
  };
  await repo.appendEvent(event);
  return Ok({ render: renderInventory(inventory), event });
}
