import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import type { Repository } from '../repository';
import { renderGiveSelf } from '../templates';
import type { ActionOutcome } from './types';

/**
 * Hand a carried item to another agent in the same room.
 *
 * Preconditions:
 *   - the actor is currently the item's owner (i.e. carrying it),
 *   - the recipient is co-located with the actor (gangplanks and walls don't
 *     count — you can only hand things to people physically present),
 *   - the recipient isn't the actor (giving to yourself is a no-op error).
 *
 * Postcondition:
 *   - the item's owner becomes the recipient.
 */
export async function handleGive(
  action: Extract<Action, { kind: 'give' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const actor = await repo.getAgent(action.actorId);
  const recipient = await repo.getAgent(action.targetAgentId);
  const item = await repo.getItem(action.itemId);

  if (recipient.id === actor.id) {
    return Err("You can't give something to yourself.");
  }
  if (recipient.locationId !== actor.locationId) {
    return Err(`${recipient.label} isn't here.`);
  }
  if (item.owner.kind !== OwnerKind.Agent || item.owner.id !== actor.id) {
    return Err(`You aren't carrying ${item.label}.`);
  }

  await repo.transferItem(item.id, { kind: OwnerKind.Agent, id: recipient.id });
  const witnesses = (await repo.agentsAt(actor.locationId)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Give,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    targetAgentId: recipient.id,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderGiveSelf(item, recipient), event });
}
