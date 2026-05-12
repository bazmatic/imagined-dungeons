import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleLook } from './look';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'The Goblet',
  shortDescription: 's',
  longDescription: 'A tavern.',
  tags: [],
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: 's',
  longDescription: 'A real-time map.',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
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
  tags: [],
};

describe('handleLook', () => {
  it('with no target, returns the room view', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const r = await handleLook({ kind: 'look', actorId: paff.id, target: { kind: 'room' } }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render).toContain('The Goblet');
    expect(r.value.render).toContain('A tavern.');
    expect(r.value.render).toContain('fire map');
  });

  it('with a resolved item id, returns its long description', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const r = await handleLook(
      { kind: 'look', actorId: paff.id, target: { kind: 'item', id: map.id } },
      repo,
    );
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('A real-time map.');
  });
});
