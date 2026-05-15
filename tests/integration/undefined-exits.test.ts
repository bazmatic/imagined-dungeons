import {
  createDraft,
  createLiveForScratch,
  saveStartingState,
  upsertAgent,
  upsertExit,
  upsertLocation,
} from '@core/builder/index';
import { asAgentId, asExitId, asLocationId, asWorldId } from '@core/domain/ids';
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

describe('undefined exits (Feature 2: auto-generated destinations)', () => {
  it('player traversing a null-destination exit creates a stub location and moves there', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);

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

    await upsertExit(builderRepo, W, {
      id: asExitId('exit_north'),
      from: LOC_TAVERN,
      to: null,
      direction: 'north',
      label: 'archway',
      locked: false,
      lockedByItem: null,
    });

    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_undef1');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    const result = await runTick(PLAYER, 'north', engineRepo, {
      parse,
      llm: null,
      builderRepo,
    });

    // Player should have moved
    const { EventKind } = await import('@core/domain/kinds');
    expect(result.events.some((e) => e.kind === EventKind.Move)).toBe(true);

    // Player should now be in a stub location (not the tavern)
    const player = await engineRepo.getAgent(PLAYER);
    expect(player.locationId).not.toBe(LOC_TAVERN);

    // The stub location should exist in the live world
    const stubLoc = await engineRepo.getLocation(player.locationId);
    expect(stubLoc.label).toContain('archway');

    // Original exit should now point to the stub
    const exits = await engineRepo.exitsFrom(LOC_TAVERN);
    const northExit = exits.find((e) => e.direction === 'north');
    expect(northExit?.to).toBe(player.locationId);

    // Reciprocal exit from stub back to tavern should exist
    const returnExits = await engineRepo.exitsFrom(player.locationId);
    const southReturn = returnExits.find((e) => e.direction === 'south');
    expect(southReturn?.to).toBe(LOC_TAVERN);
  });

  it('NPC traversing a null-destination exit is blocked', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);

    const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
    if (!created.ok) throw new Error(created.error.message);
    const W = created.value;

    const LOC_TAVERN = asLocationId('loc_tavern');
    await upsertLocation(builderRepo, W, {
      id: LOC_TAVERN,
      label: 'Tavern',
      shortDescription: 'a tavern',
      longDescription: 'A tavern.',
      tags: [],
      secretDescription: '',
    });

    const PLAYER = asAgentId('char_player');
    const NPC = asAgentId('char_npc');
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
    await upsertAgent(builderRepo, W, {
      id: NPC,
      label: 'Guard',
      shortDescription: 'a guard',
      longDescription: 'a guard',
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

    await upsertExit(builderRepo, W, {
      id: asExitId('exit_north'),
      from: LOC_TAVERN,
      to: null,
      direction: 'north',
      label: 'gate',
      locked: false,
      lockedByItem: null,
    });

    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_undef2');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);

    // NPC tries to go north — should fail (stay in tavern)
    const { handleMove } = await import('@core/engine/actions/move');
    const { ActionKind } = await import('@core/domain/kinds');
    const result = await handleMove(
      { kind: ActionKind.Move, actorId: NPC, direction: 'north' },
      engineRepo,
      { builderRepo }, // no worldId — but also NPC is not playerAgentId
    );

    expect(result.ok).toBe(false);
    const npc = await engineRepo.getAgent(NPC);
    expect(npc.locationId).toBe(LOC_TAVERN);
  });
});
