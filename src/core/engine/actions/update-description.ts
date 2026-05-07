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

/**
 * Translate the action-level convention ("null = leave unchanged, '' = clear")
 * into the repo-level convention ("undefined = skip, null = clear"). Used for
 * the new agent-only mood and shortTermIntent fields.
 */
function actionToRepoNullable(value: string | null): string | null | undefined {
  if (value === null) return undefined; // leave unchanged
  if (value === '') return null; // explicitly clear
  return value;
}

export async function handleUpdateDescription(
  action: Extract<Action, { kind: 'update_description' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  // For agent targets, an update may be purely mood/intent — descriptions can
  // both be null and the action is still meaningful. For location/item, we
  // still require at least one of the descriptions.
  const isAgent = action.target.kind === OwnerKind.Agent;
  const moodChanging = isAgent && action.mood !== null;
  const intentChanging = isAgent && action.shortTermIntent !== null;
  if (
    action.shortDescription === null &&
    action.longDescription === null &&
    !moodChanging &&
    !intentChanging
  ) {
    return Err(
      'update_description requires at least one of shortDescription, longDescription, mood, or shortTermIntent.',
    );
  }

  let shortBefore: string;
  let longBefore: string;
  let moodBefore: string | null = null;
  let shortTermIntentBefore: string | null = null;
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
      moodBefore = agent.mood;
      shortTermIntentBefore = agent.shortTermIntent;
      affectedLocationId = agent.locationId;
      break;
    }
  }

  switch (action.target.kind) {
    case OwnerKind.Location: {
      const patch: { short?: string; long?: string } = {};
      if (action.shortDescription !== null) patch.short = action.shortDescription;
      if (action.longDescription !== null) patch.long = action.longDescription;
      await repo.updateLocationDescription(action.target.id, patch);
      break;
    }
    case OwnerKind.Item: {
      const patch: { short?: string; long?: string } = {};
      if (action.shortDescription !== null) patch.short = action.shortDescription;
      if (action.longDescription !== null) patch.long = action.longDescription;
      await repo.updateItemDescription(action.target.id, patch);
      break;
    }
    case OwnerKind.Agent: {
      const patch: {
        short?: string;
        long?: string;
        mood?: string | null;
        shortTermIntent?: string | null;
      } = {};
      if (action.shortDescription !== null) patch.short = action.shortDescription;
      if (action.longDescription !== null) patch.long = action.longDescription;
      const moodPatch = actionToRepoNullable(action.mood);
      if (moodPatch !== undefined) patch.mood = moodPatch;
      const intentPatch = actionToRepoNullable(action.shortTermIntent);
      if (intentPatch !== undefined) patch.shortTermIntent = intentPatch;
      await repo.updateAgentDescription(action.target.id, patch);
      break;
    }
  }

  const witnesses = affectedLocationId
    ? (await repo.agentsAt(affectedLocationId)).map((a) => a.id)
    : [];

  // Compute "after" values mirroring the repo write semantics.
  const moodAfter =
    isAgent && action.mood !== null ? (action.mood === '' ? null : action.mood) : moodBefore;
  const shortTermIntentAfter =
    isAgent && action.shortTermIntent !== null
      ? action.shortTermIntent === ''
        ? null
        : action.shortTermIntent
      : shortTermIntentBefore;

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
    moodBefore,
    moodAfter,
    shortTermIntentBefore,
    shortTermIntentAfter,
  };
  await repo.appendEvent(event);
  return Ok({ render: 'The description has been updated.', event });
}
