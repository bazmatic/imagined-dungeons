import type { Agent, Exit, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleMove } from './move';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: 'a',
  longDescription: 'a',
  tags: [],
  secretDescription: '',
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'B',
  shortDescription: 'b',
  longDescription: 'b',
  tags: [],
  secretDescription: '',
};
const exitN: Exit = {
  id: asExitId('e1'),
  worldId: W,
  from: A,
  to: B,
  direction: 'north',
  label: 'door',
  locked: false,
  lockedByItem: null,
};
const exitS: Exit = {
  id: asExitId('e2'),
  worldId: W,
  from: A,
  to: B,
  direction: 'south',
  label: 'gate',
  locked: true,
  lockedByItem: asItemId('item_key'),
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
  gold: 0,
  tags: [],
  secretDescription: '',
};

describe('handleMove', () => {
  it('moves the actor and emits a move event when exit exists and is unlocked', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitN],
      items: [],
      agents: [paff],
    });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'north' }, repo);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('You go north.');
    expect((await repo.getAgent(paff.id)).locationId).toBe('loc_b');
    const events = await repo.recentEvents(10);
    expect(events.map((e) => e.kind)).toEqual(['move']);
  });

  it('refuses when no exit in that direction', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitN],
      items: [],
      agents: [paff],
    });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'east' }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/can't go that way/i);
  });

  it('refuses when exit is locked, naming the obstacle', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitS],
      items: [],
      agents: [paff],
    });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'south' }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toContain('gate');
    expect(r.error).toMatch(/locked/i);
  });

  it('auto-unlocks a locked exit when the actor carries the matching key', async () => {
    const key = {
      id: asItemId('item_key'),
      worldId: W,
      label: 'rusty key',
      shortDescription: '',
      longDescription: '',
      owner: { kind: 'agent' as const, id: paff.id },
      weight: 0,
      hidden: false,
      tags: [],
      equipped: false,
      container: false,
      opened: true,
      locked: false,
      lockedByItem: null,
      priceTag: null,
    };
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitS],
      items: [key],
      agents: [paff],
    });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'south' }, repo);
    if (!r.ok) throw new Error(r.error);
    const exitAfter = await repo.getExit(exitS.id);
    expect(exitAfter.locked).toBe(false);
  });
});
