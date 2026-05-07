import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTurn } from '@core/engine/turn';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../helpers/fake-language-model';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = {
  id: A,
  worldId: W,
  label: 'Tavern',
  shortDescription: '',
  longDescription: 'A tavern.',
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'Street',
  shortDescription: '',
  longDescription: 'A street.',
};
const door: Exit = {
  id: asExitId('e'),
  worldId: W,
  from: A,
  to: B,
  direction: 'south',
  label: 'south door',
  locked: false,
  lockedByItem: null,
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

describe('composite parser through runTurn', () => {
  it('runs an LLM-resolved take through the full pipeline', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [door],
      items: [map],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"take","itemRef":"fire map"}',
        parsed: { kind: 'take', itemRef: 'fire map' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'grab the fire map off the table', repo, parse);
    expect(r.render.toLowerCase()).toBe('taken: fire map.');
    expect(r.events).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
  });

  it('runs an LLM-resolved move through the full pipeline', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [door],
      items: [],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"move","direction":"south"}',
        parsed: { kind: 'move', direction: 'south' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'head out the south door', repo, parse);
    expect(r.render).toBe('You go south.');
    expect(r.events).toHaveLength(1);
  });

  it('preserves the rule-based ParseError message when the LLM returns unknown', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"unknown","reason":"combat not supported"}',
        parsed: { kind: 'unknown', reason: 'combat not supported' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'do a backflip', repo, parse);
    // Rule-based parser quotes the unknown verb ("do"), not the trailing words.
    // The point of the assertion is that the LLM's reason ("combat...") never reaches the user.
    expect(r.render.toLowerCase()).toContain('do');
    expect(r.render.toLowerCase()).not.toContain('combat');
  });

  it('routes "look around me" through the LLM and renders the room view', async () => {
    // The bug repro: previously the rule-based parser returned a successful
    // look action with targetRef "around me", and the handler then failed
    // with no_such_target — the LLM was never invoked. With ref resolution
    // pulled into the parser, "around me" is now an unresolved item ref at
    // parse time, so the composite parser falls back to the LLM.
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"look","targetKind":null,"targetRef":null}',
        parsed: { kind: 'look', targetKind: null, targetRef: null },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'look around me', repo, parse);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.user).toContain('look around me');
    expect(r.render).toContain('Tavern');
    expect(r.render).toContain('A tavern.');
    expect(r.render).toContain('fire map');
    expect(r.events).toHaveLength(1);
  });

  it('routes a take with an unresolved ref through the LLM', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [map],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"take","itemRef":"fire map"}',
        parsed: { kind: 'take', itemRef: 'fire map' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'take the elusive whatsit', repo, parse);
    expect(llm.calls).toHaveLength(1);
    expect(r.render.toLowerCase()).toBe('taken: fire map.');
  });

  it('never calls the LLM when the rule-based parser succeeds', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [door],
      items: [],
      agents: [paff],
    });
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '{}', parsed: {} }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'south', repo, parse);
    expect(r.render).toBe('You go south.');
    expect(llm.calls).toHaveLength(0);
  });
});
