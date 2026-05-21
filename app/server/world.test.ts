import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { asWorldId } from '@core/domain/ids';
import { openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@infra/db';
import { eq } from 'drizzle-orm';
import * as schema from '@infra/schema';
import { getWorldContext } from './world';

describe('getWorldContext', () => {
  let db: DB;
  let close: () => void;

  beforeEach(async () => {
    const h = openDb(':memory:');
    db = h.db;
    close = h.close;
    await seedIfEmpty(db, BURNING_DISTRICT_CAMPAIGN);
  });

  afterEach(() => close());

  it('returns repo, playerId, displayName for a known live world', async () => {
    const ctx = await getWorldContext(db, asWorldId('w_burning_district'));
    expect(ctx.playerId).toBe('char_39322');
    expect(ctx.displayName).toBe('Imagined Dungeons — The Burning District');
    expect(ctx.repo).toBeDefined();
  });

  it('throws for an unknown worldId', async () => {
    await expect(
      getWorldContext(db, asWorldId('w_does_not_exist')),
    ).rejects.toThrow('World not found: w_does_not_exist');
  });

  it('throws when playerAgentId is null', async () => {
    await db.update(schema.worlds)
      .set({ playerAgentId: null })
      .where(eq(schema.worlds.id, 'w_burning_district'));

    await expect(
      getWorldContext(db, asWorldId('w_burning_district')),
    ).rejects.toThrow('World has no playerAgentId: w_burning_district');
  });
});
