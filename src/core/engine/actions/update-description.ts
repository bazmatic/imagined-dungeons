import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import type { ItemId, LocationId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import type { Repository } from '../repository';
import type { ActionOutcome } from './types';

/**
 * Resolve an item to the location where it physically resides — chasing the
 * owner chain through any container items it may sit inside. If it's held by
 * an agent, return the agent's location. Returns `null` only if the chain is
 * malformed (e.g. an item-of-item cycle); witnesses then collapse to empty.
 */
async function locationOfItem(repo: Repository, itemId: ItemId): Promise<LocationId | null> {
  let current = await repo.getItem(itemId);
  // Bound the walk so a corrupt chain cannot loop forever.
  for (let i = 0; i < 32; i++) {
    if (current.owner.kind === OwnerKind.Location) return current.owner.id;
    if (current.owner.kind === OwnerKind.Agent) {
      const agent = await repo.getAgent(current.owner.id);
      return agent.locationId;
    }
    current = await repo.getItem(current.owner.id);
  }
  return null;
}

export async function handleUpdateDescription(
  action: Extract<Action, { kind: 'update_description' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  if (action.shortDescription === null && action.longDescription === null) {
    return Err('update_description requires at least one of shortDescription or longDescription.');
  }

  let shortBefore: string;
  let longBefore: string;
  let affectedLocationId: LocationId | null;

  switch (action.target.kind) {
    case OwnerKind.Location: {
      const loc = await repo.getLocation(action.target.id);
      shortBefore = loc.shortDescription;
      longBefore = loc.longDescription;
      affectedLocationId = loc.id;
      break;
    }
    case OwnerKind.Item: {
      const item = await repo.getItem(action.target.id);
      shortBefore = item.shortDescription;
      longBefore = item.longDescription;
      affectedLocationId = await locationOfItem(repo, item.id);
      break;
    }
    case OwnerKind.Agent: {
      const agent = await repo.getAgent(action.target.id);
      shortBefore = agent.shortDescription;
      longBefore = agent.longDescription;
      affectedLocationId = agent.locationId;
      break;
    }
  }

  const patch: { short?: string; long?: string } = {};
  if (action.shortDescription !== null) patch.short = action.shortDescription;
  if (action.longDescription !== null) patch.long = action.longDescription;

  switch (action.target.kind) {
    case OwnerKind.Location:
      await repo.updateLocationDescription(action.target.id, patch);
      break;
    case OwnerKind.Item:
      await repo.updateItemDescription(action.target.id, patch);
      break;
    case OwnerKind.Agent:
      await repo.updateAgentDescription(action.target.id, patch);
      break;
  }

  const witnesses = affectedLocationId
    ? (await repo.agentsAt(affectedLocationId)).map((a) => a.id)
    : [];

  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.DescriptionUpdated,
    witnesses,
    createdAt: new Date(),
    target: action.target,
    shortBefore: shortBefore,
    shortAfter: action.shortDescription ?? shortBefore,
    longBefore: longBefore,
    longAfter: action.longDescription ?? longBefore,
  };
  await repo.appendEvent(event);
  return Ok({ render: 'The description has been updated.', event });
}
