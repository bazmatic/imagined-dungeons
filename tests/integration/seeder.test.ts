import { asAgentId, asLocationId } from '@core/domain/ids';
import { openDb } from '@infra/db';
import { BURNING_DISTRICT_WORLD_ID, seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';
import { describe, expect, it } from 'vitest';

describe('seedIfEmpty', () => {
  it('seeds the burning district once and is a no-op on second call', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      await seedIfEmpty(h.db); // should not throw

      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const paff = await repo.getAgent(asAgentId('char_39322'));
      expect(paff.label).toBe('Paff Pinkerton');
      expect(paff.locationId).toBe('loc_flaming_goblet');
      const exits = await repo.exitsFrom(asLocationId('loc_flaming_goblet'));
      expect(exits.length).toBeGreaterThanOrEqual(2);
    } finally {
      h.close();
    }
  });
});
