import type { Action } from '@core/domain/actions';
import type { Item } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { LocationId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { renderOpenSelf } from '../templates';
import type { ActionOutcome } from './types';

/**
 * Open handler. Resolution rules (in order):
 *   - target not a container → Err.
 *   - already opened → no-op success ("The X is already open.").
 *   - locked + key held → silently unlock, then open. Render reflects unlock.
 *   - locked + key not held → Err ("The X is locked.").
 *   - otherwise → flip opened=true, narrate contents.
 *
 * Emits an Open event witnessed by everyone in the actor's room. Observers
 * never see the contents — the inspection is private to the opener.
 */
export async function handleOpen(
  action: Extract<Action, { kind: typeof ActionKind.Open }>,
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);

  if (!item.container) return Err(`You can't open the ${item.label}.`);

  if (item.opened) {
    const event = await emitOpenEvent(repo, action, item, view.location.id, false);
    return Ok({ render: [{ kind: SegmentKind.Feedback, text: `The ${item.label} is already open.` }], event });
  }

  let unlocked = false;
  if (item.locked) {
    const key = item.lockedByItem;
    const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
    const holdsKey = key !== null && inventory.some((i) => i.id === key);
    if (!holdsKey) return Err(`The ${item.label} is locked.`);
    await repo.setItemLocked(item.id, false);
    unlocked = true;
  }

  await repo.setItemOpened(item.id, true);
  const contents = await repo.itemsOwnedBy({ kind: OwnerKind.Item, id: item.id });
  const event = await emitOpenEvent(repo, action, item, view.location.id, unlocked);
  return Ok({ render: renderOpenSelf(item, contents, unlocked), event });
}

async function emitOpenEvent(
  repo: HandlerRepo,
  action: Extract<Action, { kind: typeof ActionKind.Open }>,
  item: Item,
  locationId: LocationId,
  unlocked: boolean,
): Promise<DomainEvent> {
  const witnesses = (await repo.agentsAt(locationId)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Open,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    unlocked,
  };
  await repo.appendEvent(event);
  return event;
}
