import { asAgentId } from '@core/domain/ids';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { openDb } from '@infra/db';
import { BURNING_DISTRICT_WORLD_ID, seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../helpers/fake-language-model';

const PAFF = asAgentId('char_39322');
const SPARK = asAgentId('char_13498');

describe('runTick against the seeded burning district', () => {
  it("the player's `look` resolves and Spark (autonomous) takes a tick", async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      // Spark must be flagged autonomous in the seeded world (slice-4 default).
      const spark = await repo.getAgent(SPARK);
      expect(spark.autonomous).toBe(true);

      const llm = makeFakeLanguageModel({
        textResponder: (req) => {
          // NPC mind: Spark intends to grab the fire map.
          if (req.system.includes('Spark')) return 'take fire map';
          // Narrator: not exercised by mechanical actions.
          return 'narrative prose';
        },
      });
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'look', repo, { parse, llm });

      expect(r.render).toContain('The Flaming Goblet');
      // Player witnessed Spark picking up the fire map.
      const witnessed = r.witnessed.find((l) => l.toLowerCase().includes('spark'));
      expect(witnessed).toBeTruthy();
      expect(witnessed?.toLowerCase()).toContain('fire map');
    } finally {
      h.close();
    }
  });

  it('with a null LLM, NPC ticks fall back to "wait" and produce no errors', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'look', repo, { parse, llm: null });
      // The player's look still works.
      expect(r.render).toContain('The Flaming Goblet');
      // No witnessed lines because "wait" is rejected by the parser as an
      // unknown verb — NPCs effectively do nothing.
      expect(r.witnessed).toEqual([]);
    } finally {
      h.close();
    }
  });

  it('"say hello" plus an NPC tick produces a visible NPC line in the player transcript', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);

      const llm = makeFakeLanguageModel({
        textResponder: (req) => {
          // Distinguish narrator vs NPC mind by prompt content.
          if (req.system.toLowerCase().includes('narrator')) {
            if (req.user.includes('Observer: Paff')) {
              if (req.user.includes('Actor: Spark')) return 'Spark grins and says hi back.';
              return 'You greet Spark warmly.';
            }
            return 'Paff offers a warm greeting.';
          }
          // NPC mind for Spark.
          return 'say hi';
        },
      });
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'say hello to spark', repo, { parse, llm });

      // Player's narration came back.
      expect(r.render).toBeTruthy();
      // Spark's reply landed in `witnessed`.
      const sparkLine = r.witnessed.find((l) => l.toLowerCase().includes('spark'));
      expect(sparkLine).toBeTruthy();
    } finally {
      h.close();
    }
  });
});
