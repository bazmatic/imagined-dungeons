import type { Agent, Item } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import type { LanguageModel } from './language-model';
import { TradeDirection, tradeDecide } from './trade-decide';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const BUYER_ID = asAgentId('char_b');
const SELLER_ID = asAgentId('char_s');
const ITEM_ID = asItemId('item_x');

const baseAgent = {
  worldId: W, shortDescription: '', longDescription: '', locationId: A,
  hp: 10, damage: 0, defense: 0, capacity: 10, mood: null,
  sideQuest: null, goal: null, autonomous: false, awake: false, tags: [], gold: 0,
} as const;

const buyer: Agent = { ...baseAgent, id: BUYER_ID, label: 'Paff', shortDescription: 'a scrappy adventurer', gold: 50 , secretDescription: ''};
const seller: Agent = { ...baseAgent, id: SELLER_ID, label: 'Spark', shortDescription: 'a watchful keeper' , secretDescription: ''};
const item: Item = {
  id: ITEM_ID, worldId: W, label: 'brass key', shortDescription: 'a worn brass key',
  longDescription: '', owner: { kind: OwnerKind.Agent, id: SELLER_ID }, weight: 0,
  hidden: false, tags: [], equipped: false, container: false, opened: true,
  locked: false, lockedByItem: null, priceTag: 5,
  weaponDamage: null, armorDefense: null,
};

function stubLlm(parsed: unknown): LanguageModel {
  return {
    complete: async () => ({ parsed, raw: JSON.stringify(parsed) }),
  } as unknown as LanguageModel;
}

describe('tradeDecide', () => {
  it('accepts and returns the narration when the LLM accepts', async () => {
    const llm = stubLlm({ accept: true, narration: 'Spark nods.' });
    const r = await tradeDecide(
      { buyer, seller, item, price: 5, direction: TradeDirection.Buy },
      llm,
    );
    expect(r.accept).toBe(true);
    expect(r.narration).toBe('Spark nods.');
  });

  it('refuses with the LLM-provided narration', async () => {
    const llm = stubLlm({ accept: false, narration: 'Not for that.' });
    const r = await tradeDecide(
      { buyer, seller, item, price: 5, direction: TradeDirection.Buy },
      llm,
    );
    expect(r.accept).toBe(false);
    expect(r.narration).toBe('Not for that.');
  });

  it('falls back to refuse with a non-empty narration on a malformed payload', async () => {
    const llm = stubLlm({ accept: 'yes' }); // wrong shape
    const r = await tradeDecide(
      { buyer, seller, item, price: 5, direction: TradeDirection.Buy },
      llm,
    );
    expect(r.accept).toBe(false);
    expect(typeof r.narration).toBe('string');
    expect(r.narration.length).toBeGreaterThan(0);
  });

  it('falls back to refuse on LLM error', async () => {
    const llm: LanguageModel = {
      complete: async () => { throw new Error('boom'); },
    } as unknown as LanguageModel;
    const r = await tradeDecide(
      { buyer, seller, item, price: 5, direction: TradeDirection.Buy },
      llm,
    );
    expect(r.accept).toBe(false);
    expect(typeof r.narration).toBe('string');
  });
});
