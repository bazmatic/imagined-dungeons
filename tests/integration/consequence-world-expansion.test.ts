import {
  createDraft,
  createLiveForScratch,
  saveStartingState,
  upsertAgent,
  upsertLocation,
  upsertMonsterTemplate,
} from '@core/builder/index';
import { asAgentId, asLocationId, asMonsterTemplateId, asWorldId } from '@core/domain/ids';
import { ActionKind } from '@core/domain/kinds';
import { LlmGameAI } from '@core/engine/game-ai';
import type { LanguageModel } from '@core/engine/language-model';
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

function mockLlm(consequences: unknown[]): LanguageModel {
  return {
    async complete() {
      return { raw: '', parsed: { updatedStorySoFar: null, consequences } };
    },
    async completeText() {
      return '';
    },
  };
}

async function bootstrapWorld(builderRepo: SqliteBuilderRepository) {
  const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
  if (!created.ok) throw new Error(created.error.message);
  const W = created.value;

  const LOC_TAVERN = asLocationId('loc_tavern');
  await upsertLocation(builderRepo, W, {
    id: LOC_TAVERN,
    label: 'Tavern',
    shortDescription: 'a tavern',
    longDescription: 'A cosy tavern.',
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
    gold: 0,
    tags: [],
    secretDescription: '',
  });
  await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });

  const saved = await saveStartingState(builderRepo, W);
  if (!saved.ok) throw new Error(saved.error.message);
  const liveId = asWorldId(`w_live_${Math.random().toString(36).slice(2, 8)}`);
  const lp = await createLiveForScratch(builderRepo, W, liveId);
  if (!lp.ok) throw new Error(lp.error.message);

  return { W, LOC_TAVERN, PLAYER, liveId };
}

describe('consequence engine world expansion', () => {
  it('create_location consequence mints a new location in the live world', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    const llm = mockLlm([
      {
        kind: ActionKind.CreateLocation,
        id: 'loc_cellar',
        label: 'Hidden Cellar',
        shortDescription: 'A dark cellar.',
        longDescription: 'Dusty and forgotten.',
        secretDescription: '',
        tags: [],
      },
    ]);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    await runTick(PLAYER, 'look around', engineRepo, { parse, ai: new LlmGameAI(llm), builderRepo });

    const locs = await builderRepo.listLocations(liveId);
    const cellar = locs.find((l) => (l.id as string) === 'loc_cellar');
    expect(cellar).toBeDefined();
    expect(cellar?.label).toBe('Hidden Cellar');
  });

  it('create_agent consequence spawns a monster via template in the live world', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { W, LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    await upsertMonsterTemplate(builderRepo, W, {
      id: asMonsterTemplateId('tpl_rat'),
      templateKey: 'rat',
      label: 'giant rat',
      labelPrefixInstructions: null,
      shortDescription: 'a rat',
      longDescription: 'a very large rat',
      hpMin: 3,
      hpMax: 3,
      damageMin: 1,
      damageMax: 1,
      defenseMin: 0,
      defenseMax: 0,
      mood: null,
      startingItems: [],
      tags: [],
    });

    // The template was seeded into the draft world (W). createLiveForScratch
    // copies templates into the live world at creation time, but we added the
    // template after that call, so we upsert it directly into the live world.
    await builderRepo.upsertMonsterTemplate(liveId, {
      id: asMonsterTemplateId('tpl_rat'),
      templateKey: 'rat',
      label: 'giant rat',
      labelPrefixInstructions: null,
      shortDescription: 'a rat',
      longDescription: 'a very large rat',
      hpMin: 3,
      hpMax: 3,
      damageMin: 1,
      damageMax: 1,
      defenseMin: 0,
      defenseMax: 0,
      mood: null,
      startingItems: [],
      tags: [],
    });

    const llm = mockLlm([
      {
        kind: ActionKind.CreateAgent,
        templateKey: 'rat',
        locationId: LOC_TAVERN as string,
        count: 1,
      },
    ]);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    await runTick(PLAYER, 'look around', engineRepo, { parse, ai: new LlmGameAI(llm), builderRepo });

    const agents = await engineRepo.agentsAt(LOC_TAVERN);
    const rat = agents.find((a) => a.label === 'giant rat');
    expect(rat).toBeDefined();
  });

  it('create_agent with unknown templateKey is dropped silently', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    const llm = mockLlm([
      {
        kind: ActionKind.CreateAgent,
        templateKey: 'nonexistent_monster',
        locationId: LOC_TAVERN as string,
        count: 1,
      },
    ]);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    await expect(
      runTick(PLAYER, 'look around', engineRepo, { parse, ai: new LlmGameAI(llm), builderRepo }),
    ).resolves.toBeDefined();

    const agents = await engineRepo.agentsAt(LOC_TAVERN);
    expect(agents.filter((a) => a.label !== 'Player')).toHaveLength(0);
  });

  it('delete_entity removes an agent from the live world', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { W, LOC_TAVERN, PLAYER } = await bootstrapWorld(builderRepo);

    const NPC = asAgentId('char_barkeep');
    await upsertAgent(builderRepo, W, {
      id: NPC,
      label: 'Barkeep',
      shortDescription: 'a barkeep',
      longDescription: 'a barkeep',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    });

    const saved2 = await saveStartingState(builderRepo, W);
    if (!saved2.ok) throw new Error(saved2.error.message);
    const liveId2 = asWorldId(`w_live_del_${Math.random().toString(36).slice(2, 8)}`);
    const lp2 = await createLiveForScratch(builderRepo, W, liveId2);
    if (!lp2.ok) throw new Error(lp2.error.message);

    const engineRepo2 = new SqliteRepository(handle.db, liveId2);
    const parse = makeCompositeParser({ llm: null });

    const llm = mockLlm([
      {
        kind: ActionKind.DeleteEntity,
        targetKind: 'agent',
        entityId: NPC as string,
      },
    ]);

    await runTick(PLAYER, 'look around', engineRepo2, { parse, ai: new LlmGameAI(llm), builderRepo });

    const agents = await engineRepo2.agentsAt(LOC_TAVERN);
    expect(agents.find((a) => a.id === NPC)).toBeUndefined();
  });
});
