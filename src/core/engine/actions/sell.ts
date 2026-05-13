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

export interface SellDeps {
  readonly llm: LanguageModel;
}

/**
 * Sell handler. Symmetric to handleBuy: the player (actor) is the seller,
 * and an NPC consents (or refuses) to buy. Deterministic preconditions run
 * first; then `tradeDecide` asks the NPC's persona to consent. On accept the
 * gold and item swap atomically and the priceTag clears; on refusal no state
 * changes. A Trade event is emitted in both cases.
 */
export async function handleSell(
  action: Extract<Action, { kind: typeof ActionKind.Sell }>,
  repo: Repository,
  deps: SellDeps,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const seller = view.actor;
  const buyer = await repo.getAgent(action.buyerId);
  const item = await repo.getItem(action.itemId);

  if (buyer.locationId !== view.location.id) {
    return Err(`${buyer.label} isn't here.`);
  }
  if (item.owner.kind !== OwnerKind.Agent || item.owner.id !== seller.id) {
    return Err(`You aren't carrying the ${item.label}.`);
  }
  if (item.priceTag === null || item.priceTag <= 0) {
    return Err(`You haven't priced the ${item.label}. Use 'offer ${item.label} for <N> gold' first.`);
  }
  const price = item.priceTag;
  if (buyer.gold < price) {
    return Err(`${buyer.label} only has ${buyer.gold} gold.`);
  }

  const decision = await tradeDecide(
    { buyer, seller, item, price, direction: TradeDirection.Sell },
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
    actorId: seller.id,
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
