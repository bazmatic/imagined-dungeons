import type { Agent, Location } from '@core/domain/entities';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleAttack, resolveAttackOutcome } from './attack';

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
const paff = (overrides: Partial<Agent> = {}): Agent => ({
  id: asAgentId('char_p'),
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 3,
  defense: 4,
  capacity: 10,
  mood: null,
  goal: null,
  autonomous: false,
  ...overrides,
});
const spark = (overrides: Partial<Agent> = {}): Agent => ({
  id: asAgentId('char_spark'),
  worldId: W,
  label: 'Spark',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 2,
  defense: 4,
  capacity: 10,
  mood: 'wary',
  goal: 'survive',
  autonomous: false,
  ...overrides,
});

describe('resolveAttackOutcome', () => {
  it('is deterministic: a hit when damage >= ceil(defense/4)', () => {
    expect(resolveAttackOutcome(1, 4)).toBe('hit');
    expect(resolveAttackOutcome(2, 4)).toBe('hit');
    expect(resolveAttackOutcome(0, 4)).toBe('miss');
  });

  it('miss when defense is much higher than damage', () => {
    expect(resolveAttackOutcome(1, 100)).toBe('miss');
  });
});

describe('handleAttack', () => {
  it('emits an attack event with hit outcome and reduces target HP via setAgentHp', async () => {
    const a = paff({ damage: 3 });
    const t = spark({ hp: 10, defense: 4 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [a, t],
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error('expected attack');
    expect(r.value.event.outcome).toBe('hit');
    expect(r.value.event.witnesses).toEqual(expect.arrayContaining([a.id, t.id]));
    expect(r.value.render).toBe('…');
    const updated = await repo.getAgent(t.id);
    expect(updated.hp).toBe(10 - 3);
    // Handler does not persist
    expect(await repo.recentEvents(10)).toHaveLength(0);
  });

  it('emits a miss outcome when damage falls below the threshold and does not reduce HP', async () => {
    const a = paff({ damage: 0 });
    const t = spark({ hp: 10, defense: 4 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [a, t],
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
    const updated = await repo.getAgent(t.id);
    expect(updated.hp).toBe(10);
  });

  it('refuses when the target is not in the same location', async () => {
    const a = paff();
    const t = spark({ locationId: B });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [a, t],
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error.toLowerCase()).toContain("isn't here");
  });

  it('lets HP go negative — slice 3 leaves "dead" representation to the Narrator', async () => {
    const a = paff({ damage: 50 });
    const t = spark({ hp: 10, defense: 4 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [],
      agents: [a, t],
    });
    await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    const updated = await repo.getAgent(t.id);
    expect(updated.hp).toBe(-40);
  });
});
