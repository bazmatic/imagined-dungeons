import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleClose } from './close';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const BOX = asItemId('item_box');
const ACTOR = asAgentId('char_p');
const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
const actor: Agent = {
  id: ACTOR,
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
const baseItem = {
  worldId: W,
  shortDescription: '',
  longDescription: '',
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
} as const;
const openedBox: Item = {
  ...baseItem,
  id: BOX,
  label: 'wooden box',
  owner: { kind: OwnerKind.Location, id: A },
  container: true,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
};
const sword: Item = {
  ...baseItem,
  id: asItemId('item_sword'),
  label: 'sword',
  owner: { kind: OwnerKind.Location, id: A },
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
};

describe('handleClose', () => {
  it('closes an opened container', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [openedBox],
      agents: [actor],
    });
    const r = await handleClose({ kind: ActionKind.Close, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('You close the wooden box.');
    expect(r.value.event.kind).toBe(EventKind.Close);
    expect((await repo.getItem(BOX)).opened).toBe(false);
  });

  it('is a no-op when already closed', async () => {
    const closed = { ...openedBox, opened: false };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [closed],
      agents: [actor],
    });
    const r = await handleClose({ kind: ActionKind.Close, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('The wooden box is already closed.');
  });

  it('fails when target is not a container', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [sword],
      agents: [actor],
    });
    const r = await handleClose({ kind: ActionKind.Close, actorId: ACTOR, itemId: sword.id }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/can't close/i);
  });
});
