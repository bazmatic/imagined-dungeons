import { asTagLoreId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { MemoryBuilderRepository } from './builder-memory-repository';

const W = asWorldId('w_test');

describe('MemoryBuilderRepository — lore', () => {
  it('readWorldLore returns defaults when no row exists', async () => {
    const repo = new MemoryBuilderRepository();
    const lore = await repo.readWorldLore(W);
    expect(lore).toEqual({ worldId: W, worldOverview: '', storySoFar: '' });
  });

  it('writeWorldLore round-trips through readWorldLore', async () => {
    const repo = new MemoryBuilderRepository();
    await repo.writeWorldLore(W, {
      worldOverview: 'a noir city',
      storySoFar: 'the lights flicker',
    });
    const lore = await repo.readWorldLore(W);
    expect(lore.worldOverview).toBe('a noir city');
    expect(lore.storySoFar).toBe('the lights flicker');
  });

  it('upsertTagLore + listTagLore + getTagLore round-trip', async () => {
    const repo = new MemoryBuilderRepository();
    const id = asTagLoreId('tlr_1');
    await repo.upsertTagLore(W, {
      id,
      tag: 'sewer',
      title: 'Sewer',
      description: 'tunnels under the city',
    });
    const list = await repo.listTagLore(W);
    expect(list).toHaveLength(1);
    const one = await repo.getTagLore(W, id);
    expect(one?.tag).toBe('sewer');
  });

  it('getTagLoreByTag finds the row by its tag', async () => {
    const repo = new MemoryBuilderRepository();
    await repo.upsertTagLore(W, {
      id: asTagLoreId('tlr_1'),
      tag: 'cult',
      title: 'Cult',
      description: 'devotees of the Burning Eye',
    });
    const found = await repo.getTagLoreByTag(W, 'cult');
    expect(found?.title).toBe('Cult');
    const missing = await repo.getTagLoreByTag(W, 'absent');
    expect(missing).toBeNull();
  });

  it('deleteTagLore removes the row', async () => {
    const repo = new MemoryBuilderRepository();
    const id = asTagLoreId('tlr_1');
    await repo.upsertTagLore(W, {
      id,
      tag: 'sewer',
      title: 'Sewer',
      description: 'tunnels',
    });
    await repo.deleteTagLore(W, id);
    expect(await repo.getTagLore(W, id)).toBeNull();
  });
});
