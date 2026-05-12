import type { Agent, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, asAgentId, asEventId, asLocationId, asWorldId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { recallFor } from './memory';

const W = asWorldId('w');
const LOC = asLocationId('loc_x');
const PAFF: AgentId = asAgentId('char_paff');
const SPARK: AgentId = asAgentId('char_spark');
const REMOTE: AgentId = asAgentId('char_remote');

const loc: Location = {
  id: LOC,
  worldId: W,
  label: 'Loc',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
const mkAgent = (id: AgentId): Agent => ({
  id,
  worldId: W,
  label: id,
  shortDescription: '',
  longDescription: '',
  locationId: LOC,
  hp: 10,
  damage: 1,
  defense: 10,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  tags: [],
});

const baseEvent = (i: number, actor: AgentId, witnesses: readonly AgentId[]): DomainEvent => ({
  id: asEventId(`e_${i}`),
  worldId: W,
  actorId: actor,
  kind: EventKind.Look,
  witnesses,
  createdAt: new Date(2026, 0, 1, 0, 0, i),
  locationId: LOC,
  target: { kind: 'room' },
});

describe('recallFor', () => {
  it('returns events the actor witnessed or performed', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [mkAgent(PAFF), mkAgent(SPARK), mkAgent(REMOTE)],
    });
    await repo.appendEvent(baseEvent(1, PAFF, [PAFF, SPARK]));
    await repo.appendEvent(baseEvent(2, REMOTE, [REMOTE])); // not witnessed by Spark
    await repo.appendEvent(baseEvent(3, SPARK, [SPARK]));

    const sparkMemory = await recallFor(SPARK, repo, 10);
    const ids = sparkMemory.map((e) => e.id);
    expect(ids).toEqual(['e_1', 'e_3']);
  });

  it('omits events the actor did not witness', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [mkAgent(PAFF), mkAgent(REMOTE)],
    });
    await repo.appendEvent(baseEvent(1, REMOTE, [REMOTE]));
    const memory = await recallFor(PAFF, repo, 10);
    expect(memory).toEqual([]);
  });

  it('caps the returned events at `limit` (most recent first)', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [mkAgent(PAFF)],
    });
    for (let i = 0; i < 20; i++) {
      await repo.appendEvent(baseEvent(i, PAFF, [PAFF]));
    }
    const memory = await recallFor(PAFF, repo, 3);
    expect(memory).toHaveLength(3);
    expect(memory.map((e) => e.id)).toEqual(['e_17', 'e_18', 'e_19']);
  });

  it('returns an empty array for non-positive limits', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [mkAgent(PAFF)],
    });
    await repo.appendEvent(baseEvent(1, PAFF, [PAFF]));
    expect(await recallFor(PAFF, repo, 0)).toEqual([]);
  });
});
