import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderTakeSelf } from '../templates';
import type { ActionOutcome } from './types';

export async function handleTake(
  action: Extract<Action, { kind: 'take' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);

  const carried = await repo.itemsOwnedBy({ kind: 'agent', id: action.actorId });
  const carriedWeight = carried.reduce((sum, i) => sum + i.weight, 0);
  if (carriedWeight + item.weight > view.actor.capacity) {
    return Err(`The ${item.label} is too heavy for you to carry right now.`);
  }

  await repo.transferItem(item.id, { kind: 'agent', id: action.actorId });
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'take',
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    from: view.location.id,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderTakeSelf(item), event });
}
