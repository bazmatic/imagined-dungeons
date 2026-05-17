import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { asAgentId } from '@core/domain/ids';
import { SegmentKind } from '@core/domain/segments';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';
import { describe, expect, it } from 'vitest';
import { LlmGameAI } from '@core/engine/game-ai';
import { makeFakeLanguageModel } from '../helpers/fake-language-model';

const PAFF = asAgentId('char_39322');
const SPARK = asAgentId('char_13498');

describe('runTick against the seeded burning district', () => {
  it("the player's `look` resolves and Spark (autonomous) takes a tick", async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
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
      const r = await runTick(PAFF, 'look', repo, { parse, ai: new LlmGameAI(llm) });

      expect(r.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'The Flaming Goblet' });
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
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'look', repo, { parse, ai: null });
      // The player's look still works.
      expect(r.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'The Flaming Goblet' });
      // No witnessed lines because "wait" is rejected by the parser as an
      // unknown verb — NPCs effectively do nothing.
      expect(r.witnessed).toEqual([]);
    } finally {
      h.close();
    }
  });

  it('"look at spark" returns Spark-shaped prose for the player', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'look at spark', repo, { parse, ai: null });
      // Spark's seeded backstory mentions hair that crackles with static
      // electricity; the mood ("Energetic") is appended by the template.
      expect(r.render.some((s) => s.text.toLowerCase().includes('halfling'))).toBe(true);
      expect(r.render.some((s) => s.text.toLowerCase().includes('energetic'))).toBe(true);
    } finally {
      h.close();
    }
  });

  it('"look at the fire map" returns the item long description', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'look at the fire map', repo, { parse, ai: null });
      expect(r.render.length).toBeGreaterThan(0);
      // Sanity: must NOT be the room view's first line.
      expect(r.render.every((s) => !s.text.startsWith('The Flaming Goblet'))).toBe(true);
    } finally {
      h.close();
    }
  });

  it('"look at the tavern back door" returns the exit description', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const parse = makeCompositeParser({ llm: null });
      const r = await runTick(PAFF, 'look at the tavern back door', repo, { parse, ai: null });
      // Exit prose mentions the label and a direction.
      expect(r.render.some((s) => s.text.toLowerCase().includes('back door'))).toBe(true);
      expect(
        r.render.some((s) =>
          /(north|south|east|west|up|down|northeast|northwest|southeast|southwest)/.test(s.text),
        ),
      ).toBe(true);
    } finally {
      h.close();
    }
  });

  it('"say hello" plus an NPC tick produces a visible NPC line in the player transcript', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);

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
      const r = await runTick(PAFF, 'say hello to spark', repo, { parse, ai: new LlmGameAI(llm) });

      // Player's narration came back.
      expect(r.render.length).toBeGreaterThan(0);
      // Spark's reply landed in `witnessed`.
      const sparkLine = r.witnessed.find((l) => l.toLowerCase().includes('spark'));
      expect(sparkLine).toBeTruthy();
    } finally {
      h.close();
    }
  });

  it('Spark sets his own sideQuest via QUEST: line, and his next-tick prompt reflects it', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);

      const sparkSystemPrompts: string[] = [];
      let sparkCallNo = 0;

      const llm = makeFakeLanguageModel({
        textResponder: (req) => {
          if (req.system.toLowerCase().includes('narrator')) {
            return 'Spark nods.';
          }
          if (req.system.includes('Spark')) {
            sparkSystemPrompts.push(req.system);
            sparkCallNo++;
            // First Spark tick: declare a new side quest. Second Spark tick: just wait.
            if (sparkCallNo === 1) {
              return 'QUEST: take the fire map to the docks\nI wait.';
            }
            return 'wait';
          }
          return 'wait';
        },
        responder: () => ({ raw: '', parsed: { consequences: [] } }),
      });
      const parse = makeCompositeParser({ llm: null });

      // Tick 1: NPC mind sets its own intent.
      await runTick(PAFF, 'say hello to spark', repo, { parse, ai: new LlmGameAI(llm) });
      const sparkAfter = await repo.getAgent(SPARK);
      expect(sparkAfter.sideQuest).toBe('take the fire map to the docks');

      // Tick 2: Spark's prompt now exposes the side quest in its header.
      sparkSystemPrompts.length = 0;
      await runTick(PAFF, 'wait', repo, { parse, ai: new LlmGameAI(llm) });
      const sparkPrompt = sparkSystemPrompts.find((p) => p.includes('Active side quest'));
      expect(sparkPrompt).toBeTruthy();
      expect(sparkPrompt).toContain('take the fire map to the docks');
    } finally {
      h.close();
    }
  });

  it('"wait" skips player dispatch but still ticks NPCs', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db, BURNING_DISTRICT_CAMPAIGN);
      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_CAMPAIGN.worldId);
      const parse = makeCompositeParser({ llm: null });
      // With null LLM, NPCs always wait too — so events stays empty and the
      // player's render is the friendly placeholder, not a "no such verb" error.
      const r = await runTick(PAFF, 'wait', repo, { parse, ai: null });
      expect(r.render[0]?.text).toBe('You wait.');
      // No player turn was dispatched, so no events from the player either.
      expect(r.events).toHaveLength(0);
    } finally {
      h.close();
    }
  });
});
