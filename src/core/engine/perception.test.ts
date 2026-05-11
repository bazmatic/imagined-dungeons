import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { perceive } from './perception';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');

const loc = (id: string): Location => ({
  id: asLocationId(id),
  worldId: W,
  label: id,
  shortDescription: id,
  longDescription: id,
  tags: [],
});

const agent = (id: string, locId: string): Agent => ({
  id: asAgentId(id),
  worldId: W,
  label: id,
  shortDescription: id,
  longDescription: id,
  locationId: asLocationId(locId),
  hp: 1,
  damage: 0,
  defense: 0,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
});

const item = (id: string, ownerLoc: string, hidden = false): Item => ({
  id: asItemId(id),
  worldId: W,
  label: id,
  shortDescription: id,
  longDescription: id,
  owner: { kind: 'location', id: asLocationId(ownerLoc) },
  weight: 1,
  hidden,
});

const exit: Exit = {
  id: asExitId('e1'),
  worldId: W,
  from: A,
  to: B,
  direction: 'north',
  label: 'door',
  locked: false,
  lockedByItem: null,
};

describe('perceive', () => {
  it('returns visible items, agents (excluding self), and exits in the actor location', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a'), loc('loc_b')],
      exits: [exit],
      items: [
        item('item_x', 'loc_a'),
        item('item_hidden', 'loc_a', true),
        item('item_other', 'loc_b'),
      ],
      agents: [
        agent('char_self', 'loc_a'),
        agent('char_other', 'loc_a'),
        agent('char_far', 'loc_b'),
      ],
    });
    const view = await perceive(asAgentId('char_self'), repo);
    expect(view.items.map((i) => i.id)).toEqual(['item_x']);
    expect(view.agents.map((a) => a.id)).toEqual(['char_other']);
    expect(view.exits.map((e) => e.direction)).toEqual(['north']);
    expect(view.location.id).toBe('loc_a');
  });
});
