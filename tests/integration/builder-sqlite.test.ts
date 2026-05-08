import {
  cloneLiveAsDraft,
  createDraft,
  publish,
  upsertAgent,
  upsertLocation,
} from '@core/builder/index';
import { asAgentId, asLocationId } from '@core/domain/ids';
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
  it('round-trips a draft → publish → clone cycle', async () => {
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error();
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
    const pub = await publish(repo, W);
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      const cloned = await cloneLiveAsDraft(repo, pub.value.liveWorldId);
      expect(cloned.ok).toBe(true);
    }
  });
});
