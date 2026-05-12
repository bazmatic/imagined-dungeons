import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import { DiscoveryTriggerKind } from '@core/domain/builder-kinds';
import type {
  DiscoveryRequest,
  UpsertAgentInput,
  UpsertItemInput,
} from '@core/domain/builder-types';
import type { Item } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import {
  type AgentId,
  type ItemId,
  type LocationId,
  type WorldId,
  asAgentId,
  asItemId,
  asLocationId,
} from '@core/domain/ids';
import { EventKind, ExaminableKind, OwnerKind } from '@core/domain/kinds';
import { Ok, type Result } from '@core/domain/result';
import { loadLoreContext } from '@core/lore/context';
import { runDiscovery } from '../discovery';
import { nextEventId } from '../ids-gen';
import type { LanguageModel } from '../language-model';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderLookAgent, renderLookTarget } from '../templates';
import type { ActionOutcome } from './types';

export interface SearchDeps {
  readonly llm: LanguageModel;
  readonly builderRepo: BuilderRepository;
  readonly worldId: WorldId;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const OWNER_KINDS: ReadonlySet<string> = new Set<string>(Object.values(OwnerKind));

/**
 * Defensive coercion: the discovery LLM may return objects that *look* like
 * `UpsertItemInput` but with missing or wrongly-typed fields. We validate
 * here rather than at the boundary because validation depends on the engine's
 * branding helpers and (eventually) the world id. Returns `null` if the input
 * is unusable — the caller silently drops the spawn and proceeds with the
 * narration event.
 */
function coerceSpawnedItem(raw: unknown): UpsertItemInput | null {
  if (!isRecord(raw)) return null;
  const { id, label, shortDescription, longDescription, ownerKind, ownerId } = raw;
  if (
    !isString(id) ||
    id.length === 0 ||
    !isString(label) ||
    label.length === 0 ||
    !isString(shortDescription) ||
    !isString(longDescription) ||
    !isString(ownerKind) ||
    !OWNER_KINDS.has(ownerKind) ||
    !isString(ownerId)
  ) {
    return null;
  }
  const tags = Array.isArray(raw.tags) ? raw.tags.filter(isString) : [];
  return {
    id: asItemId(id),
    label,
    shortDescription,
    longDescription,
    ownerKind: ownerKind as UpsertItemInput['ownerKind'],
    ownerId,
    weight: typeof raw.weight === 'number' ? raw.weight : 0,
    hidden: typeof raw.hidden === 'boolean' ? raw.hidden : false,
    tags,
  };
}

function coerceSpawnedAgent(raw: unknown): UpsertAgentInput | null {
  if (!isRecord(raw)) return null;
  const { id, label, shortDescription, longDescription, locationId } = raw;
  if (
    !isString(id) ||
    id.length === 0 ||
    !isString(label) ||
    label.length === 0 ||
    !isString(shortDescription) ||
    !isString(longDescription) ||
    !isString(locationId) ||
    locationId.length === 0
  ) {
    return null;
  }
  const tags = Array.isArray(raw.tags) ? raw.tags.filter(isString) : [];
  return {
    id: asAgentId(id),
    label,
    shortDescription,
    longDescription,
    locationId: asLocationId(locationId),
    hp: typeof raw.hp === 'number' ? raw.hp : 0,
    damage: typeof raw.damage === 'number' ? raw.damage : 0,
    defense: typeof raw.defense === 'number' ? raw.defense : 0,
    capacity: typeof raw.capacity === 'number' ? raw.capacity : 0,
    mood: isString(raw.mood) ? raw.mood : null,
    goal: isString(raw.goal) ? raw.goal : null,
    autonomous: typeof raw.autonomous === 'boolean' ? raw.autonomous : false,
    tags,
  };
}

const findItemById = (items: readonly Item[], id: ItemId): Item | null =>
  items.find((it) => it.id === id) ?? null;

/**
 * Generative-discovery handler — Lore & Generative Discovery §Task 13.
 *
 * Builds a `DiscoveryRequest` from the current perception + world lore, calls
 * the discovery LLM, and:
 *   - if the LLM returned a matchedItemId / matchedAgentId that resolves
 *     against the visible list, routes through the standard look-render path
 *     (the player sees the entity's authored description);
 *   - if the LLM returned a `spawnedItem` / `spawnedAgent`, persists it via
 *     the builder port (validation failures are silently dropped) and uses
 *     the LLM's narration as the render;
 *   - otherwise emits a flavour-only Look event with the LLM's narration.
 *
 * Like `handleLook`, the resulting Look event is *not* narrated by the
 * Narrator — Look is excluded from `NARRATED_EVENT_KINDS`. Handler persists
 * the event itself.
 */
export async function handleSearch(
  action: Extract<Action, { kind: 'search' }>,
  repo: Repository,
  deps: SearchDeps,
): Promise<Result<ActionOutcome, string>> {
  const { llm, builderRepo, worldId } = deps;
  const view = await perceive(action.actorId, repo);
  const locationId: LocationId = view.location.id;
  const witnesses: readonly AgentId[] = view.agents.map((a) => a.id).concat(action.actorId);

  // Hidden items at this location are NOT in view.items (perceive filters
  // them). We still surface them to the discovery LLM under a separate
  // 'undiscovered' list so a careful search query can match — and when it
  // does, the match path below flips hidden=false to reveal them.
  const allItemsHere = await repo.itemsOwnedBy({ kind: OwnerKind.Location, id: locationId });
  const undiscoveredItems = allItemsHere.filter((i) => i.hidden);

  // Lore context is built from the current location's tags. Search has no
  // subject (it's a sweep of the room), so `subject` is null on the request.
  const loreContext = await loadLoreContext(builderRepo, repo, worldId, {
    tags: [],
    locationId,
  });
  const request: DiscoveryRequest = {
    trigger: DiscoveryTriggerKind.Search,
    actorId: action.actorId,
    locationId,
    query: action.query,
    subject: null,
    loreContext,
    visibleItems: view.items,
    visibleAgents: view.agents,
    undiscoveredItems,
  };

  const response = await runDiscovery(request, llm);

  const baseEvent = {
    id: nextEventId(),
    worldId,
    actorId: action.actorId,
    witnesses,
    createdAt: new Date(),
  };

  // 1. MATCH item — accept a match against the visible list OR against the
  // undiscovered (hidden) list at this location. A hidden match triggers a
  // reveal: we flip hidden=false so the item shows up in perception going
  // forward, and route through the normal look path to render its
  // description right now.
  if (response.matchedItemId !== null) {
    const matchedVisible = findItemById(view.items, response.matchedItemId);
    if (matchedVisible) {
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId,
        target: { kind: ExaminableKind.Item, id: matchedVisible.id },
      };
      await repo.appendEvent(event);
      return Ok({ render: renderLookTarget(matchedVisible), event });
    }
    const matchedHidden = findItemById(undiscoveredItems, response.matchedItemId);
    if (matchedHidden) {
      await repo.setItemHidden(matchedHidden.id, false);
      const revealed: Item = { ...matchedHidden, hidden: false };
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId,
        target: { kind: ExaminableKind.Item, id: revealed.id },
      };
      await repo.appendEvent(event);
      return Ok({ render: renderLookTarget(revealed), event });
    }
    // Hallucinated id — silently fall through to narration.
  }

  // 2. MATCH agent — same visibility check.
  if (response.matchedAgentId !== null) {
    const matchedAgent = view.agents.find((a) => a.id === response.matchedAgentId);
    if (matchedAgent) {
      const event: DomainEvent = {
        ...baseEvent,
        kind: EventKind.Look,
        locationId,
        target: { kind: ExaminableKind.Agent, id: matchedAgent.id },
      };
      await repo.appendEvent(event);
      return Ok({ render: renderLookAgent(matchedAgent), event });
    }
  }

  // 3. SPAWN ITEM — validate then persist; drop silently on bad shape.
  if (response.spawnedItem !== null) {
    const item = coerceSpawnedItem(response.spawnedItem);
    if (item) {
      try {
        await builderRepo.upsertItem(worldId, item);
      } catch {
        // Persistence failure shouldn't crash the turn — narration still
        // describes the item, the next reconciliation will catch the drift.
      }
    }
  }

  // 4. SPAWN AGENT — validate then persist; drop silently on bad shape.
  if (response.spawnedAgent !== null) {
    const agent = coerceSpawnedAgent(response.spawnedAgent);
    if (agent) {
      try {
        await builderRepo.upsertAgent(worldId, agent);
      } catch {
        // see above
      }
    }
  }

  // 5. NARRATE / spawn fallback render — flavour-only Look event.
  const event: DomainEvent = {
    ...baseEvent,
    kind: EventKind.Look,
    locationId,
    target: { kind: ExaminableKind.Room },
  };
  await repo.appendEvent(event);
  return Ok({ render: response.narration, event });
}
