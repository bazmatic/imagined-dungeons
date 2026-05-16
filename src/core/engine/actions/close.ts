import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { ActionKind, EventKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { renderCloseSelf } from '../templates';
import type { ActionOutcome } from './types';

/**
 * Close handler. Flips opened=false. Idempotent: closing an already-closed
 * container is a no-op success ("The X is already closed."). Always emits a
 * Close event for witnesses in the actor's room.
 */
export async function handleClose(
  action: Extract<Action, { kind: typeof ActionKind.Close }>,
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);
  if (!item.container) return Err(`You can't close the ${item.label}.`);

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const baseEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Close,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
  } as const;

  if (!item.opened) {
    const event: DomainEvent = baseEvent;
    await repo.appendEvent(event);
    return Ok({ render: [{ kind: SegmentKind.Feedback, text: `The ${item.label} is already closed.` }], event });
  }
  await repo.setItemOpened(item.id, false);
  const event: DomainEvent = baseEvent;
  await repo.appendEvent(event);
  return Ok({ render: renderCloseSelf(item), event });
}
