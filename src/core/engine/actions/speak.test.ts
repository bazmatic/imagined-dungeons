import type { Agent, Location } from '@core/domain/entities';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleSpeak } from './speak';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = {
  id: A,
  worldId: W,
  label: 'A',
  shortDescription: '',
  longDescription: '',
  tags: [],
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'B',
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
  mood: 'curious',
  shortTermIntent: null,
  goal: 'find clues',
  autonomous: false,
  awake: false,
};

describe('handleSpeak', () => {
  it('emits a speak event with utterance and witnesses, and does not persist itself', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [paff, spark],
    });
    const r = await handleSpeak(
      {
        kind: 'speak',
        actorId: paff.id,
        targetAgentId: spark.id,
        utterance: 'hello there',
      },
      repo,
    );
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'speak') throw new Error('expected speak event');
    expect(r.value.event.utterance).toBe('hello there');
    expect(r.value.event.targetAgentId).toBe(spark.id);
    expect(r.value.event.witnesses).toEqual(expect.arrayContaining([paff.id, spark.id]));
    // Handler returns a placeholder render; runTurn replaces it.
    expect(r.value.render).toBe('…');
    // The handler does not persist — runTurn does after enriching with narrations.
    const events = await repo.recentEvents(10);
    expect(events).toHaveLength(0);
  });

  it('refuses when the target is not in the same location', async () => {
    const sparkAway: Agent = { ...spark, locationId: B };
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [paff, sparkAway],
    });
    const r = await handleSpeak(
      {
        kind: 'speak',
        actorId: paff.id,
        targetAgentId: sparkAway.id,
        utterance: 'hi',
      },
      repo,
    );
    if (r.ok) throw new Error('expected error');
    expect(r.error.toLowerCase()).toContain("isn't here");
  });
});
