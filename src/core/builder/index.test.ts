import { BuilderErrorKind, TriggerEventKind, WorldKind } from '@core/domain/builder-kinds';
import {
  asAgentId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asTagLoreId,
  asWorldId,
} from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import {
  createDraft,
  createLiveForScratch,
  deleteLocation,
  deleteTagLore,
  getWorldLore,
  getWorldTree,
  loadStartingState,
  resetLiveFromStartingState,
  saveStartingState,
  updateWorldLore,
  upsertAgent,
  upsertItem,
  upsertLocation,
  upsertLocationSpawnTrigger,
  upsertMonsterTemplate,
  upsertTagLore,
} from './index';

const sampleTemplateInput = () => ({
  id: asMonsterTemplateId('tpl_goblin'),
  templateKey: 'goblin',
  label: 'goblin',
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hp: 5,
  mood: null,
  startingItems: [],
  tags: [],
});

const sampleTriggerInput = () => ({
  id: asSpawnTriggerId('trg_1'),
  locationId: asLocationId('loc_a'),
  templateId: asMonsterTemplateId('tpl_goblin'),
  params: { kind: TriggerEventKind.PlayerEnters },
  count: 1,
  oneShot: false,
  fireOnInitialPublish: false,
});

describe('builder facade — simple ops', () => {
  it('creates a draft (scratch) world', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await createDraft(repo, { displayName: 'My Draft', label: 'Draft' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const summary = await repo.getWorldSummary(r.value);
      expect(summary?.kind).toBe(WorldKind.Draft);
      expect(summary?.displayName).toBe('My Draft');
    }
  });

  it('upserts a location and reads it back via getWorldTree', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const W = created.value;
    const r = await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
      tags: [],
      secretDescription: '',
    });
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, W);
    expect(tree.ok).toBe(true);
    if (tree.ok) {
      expect(tree.value.locations).toHaveLength(1);
      const [first] = tree.value.locations;
      if (!first) throw new Error('expected a location');
      expect(first.label).toBe('A');
    }
  });

  it('deletes a location', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const W = created.value;
    await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
      tags: [],
      secretDescription: '',
    });
    const r = await deleteLocation(repo, W, asLocationId('loc_a'));
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, W);
    if (tree.ok) expect(tree.value.locations).toEqual([]);
  });

  it('getWorldTree errors on a missing world', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await getWorldTree(repo, asWorldId('w_nope'));
    expect(r.ok).toBe(false);
  });

  it('upsertAgent rejects when the parent world is missing', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await upsertAgent(repo, asWorldId('w_nope'), {
      id: asAgentId('char_x'),
      label: 'X',
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
      gold: 0,
      tags: [],
    });
    expect(r.ok).toBe(false);
  });

  it('upsertLocation succeeds on a live world (no more requireDraft gate)', async () => {
    const repo = new MemoryBuilderRepository();
    const liveId = asWorldId('w_live_direct');
    await repo.createWorld({
      id: liveId,
      kind: WorldKind.Live,
      label: 'L',
      displayName: 'L',
      parentDraftId: null,
      playerAgentId: null,
      coverImageUrl: null,
    });
    const r = await upsertLocation(repo, liveId, {
      id: asLocationId('loc_x'),
      label: 'X',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    expect(r.ok).toBe(true);
  });
});

const seedMinimalScratch = async (repo: MemoryBuilderRepository) => {
  const created = await createDraft(repo, { displayName: 'D', label: 'L' });
  if (!created.ok) throw new Error('create');
  const W = created.value;
  await upsertLocation(repo, W, {
    id: asLocationId('loc_a'),
    label: 'A',
    shortDescription: '',
    longDescription: '',
    tags: [],
    secretDescription: '',
  });
  await upsertAgent(repo, W, {
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
    gold: 0,
    tags: [],
  });
  await repo.updateWorldSummary(W, { playerAgentId: asAgentId('char_p') });
  return W;
};

describe('saveStartingState + loadStartingState', () => {
  it('round-trips structural rows, lore, and tag-lore', async () => {
    const repo = new MemoryBuilderRepository();
    const W = await seedMinimalScratch(repo);
    await updateWorldLore(repo, W, { worldOverview: 'overview', storySoFar: 'story' });
    await upsertTagLore(repo, W, {
      id: asTagLoreId('tlr_1'),
      tag: 'cult',
      title: 'Cult',
      description: 'd',
    });

    const saved = await saveStartingState(repo, W);
    expect(saved.ok).toBe(true);

    // Now drift the scratch.
    await deleteLocation(repo, W, asLocationId('loc_a'));
    await updateWorldLore(repo, W, { worldOverview: 'drift', storySoFar: 'drift' });

    const loaded = await loadStartingState(repo, W);
    expect(loaded.ok).toBe(true);
    const tree = await getWorldTree(repo, W);
    if (!tree.ok) throw new Error('tree');
    expect(tree.value.locations.map((l) => l.id as string)).toEqual(['loc_a']);
    expect(tree.value.worldLore.worldOverview).toBe('overview');
    expect(tree.value.tagLore).toHaveLength(1);
  });

  it('loadStartingState errors when no snapshot has ever been saved', async () => {
    const repo = new MemoryBuilderRepository();
    const W = await seedMinimalScratch(repo);
    const r = await loadStartingState(repo, W);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(BuilderErrorKind.SnapshotConflict);
  });
});

describe('resetLiveFromStartingState', () => {
  it('wholesale-replaces live entity tables (and lore) from the scratch snapshot', async () => {
    const repo = new MemoryBuilderRepository();
    const scratch = await seedMinimalScratch(repo);
    await updateWorldLore(repo, scratch, { worldOverview: 'authored', storySoFar: 's' });
    await saveStartingState(repo, scratch);

    const liveId = asWorldId('w_live_pair');
    const lp = await createLiveForScratch(repo, scratch, liveId);
    expect(lp.ok).toBe(true);

    // Drift live: change a location label, add a stray location, drift lore.
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_a'),
      label: 'A from gameplay',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_stray'),
      label: 'stray',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    await repo.writeWorldLore(liveId, { worldOverview: 'drifted', storySoFar: 'drifted' });

    const r = await resetLiveFromStartingState(repo, scratch);
    expect(r.ok).toBe(true);

    const liveTree = await getWorldTree(repo, liveId);
    if (!liveTree.ok) throw new Error('live tree');
    expect(liveTree.value.locations.map((l) => l.id as string)).toEqual(['loc_a']);
    const [a] = liveTree.value.locations;
    if (!a) throw new Error();
    expect(a.label).toBe('A');
    expect(liveTree.value.worldLore.worldOverview).toBe('authored');
  });

  it('errors if no live world is paired with the scratch', async () => {
    const repo = new MemoryBuilderRepository();
    const scratch = await seedMinimalScratch(repo);
    await saveStartingState(repo, scratch);
    const r = await resetLiveFromStartingState(repo, scratch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(BuilderErrorKind.NoLiveWorldForDraft);
  });

  it('errors if scratch has no saved snapshot', async () => {
    const repo = new MemoryBuilderRepository();
    const scratch = await seedMinimalScratch(repo);
    const liveId = asWorldId('w_live_pair2');
    // Create a paired live (without a snapshot saved first).
    await repo.createWorld({
      id: liveId,
      kind: WorldKind.Live,
      label: 'L',
      displayName: 'L',
      parentDraftId: scratch,
      playerAgentId: null,
      coverImageUrl: null,
    });
    const r = await resetLiveFromStartingState(repo, scratch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(BuilderErrorKind.SnapshotConflict);
  });
});

describe('lore + tag lore facade', () => {
  it('getWorldLore returns defaults for a fresh scratch', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const scratchId = created.value;
    const r = await getWorldLore(repo, scratchId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        worldId: scratchId,
        worldOverview: '',
        storySoFar: '',
      });
    }
  });

  it('updateWorldLore round-trips', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const scratchId = created.value;
    const upd = await updateWorldLore(repo, scratchId, {
      worldOverview: 'a noir city',
      storySoFar: 'the lights flicker',
    });
    expect(upd.ok).toBe(true);
    const got = await getWorldLore(repo, scratchId);
    if (got.ok) {
      expect(got.value.worldOverview).toBe('a noir city');
      expect(got.value.storySoFar).toBe('the lights flicker');
    }
  });

  it('updateWorldLore preserves the other field when only one is patched', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const scratchId = created.value;
    await updateWorldLore(repo, scratchId, { worldOverview: 'a', storySoFar: 'b' });
    await updateWorldLore(repo, scratchId, { worldOverview: 'A' });
    const got = await getWorldLore(repo, scratchId);
    if (got.ok) {
      expect(got.value.worldOverview).toBe('A');
      expect(got.value.storySoFar).toBe('b');
    }
  });

  it('upsertTagLore is visible in getWorldTree.tagLore', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const scratchId = created.value;
    const tagId = asTagLoreId('tlr_cult');
    const upserted = await upsertTagLore(repo, scratchId, {
      id: tagId,
      tag: 'cult',
      title: 'Cult of Embers',
      description: 'A secretive faction…',
    });
    expect(upserted.ok).toBe(true);
    const tree = await getWorldTree(repo, scratchId);
    expect(tree.ok).toBe(true);
    if (tree.ok) {
      expect(tree.value.tagLore).toHaveLength(1);
      const [first] = tree.value.tagLore;
      if (!first) throw new Error('expected one tag lore');
      expect(first.tag).toBe('cult');
    }
  });

  it('deleteTagLore removes the row', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const scratchId = created.value;
    const tagId = asTagLoreId('tlr_one');
    await upsertTagLore(repo, scratchId, {
      id: tagId,
      tag: 'x',
      title: 't',
      description: 'd',
    });
    const r = await deleteTagLore(repo, scratchId, tagId);
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, scratchId);
    if (tree.ok) expect(tree.value.tagLore).toHaveLength(0);
  });
});

describe('templates and triggers', () => {
  it('upsertLocationSpawnTrigger writes to a scratch', async () => {
    const repo = new MemoryBuilderRepository();
    const draft = await createDraft(repo, { displayName: 'D', label: 'D' });
    if (!draft.ok) throw new Error(draft.error.message);
    await upsertLocation(repo, draft.value, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
      tags: [],
      secretDescription: '',
    });
    await upsertMonsterTemplate(repo, draft.value, sampleTemplateInput());
    const r = await upsertLocationSpawnTrigger(repo, draft.value, sampleTriggerInput());
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, draft.value);
    if (!tree.ok) throw new Error(tree.error.message);
    expect(tree.value.triggers).toHaveLength(1);
    expect(tree.value.templates).toHaveLength(1);
  });
});

describe('upsertItem — owner-chain cycle rejection', () => {
  const locOwnedBox = (id: string) => ({
    id: asItemId(id),
    label: id,
    shortDescription: '',
    longDescription: '',
    ownerKind: OwnerKind.Location,
    ownerId: 'loc_a',
    weight: 1,
    hidden: false,
    tags: [],
    container: true,
    opened: false,
    locked: false,
    lockedByItem: null,
    priceTag: null,
  });

  it('rejects an item whose owner chain forms a cycle', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create');
    const W = created.value;
    await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    // box owned by loc_a
    const r1 = await upsertItem(repo, W, locOwnedBox('box'));
    if (!r1.ok) throw new Error('seed box');
    // key owned by box
    const r2 = await upsertItem(repo, W, {
      id: asItemId('key'),
      label: 'key',
      shortDescription: '',
      longDescription: '',
      ownerKind: OwnerKind.Item,
      ownerId: 'box',
      weight: 0,
      hidden: false,
      tags: [],
      container: false,
      opened: true,
      locked: false,
      lockedByItem: null,
      priceTag: null,
    });
    if (!r2.ok) throw new Error('seed key');
    // now try to re-parent box under key → box → key → box cycle
    const r = await upsertItem(repo, W, {
      id: asItemId('box'),
      label: 'box',
      shortDescription: '',
      longDescription: '',
      ownerKind: OwnerKind.Item,
      ownerId: 'key',
      weight: 1,
      hidden: false,
      tags: [],
      container: true,
      opened: false,
      locked: false,
      lockedByItem: null,
      priceTag: null,
    });
    if (r.ok) throw new Error('expected cycle rejection');
    expect(r.error.kind).toBe(BuilderErrorKind.ItemOwnerCycle);
  });

  it('rejects an item that owns itself', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create');
    const W = created.value;
    await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: '',
      longDescription: '',
      tags: [],
      secretDescription: '',
    });
    await upsertItem(repo, W, locOwnedBox('box'));
    const r = await upsertItem(repo, W, {
      id: asItemId('box'),
      label: 'box',
      shortDescription: '',
      longDescription: '',
      ownerKind: OwnerKind.Item,
      ownerId: 'box',
      weight: 1,
      hidden: false,
      tags: [],
      container: true,
      opened: false,
      locked: false,
      lockedByItem: null,
      priceTag: null,
    });
    if (r.ok) throw new Error('expected self-cycle rejection');
    expect(r.error.kind).toBe(BuilderErrorKind.ItemOwnerCycle);
  });
});
