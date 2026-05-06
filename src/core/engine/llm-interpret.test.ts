import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { LanguageModelResponse } from '@core/engine/language-model';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { llmInterpret } from './llm-interpret';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const tavern: Location = {
  id: A,
  worldId: W,
  label: 'Tavern',
  shortDescription: '',
  longDescription: '',
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
  goal: null,
  autonomous: false,
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
};
const view = { actor: paff, location: tavern, items: [map], agents: [], exits: [] };

const respond = (parsed: unknown): LanguageModelResponse => ({
  raw: JSON.stringify(parsed),
  parsed,
});

describe('llmInterpret', () => {
  it('returns a move Action with the actor id when the model returns a valid move', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'move', direction: 'south' }),
    });
    const r = await llmInterpret('head south', paff, view, [], llm);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
  });

  it('returns a take Action carrying the model itemRef verbatim', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'take', itemRef: 'fire map' }),
    });
    const r = await llmInterpret('grab the fire map', paff, view, [], llm);
    expect(r).toEqual({ kind: 'take', actorId: paff.id, itemRef: 'fire map' });
  });

  it('returns null on the unknown variant', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'unknown', reason: "can't do combat" }),
    });
    const r = await llmInterpret('attack spark', paff, view, [], llm);
    expect(r).toBeNull();
  });

  it('returns null when the response fails schema validation', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'attack', target: 'spark' }),
    });
    const r = await llmInterpret('attack spark', paff, view, [], llm);
    expect(r).toBeNull();
  });

  it('passes the schema and a non-empty system+user prompt to the port', async () => {
    const llm = makeFakeLanguageModel({ responder: () => respond({ kind: 'inventory' }) });
    await llmInterpret('what am i carrying', paff, view, [], llm);
    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    expect(call?.schemaName).toBe('PlayerActionResponse');
    expect(call?.system.length ?? 0).toBeGreaterThan(0);
    expect(call?.user).toContain('what am i carrying');
  });
});
