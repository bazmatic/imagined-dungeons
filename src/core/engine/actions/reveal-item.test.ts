import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleRevealItem } from './reveal-item';

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
const hiddenBox: Item = {
  id: asItemId('item_box'),
  worldId: W,
  label: 'wooden box',
  shortDescription: 'a small box',
  longDescription: 'a small wooden box, almost hidden in the shadows',
  owner: { kind: OwnerKind.Location, id: A },
  weight: 1,
  hidden: true,
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

describe('handleRevealItem', () => {
  it('flips hidden=false and emits a Reveal event with location witnesses', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [hiddenBox],
      agents: [paff],
    });
    const r = await handleRevealItem(
      { kind: ActionKind.RevealItem, actorId: paff.id, itemId: hiddenBox.id },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe(EventKind.Reveal);
    expect(r.value.event.witnesses).toContain(paff.id);
    const item = await repo.getItem(hiddenBox.id);
    expect(item.hidden).toBe(false);
  });

  it('errs when the item is already visible', async () => {
    const visibleBox: Item = { ...hiddenBox, hidden: false };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [visibleBox],
      agents: [paff],
    });
    const r = await handleRevealItem(
      { kind: ActionKind.RevealItem, actorId: paff.id, itemId: visibleBox.id },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/already visible/i);
  });

  it('errs when the item is not at a location (held by an agent)', async () => {
    const carriedBox: Item = {
      ...hiddenBox,
      owner: { kind: OwnerKind.Agent, id: paff.id },
    };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [carriedBox],
      agents: [paff],
    });
    const r = await handleRevealItem(
      { kind: ActionKind.RevealItem, actorId: paff.id, itemId: carriedBox.id },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/not held by a location/i);
  });
});
