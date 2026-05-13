import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import type { LanguageModel } from '../language-model';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderTradeSelf } from '../templates';
import { TradeDirection, tradeDecide } from '../trade-decide';
import type { ActionOutcome } from './types';

export interface BuyDeps {
  readonly llm: LanguageModel;
}

/**
 * Buy handler. The player (actor) buys an item from an NPC seller. Runs
 * deterministic preconditions, then asks the seller's persona (via
 * `tradeDecide`) whether to consent. On accept it atomically swaps gold,
 * transfers item ownership to the buyer, and clears the priceTag; on refusal
 * no state changes. A Trade event is emitted in both cases.
 */
export async function handleBuy(
  action: Extract<Action, { kind: typeof ActionKind.Buy }>,
  repo: Repository,
  deps: BuyDeps,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const buyer = view.actor;
  const seller = await repo.getAgent(action.sellerId);
  const item = await repo.getItem(action.itemId);

  if (seller.locationId !== view.location.id) {
    return Err(`${seller.label} isn't here.`);
  }
  if (item.owner.kind !== OwnerKind.Agent || item.owner.id !== seller.id) {
    return Err(`${seller.label} doesn't have the ${item.label}.`);
  }
  if (item.priceTag === null || item.priceTag <= 0) {
    return Err(`The ${item.label} is not for sale.`);
  }
  const price = item.priceTag;
  if (buyer.gold < price) {
    return Err(
      `You can't afford it — you have ${buyer.gold} gold and ${seller.label} wants ${price}.`,
    );
  }

  const decision = await tradeDecide(
    { buyer, seller, item, price, direction: TradeDirection.Buy },
    deps.llm,
  );

  if (decision.accept) {
    await repo.setAgentGold(buyer.id, buyer.gold - price);
    await repo.setAgentGold(seller.id, seller.gold + price);
    await repo.transferItem(item.id, { kind: OwnerKind.Agent, id: buyer.id });
    await repo.setItemPriceTag(item.id, null);
  }

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: buyer.id,
    kind: EventKind.Trade,
    buyerId: buyer.id,
    sellerId: seller.id,
    itemId: item.id,
    price,
    accepted: decision.accept,
    witnesses,
    createdAt: new Date(),
  };
  await repo.appendEvent(event);

  return Ok({
    render: renderTradeSelf(buyer, seller, item, price, decision.accept, decision.narration),
    event,
  });
}
