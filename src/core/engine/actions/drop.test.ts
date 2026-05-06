import { describe, expect, it } from 'vitest';
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { handleDrop } from './drop';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
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
const heldMap: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'agent', id: paff.id },
  weight: 1,
  hidden: false,
};

describe('handleDrop', () => {
  it('transfers the held item to the location', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [heldMap],
      agents: [paff],
    });
    const r = await handleDrop(
      { kind: 'drop', actorId: paff.id, itemRef: 'fire map' },
      repo,
    );
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('Dropped: fire map.');
    const onFloor = await repo.itemsOwnedBy({ kind: 'location', id: A });
    expect(onFloor.map((i) => i.id)).toEqual(['item_map']);
  });

  it('refuses when actor is not holding the item', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [paff],
    });
    const r = await handleDrop(
      { kind: 'drop', actorId: paff.id, itemRef: 'fire map' },
      repo,
    );
    expect(r.ok).toBe(false);
  });
});
