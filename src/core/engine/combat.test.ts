// src/core/engine/combat.test.ts
import type { Agent, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, asAgentId, asEventId, asLocationId, asWorldId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { isPlayerInCombat } from './combat';

const W = asWorldId('w');
const LOC_A = asLocationId('loc_a');
const LOC_B = asLocationId('loc_b');

const locA: Location = {
  id: LOC_A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '',
};
const locB: Location = {
  id: LOC_B, worldId: W, label: 'B', shortDescription: '', longDescription: '', tags: [], secretDescription: '',
};

const PLAYER_ID = asAgentId('char_player');
const GOBLIN_ID = asAgentId('char_goblin');
const OTHER_ID = asAgentId('char_other');

const player: Agent = {
  id: PLAYER_ID, worldId: W, label: 'Player', shortDescription: '', longDescription: '',
  locationId: LOC_A, hp: 10, damage: 2, defense: 1, capacity: 10,
  mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, gold: 0,
  tags: [], secretDescription: '',
};

function makeGoblin(overrides: Partial<Agent> = {}): Agent {
  return {
    id: GOBLIN_ID, worldId: W, label: 'Goblin', shortDescription: '', longDescription: '',
    locationId: LOC_A, hp: 5, damage: 2, defense: 1, capacity: 5,
    mood: null, shortTermIntent: 'attack the player', goal: null, autonomous: false, awake: true, gold: 0,
    tags: [], secretDescription: '',
    ...overrides,
  };
}

function attackEvent(actorId: AgentId, targetId: AgentId): DomainEvent {
  return {
    id: asEventId('evt_1'),
    worldId: W,
    actorId,
    kind: EventKind.Attack,
    witnesses: [actorId, targetId],
    createdAt: new Date(),
    targetAgentId: targetId,
    outcome: 'hit',
    damageDealt: 1,
  };
}

describe('isPlayerInCombat', () => {
  it('returns true when the player attacked a living, awake goblin', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin()] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(true);
  });

  it('returns true when the goblin attacked the player and the goblin is still alive and awake', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin()] });
    await repo.appendEvent(attackEvent(GOBLIN_ID, PLAYER_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(true);
  });

  it('returns false when no attack events exist', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin()] });
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when there is an attack event but the goblin is dead (hp <= 0)', async () => {
    const deadGoblin = makeGoblin({ hp: 0 });
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, deadGoblin] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when there is an attack event but the goblin is no longer awake', async () => {
    const dormantGoblin = makeGoblin({ awake: false });
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, dormantGoblin] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when a living awake goblin is present but the attack was between two other agents', async () => {
    const other: Agent = { ...makeGoblin(), id: OTHER_ID, label: 'Other' };
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin(), other] });
    await repo.appendEvent(attackEvent(GOBLIN_ID, OTHER_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when the goblin has moved to a different location', async () => {
    const goblinElsewhere = makeGoblin({ locationId: LOC_B });
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [], agents: [player, goblinElsewhere] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when there are no agents at the location', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });
});
