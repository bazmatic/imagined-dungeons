import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { LlmGameAI } from '../game-ai';
import type { LanguageModel } from '../language-model';
import { handleBuy } from './buy';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const BUYER = asAgentId('char_p');
const SELLER = asAgentId('char_s');
const KEY = asItemId('item_key');

const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
const locB: Location = { ...loc, id: B, label: 'B' };
const baseAgent = {
  worldId: W,
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
  tags: [],
} as const;
const buyer: Agent = { ...baseAgent, id: BUYER, label: 'Paff', gold: 10 , secretDescription: ''};
const seller: Agent = { ...baseAgent, id: SELLER, label: 'Spark', gold: 0 , secretDescription: ''};
const baseItem = {
  worldId: W,
  shortDescription: '',
  longDescription: '',
  weight: 1,
  hidden: false,
  tags: [],
  equipped: false,
  container: false,
  opened: true,
  locked: false,
  lockedByItem: null,
} as const;
const pricedKey: Item = {
  ...baseItem,
  id: KEY,
  label: 'brass key',
  owner: { kind: OwnerKind.Agent, id: SELLER },
  priceTag: 5,
};

function stubLlm(parsed: unknown): LanguageModel {
  return { complete: async () => ({ parsed, raw: JSON.stringify(parsed) }) } as unknown as LanguageModel;
}
const acceptLlm = stubLlm({ accept: true, narration: 'Spark nods. "Deal."' });
const refuseLlm = stubLlm({ accept: false, narration: 'Spark scowls. "Not for that."' });

describe('handleBuy', () => {
  it('rejects when seller is not in the same room', async () => {
    const elsewhere: Agent = { ...seller, locationId: B };
    const repo = new MemoryRepository(W, {
      locations: [loc, locB],
      exits: [],
      items: [pricedKey],
      agents: [buyer, elsewhere],
    });
    const r = await handleBuy(
      { kind: ActionKind.Buy, actorId: BUYER, sellerId: SELLER, itemId: KEY },
      repo,
      { ai: new LlmGameAI(acceptLlm) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/isn't here/i);
  });

  it("rejects when seller doesn't own the item", async () => {
    const orphan: Item = { ...pricedKey, owner: { kind: OwnerKind.Location, id: A } };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [orphan],
      agents: [buyer, seller],
    });
    const r = await handleBuy(
      { kind: ActionKind.Buy, actorId: BUYER, sellerId: SELLER, itemId: KEY },
      repo,
      { ai: new LlmGameAI(acceptLlm) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/doesn't have/i);
  });

  it('rejects when the item is not priced', async () => {
    const unpriced: Item = { ...pricedKey, priceTag: null };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [unpriced],
      agents: [buyer, seller],
    });
    const r = await handleBuy(
      { kind: ActionKind.Buy, actorId: BUYER, sellerId: SELLER, itemId: KEY },
      repo,
      { ai: new LlmGameAI(acceptLlm) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/not for sale/i);
  });

  it('rejects when the buyer cannot afford it', async () => {
    const poor: Agent = { ...buyer, gold: 3 };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [pricedKey],
      agents: [poor, seller],
    });
    const r = await handleBuy(
      { kind: ActionKind.Buy, actorId: BUYER, sellerId: SELLER, itemId: KEY },
      repo,
      { ai: new LlmGameAI(acceptLlm) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/can't afford/i);
  });

  it('on accept: swaps gold + ownership, clears priceTag, emits Trade(accepted=true)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [pricedKey],
      agents: [buyer, seller],
    });
    const r = await handleBuy(
      { kind: ActionKind.Buy, actorId: BUYER, sellerId: SELLER, itemId: KEY },
      repo,
      { ai: new LlmGameAI(acceptLlm) },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe(EventKind.Trade);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: expect.stringContaining('Deal') }]);
    expect((await repo.getAgent(BUYER)).gold).toBe(5);
    expect((await repo.getAgent(SELLER)).gold).toBe(5);
    const itAfter = await repo.getItem(KEY);
    expect(itAfter.owner.kind).toBe(OwnerKind.Agent);
    expect(itAfter.owner.id).toBe(BUYER);
    expect(itAfter.priceTag).toBeNull();
  });

  it('on refusal: no state change, emits Trade(accepted=false)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [pricedKey],
      agents: [buyer, seller],
    });
    const r = await handleBuy(
      { kind: ActionKind.Buy, actorId: BUYER, sellerId: SELLER, itemId: KEY },
      repo,
      { ai: new LlmGameAI(refuseLlm) },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe(EventKind.Trade);
    expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: expect.stringContaining('Not for that') }]);
    expect((await repo.getAgent(BUYER)).gold).toBe(10);
    expect((await repo.getAgent(SELLER)).gold).toBe(0);
    const itAfter = await repo.getItem(KEY);
    expect(itAfter.owner.id).toBe(SELLER);
    expect(itAfter.priceTag).toBe(5);
  });
});
