// src/core/engine/actions/creative-attack.test.ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleCreativeAttack } from './creative-attack';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };
const locB: Location = { id: B, worldId: W, label: 'B', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };

const paff = (overrides: Partial<Agent> = {}): Agent => ({
  id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '',
  locationId: A, hp: 10, damage: 3, defense: 4, capacity: 10, mood: null, shortTermIntent: null,
  goal: null, autonomous: false, awake: false, gold: 0, tags: [], secretDescription: '', ...overrides,
});
const orc = (overrides: Partial<Agent> = {}): Agent => ({
  id: asAgentId('char_orc'), worldId: W, label: 'Orc', shortDescription: '', longDescription: '',
  locationId: A, hp: 10, damage: 5, defense: 3, capacity: 10, mood: null, shortTermIntent: null,
  goal: null, autonomous: false, awake: false, gold: 0, tags: [], secretDescription: '', ...overrides,
});

const makeRepo = (a: Agent, t: Agent) =>
  new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [], agents: [a, t], rngSeed: 1 });

// Guaranteed-miss action: threshold=21 on a d20 is unreachable (max roll is 20)
const missAction = (actorId: ReturnType<typeof asAgentId>, targetAgentId: ReturnType<typeof asAgentId>) => ({
  kind: 'creative_attack' as const,
  actorId,
  targetAgentId,
  toHit: { sides: 20, threshold: 21 },
  damage: { count: 1, sides: 6, bonus: 0 },
  narrative: 'Paff hurls a goblet',
});

// Guaranteed-hit action: threshold=1 on any die is always satisfied
const hitAction = (actorId: ReturnType<typeof asAgentId>, targetAgentId: ReturnType<typeof asAgentId>) => ({
  kind: 'creative_attack' as const,
  actorId,
  targetAgentId,
  toHit: { sides: 20, threshold: 1 },
  damage: { count: 1, sides: 6, bonus: 0 },
  narrative: 'Paff sweeps the candelabra into the orc\'s face',
});

describe('handleCreativeAttack', () => {
  it('miss leaves HP unchanged and emits creative_attack event with outcome=miss', async () => {
    const a = paff();
    const t = orc({ hp: 10 });
    const repo = makeRepo(a, t);
    const r = await handleCreativeAttack(missAction(a.id, t.id), repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe('creative_attack');
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
    expect(r.value.event.damageDealt).toBe(0);
    expect((await repo.getAgent(t.id)).hp).toBe(10);
  });

  it('hit reduces HP and carries the LLM narrative in the event', async () => {
    const a = paff();
    const t = orc({ hp: 10 });
    const repo = makeRepo(a, t);
    const r = await handleCreativeAttack(hitAction(a.id, t.id), repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    expect(r.value.event.outcome).toBe('hit');
    expect(r.value.event.damageDealt).toBeGreaterThan(0);
    expect(r.value.event.narrative).toBe("Paff sweeps the candelabra into the orc's face");
    const after = await repo.getAgent(t.id);
    expect(after.hp).toBe(10 - r.value.event.damageDealt);
  });

  it('applies bonus to damage roll', async () => {
    const a = paff();
    const t = orc({ hp: 100 });
    const repo = makeRepo(a, t);
    const action = { ...hitAction(a.id, t.id), damage: { count: 1, sides: 1, bonus: 5 } };
    const r = await handleCreativeAttack(action, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    // sides=1, rollD(rng, 1) always returns 1, so damage = 1 + 5 = 6
    expect(r.value.event.damageDealt).toBe(6);
  });

  it('death drops inventory and emits a death event', async () => {
    const a = paff();
    const t = orc({ hp: 1 });
    const sword: Item = {
      id: asItemId('item_sword'), worldId: W, label: 'sword', shortDescription: '', longDescription: '',
      owner: { kind: OwnerKind.Agent, id: t.id }, weight: 1, hidden: false, tags: [],
      equipped: false, container: false, opened: false, locked: false, lockedByItem: null, priceTag: null,
    };
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [sword], agents: [a, t], rngSeed: 1 });
    // count=1, sides=1 → guaranteed 1 damage; bonus=0; hp=1 → hp after = 0 → dies
    const action = { ...hitAction(a.id, t.id), damage: { count: 1, sides: 1, bonus: 0 } };
    const r = await handleCreativeAttack(action, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    expect(r.value.event.outcome).toBe('hit');
    // Sword should be transferred to location
    const droppedSword = await repo.getItem(asItemId('item_sword'));
    expect(droppedSword.owner).toEqual({ kind: 'location', id: A });
    // Death event should be in the log
    const events = await repo.recentEvents(10);
    const deathEvent = events.find((e) => e.kind === EventKind.Death);
    expect(deathEvent).toBeTruthy();
    if (!deathEvent || deathEvent.kind !== 'death') throw new Error();
    expect(deathEvent.targetAgentId).toBe(t.id);
  });

  it('advances the RNG seed', async () => {
    const a = paff();
    const t = orc();
    const repo = makeRepo(a, t);
    const before = await repo.getRngSeed();
    await handleCreativeAttack(hitAction(a.id, t.id), repo);
    expect(await repo.getRngSeed()).not.toBe(before);
  });

  it('returns Err when target is not in the same location', async () => {
    const a = paff();
    const t = orc({ locationId: B });
    const repo = makeRepo(a, t);
    const r = await handleCreativeAttack(hitAction(a.id, t.id), repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error.toLowerCase()).toContain("isn't here");
  });
});
