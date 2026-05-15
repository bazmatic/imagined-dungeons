import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import {
  asAgentId,
  asEventId,
  asLocationId,
  asMonsterTemplateId,
  asWorldId,
} from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { generateSpawnNarration } from './narration';

const W = asWorldId('w_live');
const PLAYER = asAgentId('char_p');
const ZOMBIE = asAgentId('char_zombie');
const LOC_A = asLocationId('loc_a');

const location = {
  id: LOC_A,
  worldId: W,
  label: 'Ash Lane',
  shortDescription: 'A smoke-choked alley.',
  longDescription: 'A long dark alley filled with ash.',
  tags: [],
  secretDescription: '',
};

const playerAgent: Agent = {
  id: PLAYER,
  worldId: W,
  label: 'Paff',
  shortDescription: 'The player.',
  longDescription: 'The player character.',
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
  secretDescription: '',
};

const zombieAgent: Agent = {
  id: ZOMBIE,
  worldId: W,
  label: 'Ash Zombie',
  shortDescription: 'A blackened undead figure.',
  longDescription: 'A shambling corpse covered in ash.',
  locationId: LOC_A,
  hp: 8,
  damage: 2,
  defense: 0,
  capacity: 0,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: true,
  awake: true,
  gold: 0,
  tags: [],
  secretDescription: '',
};

function makeRepo() {
  return new MemoryRepository(W, {
    locations: [location],
    agents: [playerAgent, zombieAgent],
    exits: [],
    items: [],
  });
}

function makeSpawnEvent(opts: {
  spawnedAgentId?: typeof ZOMBIE;
  locationId?: typeof LOC_A;
  witnesses?: readonly (typeof PLAYER)[];
}): DomainEvent {
  return {
    id: asEventId('ev_spawn'),
    worldId: W,
    actorId: asAgentId('char_system'),
    kind: EventKind.AgentSpawned,
    spawnedAgentId: opts.spawnedAgentId ?? ZOMBIE,
    locationId: opts.locationId ?? LOC_A,
    witnesses: opts.witnesses ?? [PLAYER],
    templateId: asMonsterTemplateId('tpl_zombie'),
    createdAt: new Date(),
  };
}

describe('generateSpawnNarration', () => {
  it('returns [] when llm is null', async () => {
    const repo = makeRepo();
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({})],
      playerId: PLAYER,
      repo,
      llm: null,
    });
    expect(result).toEqual([]);
  });

  it('returns [] and makes no LLM call when player is not in witnesses', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '', parsed: { narration: 'Should not appear.' } }),
    });
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({ witnesses: [] })],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toEqual([]);
    expect(llm.calls).toHaveLength(0);
  });

  it('returns narration string when player is a witness', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '', parsed: { narration: 'A zombie lurches forward.' } }),
    });
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({ witnesses: [PLAYER] })],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toEqual(['A zombie lurches forward.']);
    expect(llm.calls).toHaveLength(1);
  });

  it('batches multiple spawns at the same location into one LLM call', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '', parsed: { narration: 'Two zombies appear.' } }),
    });
    const result = await generateSpawnNarration({
      spawnEvents: [
        makeSpawnEvent({ witnesses: [PLAYER] }),
        makeSpawnEvent({ witnesses: [PLAYER] }),
      ],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
  });

  it('returns [] and does not throw when LLM errors', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('LLM unavailable');
      },
    });
    const result = await generateSpawnNarration({
      spawnEvents: [makeSpawnEvent({ witnesses: [PLAYER] })],
      playerId: PLAYER,
      repo: makeRepo(),
      llm,
    });
    expect(result).toEqual([]);
  });
});
