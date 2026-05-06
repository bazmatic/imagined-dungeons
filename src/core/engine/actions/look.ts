import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { resolveItem } from '../parser';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderLook, renderLookTarget, renderParseError } from '../templates';
import type { ActionOutcome } from './types';

export async function handleLook(
  action: Extract<Action, { kind: 'look' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: action.actorId });
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const baseEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    witnesses,
    createdAt: new Date(),
  };

  if (action.targetRef === null) {
    const event: DomainEvent = {
      ...baseEvent,
      kind: 'look',
      locationId: view.location.id,
      targetItemId: null,
    };
    await repo.appendEvent(event);
    return Ok({ render: renderLook(view), event });
  }

  const candidates = [...view.items, ...inventory];
  const r = resolveItem(action.targetRef, candidates);
  if (!r.ok) return Err(renderParseError(r.error));
  const event: DomainEvent = {
    ...baseEvent,
    kind: 'look',
    locationId: view.location.id,
    targetItemId: r.item.id,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderLookTarget(r.item), event });
}
