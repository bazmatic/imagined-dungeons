import {
  createDraft,
  createLiveForScratch,
  saveStartingState,
  upsertAgent,
  upsertExit,
  upsertLocation,
  upsertLocationSpawnTrigger,
  upsertMonsterTemplate,
} from '@core/builder/index';
import { TriggerEventKind } from '@core/domain/builder-kinds';
import {
  asAgentId,
  asExitId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { SqliteRepository } from '@infra/sqlite-repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;

beforeEach(() => {
  handle = openDb(':memory:');
});
afterEach(() => handle.close());

describe('spawning end-to-end (tick pass)', () => {
  it('fires a one-shot PlayerEnters trigger when the player walks into the room', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);

    const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
    if (!created.ok) throw new Error(created.error.message);
    const W = created.value;

    const LOC_TAVERN = asLocationId('loc_tavern');
    const LOC_SEWER = asLocationId('loc_sewer');
    await upsertLocation(builderRepo, W, {
      id: LOC_TAVERN,
      label: 'Tavern',
      shortDescription: 'a tavern',
      longDescription: 'A cosy tavern.',
      tags: [],
      secretDescription: '',
    });
    await upsertLocation(builderRepo, W, {
      id: LOC_SEWER,
      label: 'Sewer',
      shortDescription: 'a sewer',
      longDescription: 'A dark, dank sewer.',
      tags: [],
      secretDescription: '',
    });

    const PLAYER = asAgentId('char_player');
    await upsertAgent(builderRepo, W, {
      id: PLAYER,
      label: 'Player',
      shortDescription: 'p',
      longDescription: 'p',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      tags: [],
    });

    await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });

    const TPL = asMonsterTemplateId('tpl_goblin');
    await upsertMonsterTemplate(builderRepo, W, {
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

    await upsertLocationSpawnTrigger(builderRepo, W, {
      id: asSpawnTriggerId('trg_sewer_goblin'),
      locationId: LOC_SEWER,
      templateId: TPL,
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 1,
      oneShot: true,
      fireOnInitialPublish: false,
    });

    await upsertExit(builderRepo, W, {
      id: asExitId('exit_tavern_sewer'),
      from: LOC_TAVERN,
      to: LOC_SEWER,
      direction: 'south',
      label: 'sewer hatch',
      locked: false,
      lockedByItem: null,
    });

    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_spawn1');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);

    const before = await engineRepo.agentsAt(LOC_SEWER);
    expect(before.filter((a) => a.label === 'goblin')).toHaveLength(0);

    const parse = makeCompositeParser({ llm: null });

    const result = await runTick(PLAYER, 'south', engineRepo, {
      parse,
      llm: null,
      builderRepo,
    });

    expect(result.events.some((e) => e.kind === EventKind.Move)).toBe(true);
    expect(result.events.some((e) => e.kind === EventKind.AgentSpawned)).toBe(true);

    const after = await engineRepo.agentsAt(LOC_SEWER);
    expect(after.filter((a) => a.label === 'goblin')).toHaveLength(1);

    expect(result.witnessed.some((line) => line.toLowerCase().includes('goblin'))).toBe(true);
  });

  it('one-shot trigger does not re-fire when the player exits and returns', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
    if (!created.ok) throw new Error(created.error.message);
    const W = created.value;

    const LOC_TAVERN = asLocationId('loc_tavern');
    const LOC_SEWER = asLocationId('loc_sewer');
    await upsertLocation(builderRepo, W, {
      id: LOC_TAVERN,
      label: 'Tavern',
      shortDescription: 'a tavern',
      longDescription: 'a tavern',
      tags: [],
      secretDescription: '',
    });
    await upsertLocation(builderRepo, W, {
      id: LOC_SEWER,
      label: 'Sewer',
      shortDescription: 'a sewer',
      longDescription: 'a sewer',
      tags: [],
      secretDescription: '',
    });
    const PLAYER = asAgentId('char_player');
    await upsertAgent(builderRepo, W, {
      id: PLAYER,
      label: 'Player',
      shortDescription: 'p',
      longDescription: 'p',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      tags: [],
    });
    await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });
    await upsertMonsterTemplate(builderRepo, W, {
      id: asMonsterTemplateId('tpl_goblin'),
      templateKey: 'goblin',
      label: 'goblin',
      shortDescription: 'g',
      longDescription: 'g',
      hp: 5,
      mood: null,
      startingItems: [],
      tags: [],
    });
    await upsertLocationSpawnTrigger(builderRepo, W, {
      id: asSpawnTriggerId('trg_sewer_goblin'),
      locationId: LOC_SEWER,
      templateId: asMonsterTemplateId('tpl_goblin'),
      params: { kind: TriggerEventKind.PlayerEnters },
      count: 1,
      oneShot: true,
      fireOnInitialPublish: false,
    });
    await upsertExit(builderRepo, W, {
      id: asExitId('exit_t_s'),
      from: LOC_TAVERN,
      to: LOC_SEWER,
      direction: 'south',
      label: 'hatch',
      locked: false,
      lockedByItem: null,
    });
    await upsertExit(builderRepo, W, {
      id: asExitId('exit_s_t'),
      from: LOC_SEWER,
      to: LOC_TAVERN,
      direction: 'north',
      label: 'ladder',
      locked: false,
      lockedByItem: null,
    });
    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_spawn2');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    const r1 = await runTick(PLAYER, 'south', engineRepo, { parse, llm: null, builderRepo });
    expect(r1.events.filter((e) => e.kind === EventKind.AgentSpawned)).toHaveLength(1);

    const r2 = await runTick(PLAYER, 'north', engineRepo, { parse, llm: null, builderRepo });
    expect(r2.events.filter((e) => e.kind === EventKind.AgentSpawned)).toHaveLength(0);

    const r3 = await runTick(PLAYER, 'south', engineRepo, { parse, llm: null, builderRepo });
    expect(r3.events.filter((e) => e.kind === EventKind.AgentSpawned)).toHaveLength(0);

    const sewerAgents = await engineRepo.agentsAt(LOC_SEWER);
    expect(sewerAgents.filter((a) => a.label === 'goblin')).toHaveLength(1);
  });
});
