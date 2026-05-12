import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderEquipSelf, renderUnequipSelf } from '../templates';
import type { ActionOutcome } from './types';

/**
 * Equip handler. Requires the item to be in the actor's inventory and not
 * already equipped. Flips the runtime `equipped` flag and emits an Equip
 * event with the actor's `manner` phrase ("put on", "draw", "don") so the
 * narration is shaped by their words.
 */
export async function handleEquip(
  action: Extract<Action, { kind: 'equip' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);
  if (item.owner.kind !== OwnerKind.Agent || item.owner.id !== action.actorId) {
    return Err(`You aren't carrying the ${item.label}.`);
  }
  if (item.equipped) {
    return Err(`You already have the ${item.label} equipped.`);
  }
  await repo.setItemEquipped(item.id, true);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Equip,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    manner: action.manner,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderEquipSelf(item, action.manner), event });
}

export async function handleUnequip(
  action: Extract<Action, { kind: 'unequip' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);
  if (item.owner.kind !== OwnerKind.Agent || item.owner.id !== action.actorId) {
    return Err(`You aren't carrying the ${item.label}.`);
  }
  if (!item.equipped) {
    return Err(`The ${item.label} isn't equipped.`);
  }
  await repo.setItemEquipped(item.id, false);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Unequip,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    manner: action.manner,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderUnequipSelf(item, action.manner), event });
}
