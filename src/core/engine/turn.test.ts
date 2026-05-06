import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
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
  goal: null,
  autonomous: false,
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
    expect(r.events).toEqual([]);
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
