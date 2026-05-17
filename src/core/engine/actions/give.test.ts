import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleGive } from './give';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');

const here: Location = {
  id: A,
  worldId: W,
  label: 'Here',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
const there: Location = {
  id: B,
  worldId: W,
  label: 'There',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};

const baseAgent = {
  worldId: W,
  shortDescription: '',
  longDescription: '',
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
} as const;

const paff: Agent = { ...baseAgent, id: asAgentId('char_paff'), label: 'Paff', locationId: A , secretDescription: ''};
const spark: Agent = { ...baseAgent, id: asAgentId('char_spark'), label: 'Spark', locationId: A , secretDescription: ''};
const remote: Agent = {
  ...baseAgent,
  id: asAgentId('char_remote'),
  label: 'Remote',
  locationId: B,
  secretDescription: '',
};

const heldByPaff: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: OwnerKind.Agent, id: paff.id },
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

describe('handleGive', () => {
  it('transfers a carried item from giver to recipient when both are co-located', async () => {
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [heldByPaff],
      agents: [paff, spark],
    });
    const r = await handleGive(
      { kind: 'give', actorId: paff.id, itemId: heldByPaff.id, targetAgentId: spark.id },
      repo,
    );
    if (!r.ok) throw new Error(`expected Ok, got ${r.error}`);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You give fire map to Spark.' }]);
    const sparkInv = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: spark.id });
    expect(sparkInv.map((i) => i.id)).toEqual(['item_map']);
    const paffInv = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: paff.id });
    expect(paffInv).toEqual([]);
  });

  it('errors when the recipient is not in the same room', async () => {
    const repo = new MemoryRepository(W, {
      locations: [here, there],
      exits: [],
      items: [heldByPaff],
      agents: [paff, remote],
    });
    const r = await handleGive(
      { kind: 'give', actorId: paff.id, itemId: heldByPaff.id, targetAgentId: remote.id },
      repo,
    );
    expect(r.ok).toBe(false);
  });

  it('errors when the giver is not carrying the item', async () => {
    const onFloor: Item = { ...heldByPaff, owner: { kind: OwnerKind.Location, id: A } };
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [onFloor],
      agents: [paff, spark],
    });
    const r = await handleGive(
      { kind: 'give', actorId: paff.id, itemId: onFloor.id, targetAgentId: spark.id },
      repo,
    );
    expect(r.ok).toBe(false);
  });

  it('rejects giving to yourself', async () => {
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [heldByPaff],
      agents: [paff],
    });
    const r = await handleGive(
      { kind: 'give', actorId: paff.id, itemId: heldByPaff.id, targetAgentId: paff.id },
      repo,
    );
    expect(r.ok).toBe(false);
  });
});
