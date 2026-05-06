import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from './memory-repository';

const W = asWorldId('w');

const loc = (id: string, label: string): Location => ({
  id: asLocationId(id),
  worldId: W,
  label,
  shortDescription: label,
  longDescription: label,
});

const agent = (id: string, label: string, locId: string): Agent => ({
  id: asAgentId(id),
  worldId: W,
  label,
  shortDescription: label,
  longDescription: label,
  locationId: asLocationId(locId),
  hp: 10,
  damage: 1,
  defense: 10,
  capacity: 10,
  mood: null,
  goal: null,
  autonomous: false,
});

const item = (
  id: string,
  label: string,
  ownerKind: 'location' | 'agent',
  ownerId: string,
): Item => ({
  id: asItemId(id),
  worldId: W,
  label,
  shortDescription: label,
  longDescription: label,
  owner:
    ownerKind === 'location'
      ? { kind: 'location', id: asLocationId(ownerId) }
      : { kind: 'agent', id: asAgentId(ownerId) },
  weight: 1,
  hidden: false,
});

describe('MemoryRepository', () => {
  it('returns items owned by a location', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a', 'A')],
      exits: [],
      items: [item('item_x', 'x', 'location', 'loc_a')],
      agents: [],
    });
    const items = await repo.itemsOwnedBy({ kind: 'location', id: asLocationId('loc_a') });
    expect(items.map((i) => i.id)).toEqual(['item_x']);
  });

  it('moves an agent and reflects the change on subsequent reads', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a', 'A'), loc('loc_b', 'B')],
      exits: [],
      items: [],
      agents: [agent('char_1', 'P', 'loc_a')],
    });
    await repo.moveAgent(asAgentId('char_1'), asLocationId('loc_b'));
    const a = await repo.getAgent(asAgentId('char_1'));
    expect(a.locationId).toBe('loc_b');
  });

  it('transfers item ownership from a location to an agent', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a', 'A')],
      exits: [],
      items: [item('item_x', 'x', 'location', 'loc_a')],
      agents: [agent('char_1', 'P', 'loc_a')],
    });
    await repo.transferItem(asItemId('item_x'), { kind: 'agent', id: asAgentId('char_1') });
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: asAgentId('char_1') });
    expect(owned.map((i) => i.id)).toEqual(['item_x']);
    const stillThere = await repo.itemsOwnedBy({ kind: 'location', id: asLocationId('loc_a') });
    expect(stillThere).toHaveLength(0);
  });
});
