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
  tags: [],
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
  tags: [],
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
  tags: [],
  equipped: false,
};
const spark: Agent = {
  id: asAgentId('char_spark'),
  worldId: W,
  label: 'Spark',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 1,
  defense: 4,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  tags: [],
};

const view = { actor: paff, location: tavern, items: [map], agents: [spark], exits: [] };

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

  it('resolves the model itemRef to an itemId for take', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'take', itemRef: 'fire map' }),
    });
    const r = await llmInterpret('grab the fire map', paff, view, [], llm);
    expect(r).toEqual({ kind: 'take', actorId: paff.id, itemId: map.id });
  });

  it('returns null when the model returns an unresolvable itemRef', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'take', itemRef: 'unicorn' }),
    });
    const r = await llmInterpret('grab the unicorn', paff, view, [], llm);
    expect(r).toBeNull();
  });

  it('returns a look at the room for look(targetKind=null)', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'look', targetKind: null, targetRef: null }),
    });
    const r = await llmInterpret('look around me', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'look',
      actorId: paff.id,
      target: { kind: 'room' },
    });
  });

  it('resolves an agent look targetRef into an agent target', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'look', targetKind: 'agent', targetRef: 'spark' }),
    });
    const r = await llmInterpret('look at spark', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'look',
      actorId: paff.id,
      target: { kind: 'agent', id: spark.id },
    });
  });

  it('resolves an item look targetRef into an item target', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'look', targetKind: 'item', targetRef: 'fire map' }),
    });
    const r = await llmInterpret('examine the fire map', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'look',
      actorId: paff.id,
      target: { kind: 'item', id: map.id },
    });
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

  it('returns a speak Action with the resolved targetAgentId and utterance', async () => {
    const llm = makeFakeLanguageModel({
      responder: () =>
        respond({ kind: 'speak', targetAgentRef: 'spark', utterance: 'hello there' }),
    });
    const r = await llmInterpret('talk to spark, hello there', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'speak',
      actorId: paff.id,
      targetAgentId: spark.id,
      utterance: 'hello there',
    });
  });

  it('falls back to broadcast (targetAgentId null) when the speak targetAgentRef cannot be resolved', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'speak', targetAgentRef: 'ghost', utterance: 'hi' }),
    });
    const r = await llmInterpret('talk to ghost, hi', paff, view, [], llm);
    expect(r).toEqual({ kind: 'speak', actorId: paff.id, targetAgentId: null, utterance: 'hi' });
  });

  it('returns a broadcast speak when the model emits null targetAgentRef', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'speak', targetAgentRef: null, utterance: 'hello all' }),
    });
    const r = await llmInterpret('say hello all', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'speak',
      actorId: paff.id,
      targetAgentId: null,
      utterance: 'hello all',
    });
  });

  it('returns an attack Action with the resolved targetAgentId', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'attack', targetAgentRef: 'spark' }),
    });
    const r = await llmInterpret('attack spark', paff, view, [], llm);
    expect(r).toEqual({ kind: 'attack', actorId: paff.id, targetAgentId: spark.id });
  });

  it('returns an emote Action with the resolved targetAgentId when the model gives a ref', async () => {
    const llm = makeFakeLanguageModel({
      responder: () =>
        respond({ kind: 'emote', emoteDescription: 'wave', targetAgentRef: 'spark' }),
    });
    const r = await llmInterpret('wave at spark', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'emote',
      actorId: paff.id,
      description: 'wave',
      targetAgentId: spark.id,
    });
  });

  it('returns an emote Action with targetAgentId=null when the model gives null targetAgentRef', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'emote', emoteDescription: 'shrug', targetAgentRef: null }),
    });
    const r = await llmInterpret('I shrug', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'emote',
      actorId: paff.id,
      description: 'shrug',
      targetAgentId: null,
    });
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

  it('returns a Search Action when the model emits kind=search with a targetRef query', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'search', targetRef: 'dusty corner' }),
    });
    const r = await llmInterpret('look carefully in the dusty corner', paff, view, [], llm);
    expect(r).toEqual({ kind: 'search', actorId: paff.id, query: 'dusty corner' });
  });

  it('returns a Search Action with an empty query when targetRef is null', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'search', targetRef: null }),
    });
    const r = await llmInterpret('look around in detail', paff, view, [], llm);
    expect(r).toEqual({ kind: 'search', actorId: paff.id, query: '' });
  });

  it("system prompt teaches the interpreter to choose search over look for 'in detail' phrasings", async () => {
    const llm = makeFakeLanguageModel({ responder: () => respond({ kind: 'inventory' }) });
    await llmInterpret('anything', paff, view, [], llm);
    const sys = llm.calls[0]?.system ?? '';
    expect(sys.toLowerCase()).toContain('search');
    expect(sys.toLowerCase()).toContain('in detail');
  });

  it('returns a ParseError ImpossibleAction when the model judges the action impossible', async () => {
    const llm = makeFakeLanguageModel({
      responder: () =>
        respond({ kind: 'impossible', reason: "You have no wings — you can't fly." }),
    });
    const r = await llmInterpret('fly to the moon', paff, view, [], llm);
    expect(r).toEqual({
      kind: 'impossible_action',
      reason: "You have no wings — you can't fly.",
    });
  });

  it('returns null when impossible is emitted without a reason (invalid)', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'impossible', reason: '' }),
    });
    const r = await llmInterpret('fly', paff, view, [], llm);
    expect(r).toBeNull();
  });

  it('system prompt teaches the interpreter to use impossible for unworkable actions', async () => {
    const llm = makeFakeLanguageModel({ responder: () => respond({ kind: 'inventory' }) });
    await llmInterpret('anything', paff, view, [], llm);
    const sys = llm.calls[0]?.system ?? '';
    expect(sys.toLowerCase()).toContain('impossible');
    expect(sys.toLowerCase()).toContain('locked');
  });
});
