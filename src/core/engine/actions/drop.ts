import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import type { Repository } from '../repository';
import { renderDropSelf } from '../templates';
import type { ActionOutcome } from './types';

export async function handleDrop(
  action: Extract<Action, { kind: 'drop' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const actor = await repo.getAgent(action.actorId);
  const item = await repo.getItem(action.itemId);

  await repo.transferItem(item.id, { kind: 'location', id: actor.locationId });
  const witnesses = (await repo.agentsAt(actor.locationId)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'drop',
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    to: actor.locationId,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderDropSelf(item), event });
}
