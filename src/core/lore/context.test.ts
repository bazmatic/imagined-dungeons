import type { Location } from '@core/domain/entities';
import { asLocationId, asTagLoreId, asWorldId } from '@core/domain/ids';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { loadLoreContext } from './context';

const W = asWorldId('w_test');
const LOC = asLocationId('loc_sewer_1');

const sewerLocation = (): Location => ({
  id: LOC,
  worldId: W,
  label: 'Sewer Junction',
  shortDescription: 'wet',
  longDescription: 'wet and dark',
  tags: ['sewer'],
  secretDescription: '',
});

const setUp = async () => {
  const repo = new MemoryBuilderRepository();
  const engine = new MemoryRepository(W, {
    locations: [sewerLocation()],
    exits: [],
    items: [],
    agents: [],
  });
  await repo.writeWorldLore(W, {
    worldOverview: 'overview',
    storySoFar: 'story',
  });
  await repo.upsertTagLore(W, {
    id: asTagLoreId('tlr_cult'),
    tag: 'cult',
    title: 'Cult',
    description: 'cult-desc',
  });
  await repo.upsertTagLore(W, {
    id: asTagLoreId('tlr_sewer'),
    tag: 'sewer',
    title: 'Sewers',
    description: 'sewer-desc',
  });
  return { repo, engine };
};

describe('loadLoreContext', () => {
  it('returns world lore and empty tagDescriptions when subject has no tags and no location', async () => {
    const { repo, engine } = await setUp();
    const ctx = await loadLoreContext(repo, engine, W, {
      tags: [],
      locationId: null,
    });
    expect(ctx.worldOverview).toBe('overview');
    expect(ctx.storySoFar).toBe('story');
    expect(ctx.tagDescriptions).toEqual({});
  });

  it('resolves only the subject own tags when no location is given', async () => {
    const { repo, engine } = await setUp();
    const ctx = await loadLoreContext(repo, engine, W, {
      tags: ['cult'],
      locationId: null,
    });
    expect(ctx.tagDescriptions).toEqual({ cult: 'cult-desc' });
  });

  it('resolves only location tags when subject has no own tags', async () => {
    const { repo, engine } = await setUp();
    const ctx = await loadLoreContext(repo, engine, W, {
      tags: [],
      locationId: LOC,
    });
    expect(ctx.tagDescriptions).toEqual({ sewer: 'sewer-desc' });
  });

  it('unions subject tags with location tags', async () => {
    const { repo, engine } = await setUp();
    const ctx = await loadLoreContext(repo, engine, W, {
      tags: ['cult'],
      locationId: LOC,
    });
    expect(ctx.tagDescriptions).toEqual({
      cult: 'cult-desc',
      sewer: 'sewer-desc',
    });
  });

  it('drops tags that have no matching TagLore row', async () => {
    const { repo, engine } = await setUp();
    const ctx = await loadLoreContext(repo, engine, W, {
      tags: ['cult', 'unknown'],
      locationId: null,
    });
    expect(ctx.tagDescriptions).toEqual({ cult: 'cult-desc' });
  });
});
