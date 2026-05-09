import {
  BuilderErrorKind,
  PublishOutcomeKind,
  TriggerEventKind,
  WorldKind,
} from '@core/domain/builder-kinds';
import {
  asAgentId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import {
  cloneLiveAsDraft,
  createDraft,
  deleteLocation,
  getWorldTree,
  publish,
  resetLiveToDraft,
  upsertAgent,
  upsertLocation,
  upsertLocationSpawnTrigger,
  upsertMonsterTemplate,
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
  it('creates a draft world', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await createDraft(repo, { displayName: 'My Draft', label: 'Draft' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const summary = await repo.getWorldSummary(r.value);
      expect(summary?.kind).toBe(WorldKind.Draft);
      expect(summary?.displayName).toBe('My Draft');
    }
  });

  it('upserts a location into a draft and reads it back via getWorldTree', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const W = created.value;
    const r = await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
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
    });
    expect(r.ok).toBe(false);
  });

  it('upsertLocation refuses to write directly to a live world', async () => {
    const repo = new MemoryBuilderRepository();
    const liveId = asWorldId('w_live_direct');
    await repo.createWorld({
      id: liveId,
      kind: WorldKind.Live,
      label: 'L',
      displayName: 'L',
      parentDraftId: null,
      playerAgentId: null,
    });
    const r = await upsertLocation(repo, liveId, {
      id: asLocationId('loc_x'),
      label: 'X',
      shortDescription: '',
      longDescription: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('world_kind_mismatch');
  });
});

const seedMinimalDraft = async (repo: MemoryBuilderRepository) => {
  const created = await createDraft(repo, { displayName: 'D', label: 'L' });
  if (!created.ok) throw new Error('create');
  const W = created.value;
  await upsertLocation(repo, W, {
    id: asLocationId('loc_a'),
    label: 'A',
    shortDescription: '',
    longDescription: '',
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
  });
  await repo.updateWorldSummary(W, { playerAgentId: asAgentId('char_p') });
  return W;
};

describe('publish', () => {
  it('refuses to publish a draft with validation problems', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error();
    const r = await publish(repo, created.value);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('validation_failed');
      expect((r.error.problems ?? []).length).toBeGreaterThan(0);
    }
  });

  it('creates a live world on first publish', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const r = await publish(repo, draftId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.outcome).toBe(PublishOutcomeKind.Created);
      const live = await repo.getWorldSummary(r.value.liveWorldId);
      expect(live?.kind).toBe('live');
      expect(live?.parentDraftId).toBe(draftId);
      const snap = await repo.readSnapshot(r.value.liveWorldId);
      expect(snap).not.toBeNull();
    }
  });

  it('merges the second publish without clobbering live drift', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const first = await publish(repo, draftId);
    if (!first.ok) throw new Error();
    const liveId = first.value.liveWorldId;

    // Simulate gameplay drift on a structural field.
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_a'),
      label: 'A from gameplay',
      shortDescription: '',
      longDescription: '',
    });
    // Author edits the same location.
    await upsertLocation(repo, draftId, {
      id: asLocationId('loc_a'),
      label: 'A from author',
      shortDescription: '',
      longDescription: '',
    });

    const second = await publish(repo, draftId);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.outcome).toBe(PublishOutcomeKind.Merged);
      expect(second.value.skipped).toHaveLength(1);
      const liveLocs = await repo.listLocations(liveId);
      const [firstLoc] = liveLocs;
      if (!firstLoc) throw new Error('expected loc');
      expect(firstLoc.label).toBe('A from gameplay');
    }
  });
});

describe('cloneLiveAsDraft', () => {
  it('copies a live world into a fresh draft', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const first = await publish(repo, draftId);
    if (!first.ok) throw new Error();
    const liveId = first.value.liveWorldId;
    const cloned = await cloneLiveAsDraft(repo, liveId);
    expect(cloned.ok).toBe(true);
    if (cloned.ok) {
      const tree = await getWorldTree(repo, cloned.value);
      if (!tree.ok) throw new Error();
      expect(tree.value.summary.kind).toBe('draft');
      expect(tree.value.locations.map((l) => l.id as string)).toEqual(['loc_a']);
      // Confirm the live world's parentDraftId was updated to point at the new draft.
      const updatedLive = await repo.getWorldSummary(liveId);
      expect(updatedLive?.parentDraftId).toBe(cloned.value);
    }
  });
});

describe('upsert/delete monster template + trigger', () => {
  it('upsertMonsterTemplate refuses against a live world', async () => {
    const repo = new MemoryBuilderRepository();
    const live = asWorldId('w_live_test');
    await repo.createWorld({
      id: live,
      kind: WorldKind.Live,
      label: 'L',
      displayName: 'L',
      parentDraftId: null,
      playerAgentId: null,
    });
    const r = await upsertMonsterTemplate(repo, live, sampleTemplateInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(BuilderErrorKind.WorldKindMismatch);
  });

  it('upsertLocationSpawnTrigger writes to a draft', async () => {
    const repo = new MemoryBuilderRepository();
    const draft = await createDraft(repo, { displayName: 'D', label: 'D' });
    if (!draft.ok) throw new Error(draft.error.message);
    await upsertLocation(repo, draft.value, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
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

describe('resetLiveToDraft', () => {
  it('replaces live rows with the draft', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const first = await publish(repo, draftId);
    if (!first.ok) throw new Error();
    const liveId = first.value.liveWorldId;
    // Drift live.
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_a'),
      label: 'A drifted',
      shortDescription: '',
      longDescription: '',
    });
    const r = await resetLiveToDraft(repo, draftId);
    expect(r.ok).toBe(true);
    const liveLocs = await repo.listLocations(liveId);
    const [first2] = liveLocs;
    if (!first2) throw new Error('expected loc');
    expect(first2.label).toBe('A');
  });
});
