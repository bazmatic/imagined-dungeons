import { asAgentId } from '@core/domain/ids';
import { runTurn } from '@core/engine/turn';
import { openDb } from '@infra/db';
import { BURNING_DISTRICT_WORLD_ID, seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';
import { describe, expect, it } from 'vitest';

const PAFF = asAgentId('char_39322');

describe('full flow against seeded burning district', () => {
  it('initial look shows the Flaming Goblet, items, NPCs, and exits', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const r = await runTurn(PAFF, 'look', repo);
      expect(r.render).toContain('The Flaming Goblet');
      expect(r.render.toLowerCase()).toContain('fire map');
      expect(r.render).toContain('Spark');
      expect(r.render.toLowerCase()).toContain('exits');
    } finally {
      h.close();
    }
  });

  it('locked Tavern Back Door blocks movement north with a clear message', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const r = await runTurn(PAFF, 'north', repo);
      expect(r.render.toLowerCase()).toContain('locked');
    } finally {
      h.close();
    }
  });

  it('south exits to the Dockside Markets', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const move = await runTurn(PAFF, 'south', repo);
      expect(move.render).toBe('You go south.');
      const look = await runTurn(PAFF, 'look', repo);
      expect(look.render).toContain('Dockside Markets');
    } finally {
      h.close();
    }
  });

  it('take + inventory + drop round-trip', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const take = await runTurn(PAFF, 'take fire map', repo);
      expect(take.render.toLowerCase()).toBe('taken: fire map.');
      const inv = await runTurn(PAFF, 'i', repo);
      expect(inv.render.toLowerCase()).toContain('fire map');
      const drop = await runTurn(PAFF, 'drop fire map', repo);
      expect(drop.render.toLowerCase()).toBe('dropped: fire map.');
    } finally {
      h.close();
    }
  });
});
