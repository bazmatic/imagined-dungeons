import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
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
  secretDescription: '',
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
  gold: 0,
  tags: [],
});

const item = (id: string, ownerLoc: string, hidden = false): Item => ({
  id: asItemId(id),
  worldId: W,
  label: id,
  shortDescription: id,
  longDescription: id,
  owner: { kind: OwnerKind.Location, id: asLocationId(ownerLoc) },
  weight: 1,
  hidden,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
  priceTag: null,
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

describe('perceive — container chain', () => {
  const LOC = asLocationId('loc_a');
  const BOX = asItemId('item_box');
  const KEY = asItemId('item_key');
  const ACTOR = asAgentId('char_p');

  const locA: Location = {
    id: LOC,
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
    label: 'P',
    shortDescription: '',
    longDescription: '',
    locationId: LOC,
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
  };
  const closedBox: Item = {
    id: BOX,
    worldId: W,
    label: 'wooden box',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Location, id: LOC },
    weight: 1,
    hidden: false,
    tags: [],
    equipped: false,
    container: true,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
  };
  const keyInBox: Item = {
    id: KEY,
    worldId: W,
    label: 'rusty key',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Item, id: BOX },
    weight: 0,
    hidden: false,
    tags: [],
    equipped: false,
    container: false,
    opened: true,
    locked: false,
    lockedByItem: null,
    priceTag: null,
  };

  it('hides items inside a closed container', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [closedBox, keyInBox],
      agents: [actor],
    });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).toContain(BOX as string);
    expect(ids).not.toContain(KEY as string);
  });

  it('reveals items inside an opened container', async () => {
    const opened = { ...closedBox, opened: true };
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [opened, keyInBox],
      agents: [actor],
    });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).toContain(BOX as string);
    expect(ids).toContain(KEY as string);
  });

  it('filters through nested closed containers', async () => {
    const INNER = asItemId('item_inner_box');
    const innerBox: Item = {
      ...closedBox,
      id: INNER,
      label: 'inner box',
      owner: { kind: OwnerKind.Item, id: BOX },
      container: true,
      opened: true,
    };
    const keyInInner: Item = { ...keyInBox, owner: { kind: OwnerKind.Item, id: INNER } };
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [closedBox, innerBox, keyInInner],
      agents: [actor],
    });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).toContain(BOX as string);
    expect(ids).not.toContain(INNER as string);
    expect(ids).not.toContain(KEY as string);
  });

  it('hides contents of a hidden container even when the container is open', async () => {
    const hiddenOpenBox: Item = { ...closedBox, hidden: true, opened: true };
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [hiddenOpenBox, keyInBox],
      agents: [actor],
    });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).not.toContain(BOX as string); // hidden ancestor not visible
    expect(ids).not.toContain(KEY as string); // contents inherit the hide
  });
});
