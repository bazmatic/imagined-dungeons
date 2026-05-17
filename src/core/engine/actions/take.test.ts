import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { SegmentKind } from '@core/domain/segments';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleTake } from './take';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
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
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
  weaponDamage: null,
  armorDefense: null,
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
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
  weaponDamage: null,
  armorDefense: null,
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
  sideQuest: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

describe('handleTake', () => {
  it('transfers the item to the actor and emits a take event', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const r = await handleTake({ kind: 'take', actorId: paff.id, itemId: map.id }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'Taken: fire map.' }]);
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: paff.id });
    expect(owned.map((i) => i.id)).toEqual(['item_map']);
  });

  it('refuses to take an item heavier than capacity', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [heavy],
      agents: [paff],
    });
    const r = await handleTake({ kind: 'take', actorId: paff.id, itemId: heavy.id }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/too heavy/i);
  });
});
