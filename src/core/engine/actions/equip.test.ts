import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleEquip, handleUnequip } from './equip';

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
const cloak: Item = {
  id: asItemId('item_cloak'),
  worldId: W,
  label: 'fireproof cloak',
  shortDescription: '',
  longDescription: '',
  owner: { kind: OwnerKind.Agent, id: asAgentId('char_p') },
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
const cloakOnFloor: Item = {
  ...cloak,
  owner: { kind: OwnerKind.Location, id: A },
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

describe('handleEquip', () => {
  it('flips the equipped flag on a carried item and emits an Equip event with the manner', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [cloak],
      agents: [paff],
    });
    const r = await handleEquip(
      { kind: ActionKind.Equip, actorId: paff.id, itemId: cloak.id, manner: 'put on' },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('You put on the fireproof cloak.');
    expect(r.value.event.kind).toBe(EventKind.Equip);
    const item = await repo.getItem(cloak.id);
    expect(item.equipped).toBe(true);
  });

  it('refuses to equip an item the actor is not carrying', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [cloakOnFloor],
      agents: [paff],
    });
    const r = await handleEquip(
      { kind: ActionKind.Equip, actorId: paff.id, itemId: cloak.id, manner: 'put on' },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/aren't carrying/i);
  });

  it('refuses to equip an already-equipped item', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [{ ...cloak, equipped: true }],
      agents: [paff],
    });
    const r = await handleEquip(
      { kind: ActionKind.Equip, actorId: paff.id, itemId: cloak.id, manner: 'put on' },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/already.*equipped/i);
  });
});

describe('handleUnequip', () => {
  it('clears the equipped flag and emits an Unequip event', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [{ ...cloak, equipped: true }],
      agents: [paff],
    });
    const r = await handleUnequip(
      { kind: ActionKind.Unequip, actorId: paff.id, itemId: cloak.id, manner: 'take off' },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('You take off the fireproof cloak.');
    expect(r.value.event.kind).toBe(EventKind.Unequip);
    const item = await repo.getItem(cloak.id);
    expect(item.equipped).toBe(false);
  });

  it('refuses to unequip an item that is not equipped', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [cloak],
      agents: [paff],
    });
    const r = await handleUnequip(
      { kind: ActionKind.Unequip, actorId: paff.id, itemId: cloak.id, manner: 'take off' },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/isn't equipped/i);
  });
});
