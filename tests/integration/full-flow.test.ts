import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { asAgentId } from '@core/domain/ids';
import { runTurn } from '@core/engine/turn';
import { openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../helpers/fake-language-model';

const PAFF = asAgentId('char_39322');

describe('full flow against seeded burning district', () => {
  it('initial look shows the Flaming Goblet, items, NPCs, and exits', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
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
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const r = await runTurn(PAFF, 'north', repo);
      expect(r.render.toLowerCase()).toContain('locked');
    } finally {
      h.close();
    }
  });

  it('south exits to the Dockside Markets', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
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
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
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

  it('"talk to spark, hello" runs end-to-end and persists narrations for every witness', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const llm = makeFakeLanguageModel({
        textResponder: (req) =>
          req.user.includes('Observer: Paff')
            ? 'You greet Spark warmly.'
            : 'Paff offers you a warm greeting.',
      });
      const r = await runTurn(PAFF, 'say hello', repo, { llm });
      expect(r.events).toHaveLength(1);
      const event = r.events[0];
      if (!event || event.kind !== 'speak') throw new Error('expected speak event');
      expect(event.narrations).toBeDefined();
      // Every witness has a narration.
      for (const witnessId of event.witnesses) {
        expect(event.narrations?.[witnessId]).toBeTruthy();
      }
      // Persisted with narrations.
      const recent = await repo.recentEvents(5);
      const persisted = recent[recent.length - 1];
      if (!persisted || persisted.kind !== 'speak') throw new Error('expected persisted speak');
      expect(persisted.narrations).toBeDefined();
    } finally {
      h.close();
    }
  });

  it('"emote wave at spark" runs end-to-end and is witnessed by Spark', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const here = await repo.agentsAt((await repo.getAgent(PAFF)).locationId);
      const spark = here.find((a) => a.label === 'Spark');
      if (!spark) throw new Error('Spark not seeded in starting room');
      const r = await runTurn(PAFF, 'emote wave at spark', repo);
      expect(r.events).toHaveLength(1);
      const event = r.events[0];
      if (!event || event.kind !== 'emote') throw new Error('expected emote event');
      expect(event.description).toBe('wave');
      expect(event.targetAgentId).toBe(spark.id);
      // Both witnesses received a (mechanical) narration.
      expect(event.witnesses).toEqual(expect.arrayContaining([PAFF, spark.id]));
      expect(event.narrations?.[PAFF]).toBeTruthy();
      expect(event.narrations?.[spark.id]).toBeTruthy();
      // Persisted with narrations.
      const recent = await repo.recentEvents(5);
      const persisted = recent[recent.length - 1];
      if (!persisted || persisted.kind !== 'emote') throw new Error('expected persisted emote');
      expect(persisted.narrations).toBeDefined();
    } finally {
      h.close();
    }
  });

  it('"emote shrugs" runs end-to-end as an untargeted emote', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const r = await runTurn(PAFF, 'emote shrugs', repo);
      expect(r.events).toHaveLength(1);
      const event = r.events[0];
      if (!event || event.kind !== 'emote') throw new Error('expected emote event');
      expect(event.description).toBe('shrugs');
      expect(event.targetAgentId).toBeNull();
      // Mechanical fallback for the actor's own POV.
      expect(r.render).toBe('You shrugs.');
    } finally {
      h.close();
    }
  });

  it('"attack spark" runs end-to-end with a determined outcome and reduced HP on hit', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const paff = await repo.getAgent(PAFF);
      const here = await repo.agentsAt(paff.locationId);
      const spark = here.find((a) => a.label === 'Spark');
      if (!spark) throw new Error('Spark not seeded in starting room');
      const r = await runTurn(PAFF, 'attack spark', repo);
      expect(r.events).toHaveLength(1);
      const event = r.events[0];
      if (!event || event.kind !== 'attack') throw new Error('expected attack event');
      const after = await repo.getAgent(spark.id);
      if (event.outcome === 'hit') {
        expect(after.hp).toBeLessThan(spark.hp);
      } else {
        expect(after.hp).toBe(spark.hp);
      }
      // The mechanical narration should be persisted on the event for both witnesses.
      expect(event.narrations?.[PAFF]).toBeTruthy();
      expect(event.narrations?.[spark.id]).toBeTruthy();
      // The render returned to the actor matches the actor's narration.
      expect(r.render).toBe(event.narrations?.[PAFF]);
    } finally {
      h.close();
    }
  });
});
