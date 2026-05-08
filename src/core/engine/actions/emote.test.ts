import type { Agent, Location } from '@core/domain/entities';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleEmote } from './emote';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'B',
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
  damage: 1,
  defense: 4,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
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
};

describe('handleEmote', () => {
  it('emits an emote event with the description and witnesses, no state change', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    const r = await handleEmote(
      {
        kind: 'emote',
        actorId: paff.id,
        description: 'wave',
        targetAgentId: spark.id,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'emote') throw new Error('expected emote event');
    expect(r.value.event.description).toBe('wave');
    expect(r.value.event.targetAgentId).toBe(spark.id);
    expect(r.value.event.witnesses).toEqual(expect.arrayContaining([paff.id, spark.id]));
    expect(r.value.render).toBe('…');
    // Handler does not persist — runTurn appends after enriching with narrations.
    const events = await repo.recentEvents(10);
    expect(events).toHaveLength(0);
  });

  it('emits an untargeted emote event when targetAgentId is null', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    const r = await handleEmote(
      {
        kind: 'emote',
        actorId: paff.id,
        description: 'shrug',
        targetAgentId: null,
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'emote') throw new Error('expected emote event');
    expect(r.value.event.targetAgentId).toBeNull();
    expect(r.value.event.witnesses).toEqual(expect.arrayContaining([paff.id, spark.id]));
  });

  it('refuses when the target is not in the same location', async () => {
    const sparkAway: Agent = { ...spark, locationId: B };
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [paff, sparkAway],
    });
    const r = await handleEmote(
      {
        kind: 'emote',
        actorId: paff.id,
        description: 'wave',
        targetAgentId: sparkAway.id,
      },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error.toLowerCase()).toContain("isn't here");
  });
});
