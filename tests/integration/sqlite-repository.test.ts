import { asAgentId, asEventId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { type DbHandle, openDb } from '@infra/db';
import * as schema from '@infra/schema';
import { SqliteRepository } from '@infra/sqlite-repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;
const W = asWorldId('w_test');

beforeEach(async () => {
  handle = openDb(':memory:');
  await handle.db.insert(schema.worlds).values({ id: W, label: 'test' });
  await handle.db.insert(schema.locations).values([
    { id: 'loc_a', worldId: W, label: 'A', shortDescription: 'a', longDescription: 'a' },
    { id: 'loc_b', worldId: W, label: 'B', shortDescription: 'b', longDescription: 'b' },
  ]);
  await handle.db.insert(schema.agents).values({
    id: 'char_p',
    worldId: W,
    label: 'Paff',
    shortDescription: '',
    longDescription: '',
    locationId: 'loc_a',
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
  });
  await handle.db.insert(schema.items).values({
    id: 'item_map',
    worldId: W,
    label: 'fire map',
    shortDescription: '',
    longDescription: '',
    ownerKind: 'location',
    ownerId: 'loc_a',
    weight: 1,
    hidden: false,
  });
});

afterEach(() => handle.close());

describe('SqliteRepository', () => {
  it('moves an agent durably', async () => {
    const repo = new SqliteRepository(handle.db, W);
    await repo.moveAgent(asAgentId('char_p'), asLocationId('loc_b'));
    const a = await repo.getAgent(asAgentId('char_p'));
    expect(a.locationId).toBe('loc_b');
  });

  it('transfers an item between location and agent', async () => {
    const repo = new SqliteRepository(handle.db, W);
    await repo.transferItem(asItemId('item_map'), { kind: 'agent', id: asAgentId('char_p') });
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: asAgentId('char_p') });
    expect(owned.map((i) => i.id)).toEqual(['item_map']);
  });

  it('appends and reads events', async () => {
    const repo = new SqliteRepository(handle.db, W);
    await repo.appendEvent({
      id: asEventId('evt_1'),
      worldId: W,
      actorId: asAgentId('char_p'),
      kind: 'inventory',
      witnesses: [asAgentId('char_p')],
      createdAt: new Date(),
    });
    const evs = await repo.recentEvents(10);
    expect(evs).toHaveLength(1);
    expect(evs[0]?.kind).toBe('inventory');
  });
});
