import {
  createDraft,
  createLiveForScratch,
  saveStartingState,
  updateWorldLore,
  upsertAgent,
  upsertLocation,
  upsertTagLore,
} from '@core/builder/index';
import type { DiscoveryResponse, UpsertItemInput } from '@core/domain/builder-types';
import { asAgentId, asItemId, asLocationId, asTagLoreId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import type { LanguageModelRequest, LanguageModelResponse } from '@core/engine/language-model';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { SqliteRepository } from '@infra/sqlite-repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../helpers/fake-language-model';

let handle: DbHandle;

beforeEach(() => {
  handle = openDb(':memory:');
});
afterEach(() => handle.close());

describe('lore + generative discovery — end-to-end', () => {
  it('search verb pulls lore context into the prompt and persists a spawned item', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);

    const created = await createDraft(builderRepo, {
      displayName: 'Noir',
      label: 'Noir',
    });
    if (!created.ok) throw new Error(created.error.message);
    const W = created.value;

    const LOC_SEWER = asLocationId('loc_sewer');
    const loc = await upsertLocation(builderRepo, W, {
      id: LOC_SEWER,
      label: 'Sewer',
      shortDescription: 'a sewer',
      longDescription: 'A dank, dripping sewer.',
      tags: ['sewer'],
      secretDescription: '',
    });
    if (!loc.ok) throw new Error(loc.error.message);

    const PLAYER = asAgentId('char_player');
    const ag = await upsertAgent(builderRepo, W, {
      id: PLAYER,
      label: 'Detective',
      shortDescription: 'a detective',
      longDescription: 'a hard-boiled detective',
      locationId: LOC_SEWER,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    });
    if (!ag.ok) throw new Error(ag.error.message);
    await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });

    const loreUpdate = await updateWorldLore(builderRepo, W, {
      worldOverview: 'sewers under a noir city',
      storySoFar: 'something stirs below',
    });
    if (!loreUpdate.ok) throw new Error(loreUpdate.error.message);

    const tlrSewer = await upsertTagLore(builderRepo, W, {
      id: asTagLoreId('tlr_sewer'),
      tag: 'sewer',
      title: 'Sewers',
      description: 'maze of tunnels haunted by cultists',
    });
    if (!tlrSewer.ok) throw new Error(tlrSewer.error.message);

    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_noir');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);

    const spawnedItem: UpsertItemInput = {
      id: asItemId('item_locket'),
      label: 'tarnished locket',
      shortDescription: 'a tarnished locket',
      longDescription: 'A tarnished silver locket, half-buried in the muck.',
      ownerKind: OwnerKind.Location,
      ownerId: 'loc_sewer',
      weight: 1,
      hidden: false,
      tags: [],
      container: false,
      opened: true,
      locked: false,
      lockedByItem: null,
      priceTag: null,
    };

    const responder = (_req: LanguageModelRequest): LanguageModelResponse => {
      const parsed: DiscoveryResponse = {
        narration: 'You spot a tarnished locket in the muck.',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem,
        spawnedAgent: null,
      };
      return { raw: '', parsed };
    };

    const llm = makeFakeLanguageModel({ responder });
    const parse = makeCompositeParser({ llm: null });

    const result = await runTick(PLAYER, 'search the drain', engineRepo, {
      parse,
      llm,
      builderRepo,
    });

    expect(llm.calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = llm.calls[0];
    expect(firstCall).toBeDefined();
    const userPrompt = firstCall?.user ?? '';
    expect(userPrompt).toContain('sewers under a noir city');
    expect(userPrompt).toContain('maze of tunnels haunted by cultists');

    const items = await builderRepo.listItems(liveId);
    expect(items.some((i) => i.label === 'tarnished locket')).toBe(true);

    // Sanity: the player render came from the discovery narration.
    expect(result.render.some((s) => s.text.toLowerCase().includes('locket'))).toBe(true);
  });
});
