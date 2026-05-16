import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, OwnerKind } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleOffer } from './offer';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const ACTOR = asAgentId('char_p');
const ITEM = asItemId('item_cloak');

const loc: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };
const actor: Agent = { id: ACTOR, worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, tags: [], gold: 0 , secretDescription: ''};
const baseItem = { worldId: W, shortDescription: '', longDescription: '', weight: 1, hidden: false, tags: [], equipped: false, container: false, opened: true, locked: false, lockedByItem: null, priceTag: null, weaponDamage: null, armorDefense: null } as const;
const heldCloak: Item = { ...baseItem, id: ITEM, label: 'cloak', owner: { kind: OwnerKind.Agent, id: ACTOR } };
const floorCloak: Item = { ...heldCloak, owner: { kind: OwnerKind.Location, id: A } };

describe('handleOffer', () => {
  it('sets priceTag on a held item and renders confirmation', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [heldCloak], agents: [actor] });
    const r = await handleOffer({ kind: ActionKind.Offer, actorId: ACTOR, itemId: ITEM, price: 5 }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You set the price of the cloak at 5 gold.' }]);
    expect((await repo.getItem(ITEM)).priceTag).toBe(5);
  });

  it('refuses when actor does not own the item', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [floorCloak], agents: [actor] });
    const r = await handleOffer({ kind: ActionKind.Offer, actorId: ACTOR, itemId: ITEM, price: 5 }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/aren't carrying/i);
  });

  it('refuses zero', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [heldCloak], agents: [actor] });
    const r = await handleOffer({ kind: ActionKind.Offer, actorId: ACTOR, itemId: ITEM, price: 0 }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/positive/i);
  });

  it('refuses negative', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [heldCloak], agents: [actor] });
    const r = await handleOffer({ kind: ActionKind.Offer, actorId: ACTOR, itemId: ITEM, price: -3 }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/positive/i);
  });

  it('refuses non-integer prices', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [heldCloak], agents: [actor] });
    const r = await handleOffer({ kind: ActionKind.Offer, actorId: ACTOR, itemId: ITEM, price: 2.5 }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/whole/i);
  });
});
