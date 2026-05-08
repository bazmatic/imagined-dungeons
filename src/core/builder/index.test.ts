import { WorldKind } from '@core/domain/builder-kinds';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import { createDraft, deleteLocation, getWorldTree, upsertAgent, upsertLocation } from './index';

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
