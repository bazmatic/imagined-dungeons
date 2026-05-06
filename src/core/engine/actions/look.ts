import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind } from '@core/domain/kinds';
import { Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderLook, renderLookTarget } from '../templates';
import type { ActionOutcome } from './types';

export async function handleLook(
  action: Extract<Action, { kind: 'look' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const baseEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    witnesses,
    createdAt: new Date(),
  };

  if (action.targetItemId === null) {
    const event: DomainEvent = {
      ...baseEvent,
      kind: EventKind.Look,
      locationId: view.location.id,
      targetItemId: null,
    };
    await repo.appendEvent(event);
    return Ok({ render: renderLook(view), event });
  }

  const item = await repo.getItem(action.targetItemId);
  const event: DomainEvent = {
    ...baseEvent,
    kind: EventKind.Look,
    locationId: view.location.id,
    targetItemId: item.id,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderLookTarget(item), event });
}
