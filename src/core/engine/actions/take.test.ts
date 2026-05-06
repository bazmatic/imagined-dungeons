import { describe, expect, it } from 'vitest';
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { handleTake } from './take';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
};
const heavy: Item = {
  id: asItemId('item_h'),
  worldId: W,
  label: 'anvil',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 99,
  hidden: false,
};
const hidden: Item = {
  id: asItemId('item_box'),
  worldId: W,
  label: 'wooden box',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: true,
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
  goal: null,
  autonomous: false,
};

describe('handleTake', () => {
  it('transfers the item to the actor and emits a take event', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const r = await handleTake(
      { kind: 'take', actorId: paff.id, itemRef: 'fire map' },
      repo,
    );
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('Taken: fire map.');
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: paff.id });
    expect(owned.map((i) => i.id)).toEqual(['item_map']);
  });

  it('refuses when the item is not in the room', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff],
    });
    const r = await handleTake(
      { kind: 'take', actorId: paff.id, itemRef: 'fire map' },
      repo,
    );
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/fire map/);
  });

  it('refuses to take a hidden item (treated as not present)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [hidden],
      agents: [paff],
    });
    const r = await handleTake(
      { kind: 'take', actorId: paff.id, itemRef: 'wooden box' },
      repo,
    );
    expect(r.ok).toBe(false);
  });

  it('refuses to take an item heavier than capacity', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [heavy],
      agents: [paff],
    });
    const r = await handleTake(
      { kind: 'take', actorId: paff.id, itemRef: 'anvil' },
      repo,
    );
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/too heavy/i);
  });
});
