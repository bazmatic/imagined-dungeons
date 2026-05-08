import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import type { ParseFn } from './parser/composite';
import { runTurn } from './turn';

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
  label: 'door',
  locked: false,
  lockedByItem: null,
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: 'a map',
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
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
};

describe('runTurn', () => {
  it('parses a command, dispatches, and returns rendered text', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [door],
      items: [map],
      agents: [paff],
    });
    const r = await runTurn(paff.id, 'take fire map', repo);
    expect(r.render).toBe('Taken: fire map.');
    expect(r.events).toHaveLength(1);
  });

  it('returns a parse-error message for unknown verbs without throwing', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [],
      agents: [paff],
    });
    const r = await runTurn(paff.id, 'frobnicate', repo);
    expect(r.render).toContain('frobnicate');
    // A failed parse now emits a private `failed` event so the actor remembers
    // the mistake on their next turn (NPCs were previously dumbly retrying).
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.kind).toBe('failed');
  });

  it('returns an action-error message when the action fails', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [],
      agents: [paff],
    });
    const r = await runTurn(paff.id, 'north', repo);
    expect(r.render).toMatch(/can't go that way/i);
  });
});

describe('runTurn with injected parse', () => {
  it('uses the injected parse function instead of the default rule-based parser', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [],
      agents: [paff],
    });
    const fakeParse: ParseFn = async () => ({ kind: 'inventory', actorId: paff.id });
    const r = await runTurn(paff.id, 'literal-garbage', repo, fakeParse);
    expect(r.render.toLowerCase()).toContain('carrying');
  });
});

describe('runTurn with narrated events', () => {
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
    mood: 'curious',
    shortTermIntent: null,
    goal: 'observe',
    autonomous: false,
    awake: false,
  };

  it('populates per-witness narrations on a speak event (mechanical fallback)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    const r = await runTurn(paff.id, 'say hello', repo);
    expect(r.events).toHaveLength(1);
    const event = r.events[0];
    if (!event || event.kind !== 'speak') throw new Error('expected speak event');
    expect(event.narrations).toBeDefined();
    expect(event.narrations?.[paff.id]).toContain('You say');
    expect(event.narrations?.[spark.id]).toContain('Paff says');
    // Render is the actor's narration.
    expect(r.render).toBe(event.narrations?.[paff.id]);
  });

  it('persists the event with narrations exactly once', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    await runTurn(paff.id, 'say hello', repo);
    const events = await repo.recentEvents(10);
    expect(events).toHaveLength(1);
    const event = events[0];
    if (!event || event.kind !== 'speak') throw new Error('expected speak');
    expect(event.narrations?.[paff.id]).toBeTruthy();
    expect(event.narrations?.[spark.id]).toBeTruthy();
  });
});
