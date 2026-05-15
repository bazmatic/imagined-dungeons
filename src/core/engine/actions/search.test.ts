import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, ExaminableKind, OwnerKind } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../../tests/helpers/fake-language-model';
import { handleSearch } from './search';

const W = asWorldId('w');
const A = asLocationId('loc_a');

const loc: Location = {
  id: A,
  worldId: W,
  label: 'The Goblet',
  shortDescription: 'a tavern',
  longDescription: 'A dim tavern.',
  tags: ['tavern'],
  secretDescription: '',
};

const paff: Agent = {
  id: asAgentId('char_p'),
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 0,
  defense: 0,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: 'a glowing map',
  longDescription: 'A real-time map of fire.',
  owner: { kind: OwnerKind.Location, id: A },
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
};

const makeRepos = (items: Item[] = [], agents: Agent[] = [paff]) => {
  const engine = new MemoryRepository(W, {
    locations: [loc],
    exits: [],
    items,
    agents,
  });
  const builder = new MemoryBuilderRepository();
  return { engine, builder };
};

describe('handleSearch', () => {
  it('flavour-only narration → emits a Look event with the narration and no spawns', async () => {
    const { engine, builder } = makeRepos();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'A spider scuttles into a crack.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const r = await handleSearch(
      { kind: ActionKind.Search, actorId: paff.id, query: 'dusty corner' },
      engine,
      { llm, builderRepo: builder, worldId: W },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render[0]?.text).toBe('A spider scuttles into a crack.');
    expect(r.value.event.kind).toBe(EventKind.Look);
    expect((await builder.listItems(W)).length).toBe(0);
    expect((await builder.listAgents(W)).length).toBe(0);
  });

  it('spawnedItem in response → persists via builderRepo.upsertItem', async () => {
    const { engine, builder } = makeRepos();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'You find a tarnished coin under the bench.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: {
            id: 'item_coin',
            label: 'tarnished coin',
            shortDescription: 'a tarnished coin',
            longDescription: 'A small, tarnished copper coin.',
            ownerKind: OwnerKind.Location,
            ownerId: A,
            weight: 1,
            hidden: false,
            tags: ['treasure'],
            equipped: false,
            container: false,
            opened: true,
            locked: false,
            lockedByItem: null,
            priceTag: null,
          },
          spawnedAgent: null,
        },
      }),
    });
    const r = await handleSearch(
      { kind: ActionKind.Search, actorId: paff.id, query: 'under the bench' },
      engine,
      { llm, builderRepo: builder, worldId: W },
    );
    if (!r.ok) throw new Error(r.error);
    const items = await builder.listItems(W);
    expect(items.length).toBe(1);
    expect(items[0]?.label).toBe('tarnished coin');
    expect(r.value.render.some((s) => s.text.includes('tarnished coin'))).toBe(true);
  });

  it('matchedItemId for a visible authored item → narration includes the authored description', async () => {
    const { engine, builder } = makeRepos([map]);
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'IGNORED',
          matchedItemId: map.id,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const r = await handleSearch(
      { kind: ActionKind.Search, actorId: paff.id, query: 'glowing map' },
      engine,
      { llm, builderRepo: builder, worldId: W },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render.some((s) => s.text.includes('A real-time map of fire.'))).toBe(true);
    expect(r.value.event.kind).toBe(EventKind.Look);
    // Event target is the matched item.
    if (r.value.event.kind === EventKind.Look) {
      expect(r.value.event.target.kind).toBe(ExaminableKind.Item);
    }
    // No spawn occurred.
    expect((await builder.listItems(W)).length).toBe(0);
  });

  it('malformed spawnedItem (empty id) → silently dropped, narration still emitted, no throw', async () => {
    const { engine, builder } = makeRepos();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'A breeze whispers past — but nothing tangible.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: {
            // Empty id fails coerceSpawnedItem's required-field check.
            id: '',
            label: 'phantom',
            shortDescription: 's',
            longDescription: 'l',
            ownerKind: OwnerKind.Location,
            ownerId: A,
            weight: 0,
            hidden: false,
            tags: [],
            equipped: false,
            container: false,
            opened: true,
            locked: false,
            lockedByItem: null,
            priceTag: null,
          },
          spawnedAgent: null,
        },
      }),
    });
    const r = await handleSearch(
      { kind: ActionKind.Search, actorId: paff.id, query: 'curtains' },
      engine,
      { llm, builderRepo: builder, worldId: W },
    );
    if (!r.ok) throw new Error(r.error);
    // Narration still surfaces.
    expect(r.value.render[0]?.text).toBe('A breeze whispers past — but nothing tangible.');
    expect(r.value.event.kind).toBe(EventKind.Look);
    // The malformed spawn was silently dropped — nothing persisted.
    expect((await builder.listItems(W)).length).toBe(0);
  });

  it('matchedItemId for a hidden item → reveals it and renders a "newly revealed" message alongside the description', async () => {
    const hiddenMap: Item = { ...map, hidden: true };
    const { engine, builder } = makeRepos([hiddenMap]);
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'IGNORED',
          matchedItemId: hiddenMap.id,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const r = await handleSearch(
      { kind: ActionKind.Search, actorId: paff.id, query: 'behind the bar' },
      engine,
      { llm, builderRepo: builder, worldId: W },
    );
    if (!r.ok) throw new Error(r.error);
    // Player gets a signal that the item was just revealed, not merely examined.
    expect(r.value.render.some((s) => s.text.includes("hadn't noticed before"))).toBe(true);
    // The description still surfaces so the player sees what they found.
    expect(r.value.render.some((s) => s.text.includes('A real-time map of fire.'))).toBe(true);
    // The flag was flipped — subsequent perception will include the item.
    const after = await engine.getItem(hiddenMap.id);
    expect(after.hidden).toBe(false);
  });

  it('hallucinated matchedItemId (not in visible list) → silently discarded, falls through to narration', async () => {
    const { engine, builder } = makeRepos();
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'You see nothing of consequence.',
          matchedItemId: 'item_nonexistent',
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const r = await handleSearch(
      { kind: ActionKind.Search, actorId: paff.id, query: 'whatever' },
      engine,
      { llm, builderRepo: builder, worldId: W },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render[0]?.text).toBe('You see nothing of consequence.');
    expect((await builder.listItems(W)).length).toBe(0);
  });
});
