import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import {
  asAgentId,
  asEventId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import { Direction, EventKind } from '@core/domain/kinds';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { runSpawnTickPass } from './tick-pass';

const W = asWorldId('w_live');
const PLAYER = asAgentId('char_p');
const LOC_A = asLocationId('loc_a');
const LOC_B = asLocationId('loc_b');
const TPL = asMonsterTemplateId('tpl_goblin');

const playerAgent: Agent = {
  id: PLAYER,
  worldId: W,
  label: 'Player',
  shortDescription: 'p',
  longDescription: 'p',
  locationId: LOC_A,
  hp: 10,
  damage: 1,
  defense: 0,
  capacity: 5,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
};

const moveEvent = (to = LOC_A): DomainEvent => ({
  id: asEventId('ev_1'),
  worldId: W,
  actorId: PLAYER,
  kind: EventKind.Move,
  witnesses: [],
  createdAt: new Date(0),
  from: LOC_B,
  to,
  direction: Direction.North,
});

let engineRepo: MemoryRepository;
let builderRepo: MemoryBuilderRepository;

beforeEach(async () => {
  engineRepo = new MemoryRepository(W, {
    locations: [
      {
        id: LOC_A,
        worldId: W,
        label: 'A',
        shortDescription: 'a',
        longDescription: 'a',
        tags: [],
        secretDescription: '',
      },
      {
        id: LOC_B,
        worldId: W,
        label: 'B',
        shortDescription: 'b',
        longDescription: 'b',
        tags: [],
        secretDescription: '',
      },
    ],
    exits: [],
    items: [],
    agents: [playerAgent],
  });
  builderRepo = new MemoryBuilderRepository();
  await builderRepo.upsertMonsterTemplate(W, {
    id: TPL,
    templateKey: 'goblin',
    label: 'goblin',
    shortDescription: 'a goblin',
    longDescription: 'a small goblin',
    hp: 5,
    mood: null,
    startingItems: [],
    tags: [],
  });
});

afterEach(() => vi.restoreAllMocks());

const perception = () => ({
  agentLocations: new Map([[PLAYER, LOC_A]]),
  itemTemplateKeys: new Map(),
  playerId: PLAYER,
});

const llm = makeFakeLanguageModel({
  responder: () => Promise.resolve({ raw: '{}', parsed: {} }),
});

describe('runSpawnTickPass', () => {
  it('mechanical trigger fires, agent is inserted, AgentSpawned event emitted', async () => {
    await builderRepo.upsertLocationSpawnTrigger(W, {
      id: asSpawnTriggerId('trg_1'),
      locationId: LOC_A,
      templateId: TPL,
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 1,
      oneShot: false,
      fireOnInitialPublish: false,
    });
    const result = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 1000,
    });
    expect(result.events).toHaveLength(1);
    const [evt] = result.events;
    if (!evt) throw new Error('expected one spawn event');
    expect(evt.kind).toBe(EventKind.AgentSpawned);
    // The new agent should now be in the builder repo (the writeable store).
    // In production, builder + engine repos share a backing DB so the engine
    // sees this too; the in-memory test fixtures are separate stores.
    const builderAgents = await builderRepo.listAgents(W);
    expect(builderAgents.map((a) => a.label)).toContain('goblin');
  });

  it('one-shot trigger fires once across two ticks', async () => {
    await builderRepo.upsertLocationSpawnTrigger(W, {
      id: asSpawnTriggerId('trg_oneshot'),
      locationId: LOC_A,
      templateId: TPL,
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 1,
      oneShot: true,
      fireOnInitialPublish: false,
    });
    const r1 = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 1000,
    });
    expect(r1.events).toHaveLength(1);
    const r2 = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 2000,
    });
    expect(r2.events).toHaveLength(0);
  });

  it('non-one-shot trigger fires every qualifying tick', async () => {
    await builderRepo.upsertLocationSpawnTrigger(W, {
      id: asSpawnTriggerId('trg_repeat'),
      locationId: LOC_A,
      templateId: TPL,
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 1,
      oneShot: false,
      fireOnInitialPublish: false,
    });
    const r1 = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 1000,
    });
    expect(r1.events).toHaveLength(1);
    const r2 = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 2000,
    });
    expect(r2.events).toHaveLength(1);
  });

  it('spawn cap clips beyond MAX_SPAWNS_PER_TICK = 8', async () => {
    await builderRepo.upsertLocationSpawnTrigger(W, {
      id: asSpawnTriggerId('trg_swarm'),
      locationId: LOC_A,
      templateId: TPL,
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 20,
      oneShot: false,
      fireOnInitialPublish: false,
    });
    const result = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 1000,
    });
    expect(result.events).toHaveLength(8);
  });

  it('no triggers → no events, no LLM call', async () => {
    const result = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 1000,
    });
    expect(result.events).toHaveLength(0);
    expect(llm.calls).toHaveLength(0);
  });

  it('spawned event has the player as a witness when player is in the spawn location', async () => {
    await builderRepo.upsertLocationSpawnTrigger(W, {
      id: asSpawnTriggerId('trg_w'),
      locationId: LOC_A,
      templateId: TPL,
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 1,
      oneShot: false,
      fireOnInitialPublish: false,
    });
    const result = await runSpawnTickPass({
      worldId: W,
      events: [moveEvent()],
      engineRepo,
      builderRepo,
      llm,
      perception: perception(),
      now: () => 1000,
    });
    const [evt] = result.events;
    if (!evt) throw new Error('expected one event');
    expect(evt.witnesses).toContain(PLAYER);
  });
});
