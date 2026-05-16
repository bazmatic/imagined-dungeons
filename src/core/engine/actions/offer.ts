import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { renderOfferSelf } from '../templates';
import type { ActionOutcome } from './types';

/**
 * Offer handler. Sets the priceTag on an item the actor is carrying so
 * that another actor can later attempt to `buy` it. Pure state mutation;
 * the side-channel `Speak` event lets nearby NPCs notice the quoted price.
 */
export async function handleOffer(
  action: Extract<Action, { kind: 'offer' }>,
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  if (!Number.isInteger(action.price) || action.price <= 0) {
    return Err('Price must be a positive whole number.');
  }
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);
  if (item.owner.kind !== OwnerKind.Agent || item.owner.id !== action.actorId) {
    return Err(`You aren't carrying the ${item.label}.`);
  }
  await repo.setItemPriceTag(item.id, action.price);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Speak,
    witnesses,
    createdAt: new Date(),
    targetAgentId: null,
    utterance: `I'll sell the ${item.label} for ${action.price} gold.`,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderOfferSelf(item, action.price), event });
}
