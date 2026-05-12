import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import type { Repository } from '../repository';
import { renderRevealObserved } from '../templates';
import type { ActionOutcome } from './types';

/**
 * System-only handler. The consequence engine emits this when it judges
 * that a previously-hidden item should now be visible (e.g. the player
 * broke open a chest, knocked over a tapestry, dislodged a floorboard).
 * Flips the item's `hidden` flag to false and emits a Reveal event so
 * everyone in the item's location sees the discovery this turn.
 */
export async function handleRevealItem(
  action: Extract<Action, { kind: 'reveal_item' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const item = await repo.getItem(action.itemId);
  // No-op if already visible — keeps the handler idempotent.
  if (!item.hidden) {
    return Err(`The ${item.label} is already visible.`);
  }
  // Locate the item to set witnesses. Only items owned by a location have a
  // natural in-room reveal; held items would emit through their owner.
  if (item.owner.kind !== OwnerKind.Location) {
    return Err(`Cannot reveal ${item.label}: not held by a location.`);
  }
  const locationId = item.owner.id;
  await repo.setItemHidden(item.id, false);
  const witnesses = (await repo.agentsAt(locationId)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Reveal,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    locationId,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderRevealObserved(item), event });
}
