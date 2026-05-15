import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleOpen } from './open';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const BOX = asItemId('item_box');
const KEY = asItemId('item_key');
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
const closedBox: Item = {
  ...baseItem,
  id: BOX,
  label: 'wooden box',
  owner: { kind: OwnerKind.Location, id: A },
  container: true,
  opened: false,
  locked: false,
  lockedByItem: null,
  priceTag: null,
};
const keyInBox: Item = {
  ...baseItem,
  id: KEY,
  label: 'rusty key',
  owner: { kind: OwnerKind.Item, id: BOX },
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
};
const heldKey: Item = { ...keyInBox, owner: { kind: OwnerKind.Agent, id: ACTOR } };
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

describe('handleOpen', () => {
  it('opens an unlocked container and reveals contents in the actor render', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [closedBox, keyInBox],
      agents: [actor],
    });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You open the wooden box. Inside: rusty key.' }]);
    expect(r.value.event.kind).toBe(EventKind.Open);
    const updated = await repo.getItem(BOX);
    expect(updated.opened).toBe(true);
  });

  it('renders "It is empty." when the container has no contents', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [closedBox],
      agents: [actor],
    });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You open the wooden box. It is empty.' }]);
  });

  it('is a no-op when the container is already open', async () => {
    const opened = { ...closedBox, opened: true };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [opened],
      agents: [actor],
    });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'The wooden box is already open.' }]);
  });

  it('fails when the target is not a container', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [sword],
      agents: [actor],
    });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: sword.id }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/can't open/i);
  });

  it('auto-unlocks when actor carries the matching key', async () => {
    const lockedBox = { ...closedBox, locked: true, lockedByItem: KEY };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [lockedBox, heldKey],
      agents: [actor],
    });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render[0]?.text).toMatch(/^You unlock the wooden box and open it\./);
    const updated = await repo.getItem(BOX);
    expect(updated.locked).toBe(false);
    expect(updated.opened).toBe(true);
  });

  it('fails when locked and the key is not held', async () => {
    const lockedBox = { ...closedBox, locked: true, lockedByItem: KEY };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [lockedBox, keyInBox],
      agents: [actor],
    });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toBe('The wooden box is locked.');
    const updated = await repo.getItem(BOX);
    expect(updated.locked).toBe(true);
    expect(updated.opened).toBe(false);
  });
});
