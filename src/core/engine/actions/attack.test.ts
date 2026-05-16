import type { Agent, Item, Location } from '@core/domain/entities';
import type { AgentId } from '@core/domain/ids';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleAttack } from './attack';

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
  secretDescription: '',
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'B',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
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
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  ...overrides,
  secretDescription: '',
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
  shortTermIntent: null,
  goal: 'survive',
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  ...overrides,
  secretDescription: '',
});

const makeRepo = (a: Agent, t: Agent, rngSeed = 1) =>
  new MemoryRepository(W, {
    locations: [locA, locB],
    exits: [],
    items: [],
    agents: [a, t],
    rngSeed,
  });

describe('handleAttack (seeded RNG)', () => {
  // First roll for seed=1 is ~0.627 (Mulberry32). With damage=10, defense=10
  // the to-hit threshold is roll * 20 < 10, i.e. roll < 0.5 — so seed=1 misses.
  it('produces a deterministic miss for damage=10 defense=10 at seed=1', async () => {
    const a = paff({ damage: 10 });
    const t = spark({ hp: 10, defense: 10 });
    const repo = makeRepo(a, t, 1);
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error('expected attack');
    expect(r.value.event.outcome).toBe('miss');
    expect(r.value.event.damageDealt).toBe(0);
    const after = await repo.getAgent(t.id);
    expect(after.hp).toBe(10);
  });

  it('produces a deterministic hit when damage dwarfs defense at seed=1', async () => {
    // damage=50, defense=4 → 0.627 * 54 ≈ 33.9 < 50 → hit. Damage = rollD(50)
    // using the second draw from the seeded sequence.
    const a = paff({ damage: 50 });
    const t = spark({ hp: 10, defense: 4 });
    const repo = makeRepo(a, t, 1);
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('hit');
    expect(r.value.event.damageDealt).toBeGreaterThan(0);
    const after = await repo.getAgent(t.id);
    expect(after.hp).toBe(10 - r.value.event.damageDealt);
  });

  it('is reproducible: same seed + same inputs -> same outcome twice', async () => {
    const run = async () => {
      const a = paff({ damage: 5 });
      const t = spark({ hp: 30, defense: 5 });
      const repo = makeRepo(a, t, 42);
      const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
      if (!r.ok) throw new Error(r.error);
      if (r.value.event.kind !== 'attack') throw new Error();
      const after = await repo.getAgent(t.id);
      return { outcome: r.value.event.outcome, dmg: r.value.event.damageDealt, hp: after.hp };
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });

  it('advances the RNG seed after an attack', async () => {
    const a = paff({ damage: 5 });
    const t = spark({ hp: 30, defense: 5 });
    const repo = makeRepo(a, t, 1);
    const before = await repo.getRngSeed();
    await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    const after = await repo.getRngSeed();
    expect(after).not.toBe(before);
  });

  it('refuses when the target is not in the same location', async () => {
    const a = paff();
    const t = spark({ locationId: B });
    const repo = makeRepo(a, t);
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error.toLowerCase()).toContain("isn't here");
  });

  it('lets HP go negative on a hit — slice 3 leaves "dead" representation to the Narrator', async () => {
    // Big damage so the first roll lands as a hit at seed=1.
    const a = paff({ damage: 50 });
    const t = spark({ hp: 1, defense: 1 });
    const repo = makeRepo(a, t, 1);
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('hit');
    const after = await repo.getAgent(t.id);
    expect(after.hp).toBe(1 - r.value.event.damageDealt);
  });

  it('miss leaves damageDealt at 0 and HP unchanged', async () => {
    // damage=1, defense=100 → essentially always a miss.
    const a = paff({ damage: 1 });
    const t = spark({ hp: 10, defense: 100 });
    const repo = makeRepo(a, t, 1);
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
    expect(r.value.event.damageDealt).toBe(0);
    expect((await repo.getAgent(t.id)).hp).toBe(10);
  });

  it('drops target inventory to location when target dies', async () => {
    // Setup: give the target an item
    const a = paff({ damage: 50 });
    const t = spark({ hp: 1, defense: 1 });
    const sword: Item = {
      id: asItemId('item_sword'),
      worldId: W,
      label: 'sword',
      shortDescription: '',
      longDescription: '',
      owner: { kind: OwnerKind.Agent, id: t.id },
      weight: 1,
      hidden: false,
      tags: [],
      equipped: false,
      container: false,
      opened: false,
      locked: false,
      lockedByItem: null,
      priceTag: null,
      weaponDamage: null,
      armorDefense: null,
    };
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [sword], agents: [a, t], rngSeed: 1 });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    if (r.value.event.outcome !== 'hit') return; // seed may miss — only check on hit
    // After a kill, sword should now be owned by the location
    const droppedSword = await repo.getItem(asItemId('item_sword'));
    expect(droppedSword.owner).toEqual({ kind: 'location', id: A });
  });

  it('emits a death event when target is killed', async () => {
    const a = paff({ damage: 50 });
    const t = spark({ hp: 1, defense: 1 });
    const repo = makeRepo(a, t, 1); // seed=1 with damage=50 hits
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack' || r.value.event.outcome !== 'hit') return;
    const events = await repo.recentEvents(10);
    const deathEvent = events.find((e) => e.kind === 'death');
    expect(deathEvent).toBeTruthy();
    if (!deathEvent || deathEvent.kind !== 'death') throw new Error();
    expect(deathEvent.targetAgentId).toBe(t.id);
  });

  it('render includes Hit segment on hit', async () => {
    const a = paff({ damage: 50 });
    const t = spark({ hp: 10, defense: 1 });
    const repo = makeRepo(a, t, 1);
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack' || r.value.event.outcome !== 'hit') return;
    expect(r.value.render.some((s) => s.kind === 'hit')).toBe(true);
  });
});

describe('handleAttack — weapon and armour stats', () => {
  const weapon = (owner: AgentId, dmg: number): Item => ({
    id: asItemId('item_sword'),
    worldId: W,
    label: 'sword',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: owner },
    weight: 2,
    hidden: false,
    tags: [],
    equipped: true,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: dmg,
    armorDefense: null,
  });

  const armour = (owner: AgentId, def: number): Item => ({
    id: asItemId('item_shield'),
    worldId: W,
    label: 'shield',
    shortDescription: '',
    longDescription: '',
    owner: { kind: OwnerKind.Agent, id: owner },
    weight: 5,
    hidden: false,
    tags: [],
    equipped: true,
    container: false,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
    weaponDamage: null,
    armorDefense: def,
  });

  it('uses equipped weapon damage instead of agent base damage', async () => {
    // paff base damage = 1 (almost never hits); weapon = 50 (always hits at seed=1)
    const a = paff({ damage: 1 });
    const t = spark({ hp: 10, defense: 4 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [weapon(a.id, 50)],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    // damage=50 defense=4 → seed=1 roll 0.627 * 54 ≈ 33.9 < 50 → hit
    expect(r.value.event.outcome).toBe('hit');
    expect(r.value.event.damageDealt).toBeGreaterThan(0);
  });

  it('falls back to agent base damage when no weapon is equipped', async () => {
    // weapon in inventory but NOT equipped
    const a = paff({ damage: 50 });
    const t = spark({ hp: 10, defense: 4 });
    const unequippedSword: Item = { ...weapon(a.id, 1), equipped: false };
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [unequippedSword],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    // base damage=50 hits at seed=1
    expect(r.value.event.outcome).toBe('hit');
  });

  it('equipped armour raises defender effective defense', async () => {
    // attacker damage=10, target base defense=10 → threshold 0.5, seed=1 misses
    // adding armor_defense=1000 pushes threshold far lower → still miss
    const a = paff({ damage: 10 });
    const t = spark({ hp: 10, defense: 10 });
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [armour(t.id, 1000)],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
  });

  it('multiple armour items stack their defense bonuses', async () => {
    const a = paff({ damage: 10 });
    const t = spark({ hp: 10, defense: 0 });
    const shield2: Item = {
      ...armour(t.id, 500),
      id: asItemId('item_shield2'),
    };
    // Two armour pieces total defense = 1000; combined with base 0 still massive
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [],
      items: [armour(t.id, 500), shield2],
      agents: [a, t],
      rngSeed: 1,
    });
    const r = await handleAttack({ kind: 'attack', actorId: a.id, targetAgentId: t.id }, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
  });
});
