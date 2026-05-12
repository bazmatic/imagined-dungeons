import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../../tests/helpers/fake-language-model';
import { makeCompositeParser } from './composite';

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
const view = { actor: paff, location: tavern, items: [map], agents: [], exits: [] };

describe('makeCompositeParser', () => {
  it('returns the rule-based result and never calls the LLM on rule success', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '{}', parsed: {} }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('south', paff, view, []);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
    expect(llm.calls).toHaveLength(0);
  });

  it('falls back to the LLM on unknown_verb and returns the assembled Action', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"move","direction":"south"}',
        parsed: { kind: 'move', direction: 'south' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('head south', paff, view, []);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
    expect(llm.calls).toHaveLength(1);
  });

  it('returns a graceful ImpossibleAction when the LLM returns unknown', async () => {
    // The LLM giving up is treated as 'I am not sure how to do that' rather
    // than the rule layer's verb-specific complaint. The rule parser is a
    // perf cache; its errors are not user-facing when the LLM is available.
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"unknown","reason":"x"}',
        parsed: { kind: 'unknown', reason: 'x' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('frobnicate', paff, view, []);
    expect(r).toEqual({
      kind: 'impossible_action',
      reason: "I'm not sure how to do that. Try rephrasing.",
    });
  });

  it('returns the original rule-based ParseError when the LLM throws', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('network down');
      },
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('frobnicate', paff, view, []);
    expect(r).toEqual({ kind: 'unknown_verb', verb: 'frobnicate' });
  });

  it('returns the original rule-based ParseError when no LLM is configured', async () => {
    const parse = makeCompositeParser({ llm: null });
    const r = await parse('frobnicate', paff, view, []);
    expect(r).toEqual({ kind: 'unknown_verb', verb: 'frobnicate' });
  });

  it('does not call the LLM on empty input', async () => {
    const llm = makeFakeLanguageModel({ responder: () => ({ raw: '{}', parsed: {} }) });
    const parse = makeCompositeParser({ llm });
    const r = await parse('   ', paff, view, []);
    expect(r).toEqual({ kind: 'empty' });
    expect(llm.calls).toHaveLength(0);
  });

  it('does not call the LLM on ambiguous_target (rules already understood)', async () => {
    const llm = makeFakeLanguageModel({ responder: () => ({ raw: '{}', parsed: {} }) });
    const ambiguous = makeCompositeParser({
      llm,
      ruleParse: () => ({
        kind: 'ambiguous_target',
        ref: 'map',
        candidates: ['fire map', 'star map'],
      }),
    });
    const r = await ambiguous('map', paff, view, []);
    expect(r.kind).toBe('ambiguous_target');
    expect(llm.calls).toHaveLength(0);
  });

  it('falls back on no_such_target', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"take","itemRef":"fire map"}',
        parsed: { kind: 'take', itemRef: 'fire map' },
      }),
    });
    const parse = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'no_such_target', ref: 'fire map' }),
    });
    const r = await parse('grab fire map', paff, view, []);
    expect(r).toEqual({ kind: 'take', actorId: paff.id, itemId: map.id });
  });

  it('falls back on unknown_direction', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"move","direction":"south"}',
        parsed: { kind: 'move', direction: 'south' },
      }),
    });
    const parse = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'unknown_direction', raw: 'out the south door' }),
    });
    const r = await parse('go out the south door', paff, view, []);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
  });

  it('falls back on missing_argument', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"inventory"}',
        parsed: { kind: 'inventory' },
      }),
    });
    const parse = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'missing_argument', verb: 'take' }),
    });
    const r = await parse('take', paff, view, []);
    expect(r).toEqual({ kind: 'inventory', actorId: paff.id });
  });
});
