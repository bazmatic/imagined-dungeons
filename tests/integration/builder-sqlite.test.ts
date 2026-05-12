import {
  createDraft,
  createLiveForScratch,
  deleteLocation,
  loadStartingState,
  resetLiveFromStartingState,
  saveStartingState,
  upsertAgent,
  upsertExit,
  upsertItem,
  upsertLocation,
} from '@core/builder/index';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asTagLoreId,
  asWorldId,
} from '@core/domain/ids';
import { Direction, OwnerKind } from '@core/domain/kinds';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;
let repo: SqliteBuilderRepository;

beforeEach(() => {
  handle = openDb(':memory:');
  repo = new SqliteBuilderRepository(handle.db);
});
afterEach(() => handle.close());

describe('SqliteBuilderRepository (via builder facade)', () => {
  it('save → drift → load round-trips a scratch via SQLite', async () => {
    const created = await createDraft(repo, { displayName: 'Seeded', label: 'Seeded' });
    if (!created.ok) throw new Error('createDraft failed');
    const scratch = created.value;

    await upsertLocation(repo, scratch, {
      id: asLocationId('loc_kitchen'),
      label: 'Kitchen',
      shortDescription: 'k',
      longDescription: 'kitchen',
      tags: [],
      secretDescription: '',
    });
    await upsertLocation(repo, scratch, {
      id: asLocationId('loc_pantry'),
      label: 'Pantry',
      shortDescription: 'p',
      longDescription: 'pantry',
      tags: [],
      secretDescription: '',
    });
    await upsertExit(repo, scratch, {
      id: asExitId('exit_kitchen_pantry'),
      from: asLocationId('loc_kitchen'),
      to: asLocationId('loc_pantry'),
      direction: Direction.North,
      label: 'door',
      locked: false,
      lockedByItem: null,
    });
    await upsertItem(repo, scratch, {
      id: asItemId('item_knife'),
      label: 'knife',
      shortDescription: 'a knife',
      longDescription: 'a sharp knife',
      ownerKind: OwnerKind.Location,
      ownerId: 'loc_kitchen',
      weight: 1,
      hidden: false,
      tags: [],
    });
    await upsertAgent(repo, scratch, {
      id: asAgentId('char_serena'),
      label: 'Serena',
      shortDescription: 's',
      longDescription: 'serena',
      locationId: asLocationId('loc_kitchen'),
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      tags: [],
    });
    await repo.updateWorldSummary(scratch, { playerAgentId: asAgentId('char_serena') });

    const saved = await saveStartingState(repo, scratch);
    expect(saved.ok).toBe(true);

    // Drift the scratch.
    await deleteLocation(repo, scratch, asLocationId('loc_pantry'));
    expect(await repo.listLocations(scratch)).toHaveLength(1);

    const loaded = await loadStartingState(repo, scratch);
    expect(loaded.ok).toBe(true);
    expect(await repo.listLocations(scratch)).toHaveLength(2);
    expect(await repo.listExits(scratch)).toHaveLength(1);
    expect(await repo.listItems(scratch)).toHaveLength(1);
    expect(await repo.listAgents(scratch)).toHaveLength(1);
  });

  it('resetLiveFromStartingState replaces the paired live world via SQLite', async () => {
    const created = await createDraft(repo, { displayName: 'D', label: 'D' });
    if (!created.ok) throw new Error('createDraft failed');
    const scratch = created.value;
    await upsertLocation(repo, scratch, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    await upsertAgent(repo, scratch, {
      id: asAgentId('char_p'),
      label: 'P',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 0,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      tags: [],
    });
    await repo.updateWorldSummary(scratch, { playerAgentId: asAgentId('char_p') });
    await saveStartingState(repo, scratch);

    const liveId = asWorldId('w_live_pair');
    const lp = await createLiveForScratch(repo, scratch, liveId);
    expect(lp.ok).toBe(true);

    // Drift live.
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_a'),
      label: 'A from gameplay',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    const r = await resetLiveFromStartingState(repo, scratch);
    expect(r.ok).toBe(true);
    const [first] = await repo.listLocations(liveId);
    if (!first) throw new Error();
    expect(first.label).toBe('A');
  });
});

describe('SqliteBuilderRepository — lore', () => {
  it('readWorldLore returns defaults when no row exists', async () => {
    const created = await createDraft(repo, { displayName: 'W', label: 'W' });
    if (!created.ok) throw new Error('createDraft failed');
    const W = created.value;
    const lore = await repo.readWorldLore(W);
    expect(lore).toEqual({ worldId: W, worldOverview: '', storySoFar: '' });
  });

  it('writeWorldLore + readWorldLore round-trip via SQLite', async () => {
    const created = await createDraft(repo, { displayName: 'W', label: 'W' });
    if (!created.ok) throw new Error('createDraft failed');
    const W = created.value;
    await repo.writeWorldLore(W, {
      worldOverview: 'a noir city',
      storySoFar: 'the lights flicker',
    });
    const lore = await repo.readWorldLore(W);
    expect(lore.worldOverview).toBe('a noir city');
    expect(lore.storySoFar).toBe('the lights flicker');
    // Idempotent upsert: writing again replaces.
    await repo.writeWorldLore(W, {
      worldOverview: 'a haunted city',
      storySoFar: 'the lights have gone out',
    });
    const lore2 = await repo.readWorldLore(W);
    expect(lore2.worldOverview).toBe('a haunted city');
  });

  it('tag_lore CRUD round-trip through SQLite', async () => {
    const created = await createDraft(repo, { displayName: 'W', label: 'W' });
    if (!created.ok) throw new Error('createDraft failed');
    const W = created.value;
    const sewerId = asTagLoreId('tlr_sewer');
    const cultId = asTagLoreId('tlr_cult');
    await repo.upsertTagLore(W, {
      id: sewerId,
      tag: 'sewer',
      title: 'Sewer',
      description: 'tunnels under the city',
    });
    await repo.upsertTagLore(W, {
      id: cultId,
      tag: 'cult',
      title: 'Cult',
      description: 'devotees of the Burning Eye',
    });
    const all = await repo.listTagLore(W);
    expect(all).toHaveLength(2);
    const bySewer = await repo.getTagLoreByTag(W, 'sewer');
    expect(bySewer?.title).toBe('Sewer');
    const byId = await repo.getTagLore(W, cultId);
    expect(byId?.tag).toBe('cult');
    await repo.deleteTagLore(W, sewerId);
    expect(await repo.getTagLore(W, sewerId)).toBeNull();
  });
});
