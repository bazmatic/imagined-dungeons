import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { LlmGameAI } from '../game-ai';
import type { LanguageModel } from '../language-model';
import { handleSell } from './sell';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const PLAYER = asAgentId('char_p');
const NPC = asAgentId('char_s');
const CLOAK = asItemId('item_cloak');

const loc: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
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
const player: Agent = { ...baseAgent, id: PLAYER, label: 'Paff', gold: 0 , secretDescription: ''};
const npc: Agent = { ...baseAgent, id: NPC, label: 'Spark', gold: 10 , secretDescription: ''};
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
const pricedCloak: Item = {
  ...baseItem,
  id: CLOAK,
  label: 'cloak',
  owner: { kind: OwnerKind.Agent, id: PLAYER },
  priceTag: 5,
  weaponDamage: null,
  armorDefense: null,
};

function stubLlm(parsed: unknown): LanguageModel {
  return { complete: async () => ({ parsed, raw: JSON.stringify(parsed) }) } as unknown as LanguageModel;
}
const accept = stubLlm({ accept: true, narration: '"Done," says Spark.' });
const refuse = stubLlm({ accept: false, narration: '"No thanks," says Spark.' });

describe('handleSell', () => {
  it("rejects when the player doesn't own the item", async () => {
    const orphan: Item = { ...pricedCloak, owner: { kind: OwnerKind.Location, id: A } };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [orphan],
      agents: [player, npc],
    });
    const r = await handleSell(
      { kind: ActionKind.Sell, actorId: PLAYER, buyerId: NPC, itemId: CLOAK },
      repo,
      { ai: new LlmGameAI(accept) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/aren't carrying/i);
  });

  it('rejects when the item has no priceTag', async () => {
    const unpriced: Item = { ...pricedCloak, priceTag: null };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [unpriced],
      agents: [player, npc],
    });
    const r = await handleSell(
      { kind: ActionKind.Sell, actorId: PLAYER, buyerId: NPC, itemId: CLOAK },
      repo,
      { ai: new LlmGameAI(accept) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/haven't priced/i);
  });

  it("rejects when the npc can't afford the price", async () => {
    const poor: Agent = { ...npc, gold: 2 };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [pricedCloak],
      agents: [player, poor],
    });
    const r = await handleSell(
      { kind: ActionKind.Sell, actorId: PLAYER, buyerId: NPC, itemId: CLOAK },
      repo,
      { ai: new LlmGameAI(accept) },
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/only has 2 gold/i);
  });

  it('on accept: ownership transfers, gold swaps, priceTag clears, Trade(accepted=true)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [pricedCloak],
      agents: [player, npc],
    });
    const r = await handleSell(
      { kind: ActionKind.Sell, actorId: PLAYER, buyerId: NPC, itemId: CLOAK },
      repo,
      { ai: new LlmGameAI(accept) },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe(EventKind.Trade);
    expect((await repo.getAgent(PLAYER)).gold).toBe(5);
    expect((await repo.getAgent(NPC)).gold).toBe(5);
    const it2 = await repo.getItem(CLOAK);
    expect(it2.owner.id).toBe(NPC);
    expect(it2.priceTag).toBeNull();
  });

  it('on refusal: no state change, Trade(accepted=false)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [pricedCloak],
      agents: [player, npc],
    });
    const r = await handleSell(
      { kind: ActionKind.Sell, actorId: PLAYER, buyerId: NPC, itemId: CLOAK },
      repo,
      { ai: new LlmGameAI(refuse) },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe(EventKind.Trade);
    expect((await repo.getAgent(PLAYER)).gold).toBe(0);
    expect((await repo.getAgent(NPC)).gold).toBe(10);
    expect((await repo.getItem(CLOAK)).owner.id).toBe(PLAYER);
  });
});
