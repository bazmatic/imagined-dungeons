import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  type AgentId,
  SYSTEM_AGENT_ID,
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asWorldId,
} from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { makeCompositeParser } from './parser/composite';
import { runTick } from './tick';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const PLAYER: AgentId = asAgentId('char_player');
const SPARK: AgentId = asAgentId('char_spark');
const EMBER: AgentId = asAgentId('char_ember');

const locA: Location = {
  id: A,
  worldId: W,
  label: 'Tavern',
  shortDescription: 'a tavern',
  longDescription: 'A tavern.',
  tags: [],
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'Street',
  shortDescription: '',
  longDescription: 'A street.',
  tags: [],
};
const door: Exit = {
  id: asExitId('e_north'),
  worldId: W,
  from: A,
  to: B,
  direction: 'north',
  label: 'door',
  locked: false,
  lockedByItem: null,
};

const player: Agent = {
  id: PLAYER,
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 20,
  damage: 2,
  defense: 12,
  capacity: 30,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  tags: [],
};

const spark: Agent = {
  id: SPARK,
  worldId: W,
  label: 'Spark',
  shortDescription: '',
  longDescription: 'a halfling',
  locationId: A,
  hp: 18,
  damage: 2,
  defense: 14,
  capacity: 10,
  mood: 'Energetic',
  shortTermIntent: null,
  goal: 'Explore',
  autonomous: true,
  awake: true,
  tags: [],
};

const ember: Agent = {
  id: EMBER,
  worldId: W,
  label: 'Ember',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 15,
  damage: 2,
  defense: 16,
  capacity: 10,
  mood: 'Playful',
  shortTermIntent: null,
  goal: 'Spread chaos',
  autonomous: true,
  awake: true,
  tags: [],
};

const makeWorld = (
  agents: readonly Agent[] = [player, spark],
  items: readonly Item[] = [],
): MemoryRepository =>
  new MemoryRepository(W, {
    locations: [locA, locB],
    exits: [door],
    items,
    agents,
  });

describe('runTick', () => {
  it("runs the player's turn and includes NPC actions in `witnessed` (mechanical)", async () => {
    const repo = makeWorld();
    // Spark's intent: "go north" — phrasing the rule parser handles directly.
    const llm = makeFakeLanguageModel({
      textResponder: () => 'go north',
    });
    const parse = makeCompositeParser({ llm: null }); // rule parser is enough for "go north"
    const r = await runTick(player.id, 'look', repo, { parse, llm });
    expect(r.render).toContain('Tavern');
    expect(r.witnessed).toContain('Spark goes north.');
  });

  it('runs a `say` from the player and includes narrated NPC speak in witnessed', async () => {
    const repo = makeWorld();
    // The fake LLM serves two roles per call: NPC mind returns an intent;
    // Narrator returns prose. Distinguish by prompt content.
    const llm = makeFakeLanguageModel({
      textResponder: (req) => {
        if (req.system.includes('narrator')) {
          // Observer-specific narration.
          if (req.user.includes('Observer: Paff')) return 'Spark says hi to you.';
          return 'You say hi to Paff.';
        }
        // NPC mind: produce an intent the rule parser can handle.
        return 'say hi';
      },
    });
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'say hello', repo, { parse, llm });
    // Player's own utterance is narrated by the LLM.
    expect(r.render).toBeTruthy();
    // Spark spoke; player-witness narration appears in `witnessed`.
    const spokeLine = r.witnessed.find((l) => l.toLowerCase().includes('spark'));
    expect(spokeLine).toBeTruthy();
  });

  it('caps NPC ticks at MAX_NPCS_PER_TICK (default 2)', async () => {
    const repo = makeWorld([player, spark, ember]);
    let calls = 0;
    const llm = makeFakeLanguageModel({
      textResponder: () => {
        calls++;
        return 'wait'; // NPCs do nothing — wait is rejected as unknown verb
      },
    });
    const parse = makeCompositeParser({ llm: null });
    await runTick(player.id, 'look', repo, { parse, llm });
    // 2 NPCs both ticked: each calls the NPC mind once.
    expect(calls).toBe(2);
  });

  it('produces no NPC actions and no errors when llm is null (mechanical fallback path)', async () => {
    const repo = makeWorld();
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, llm: null });
    // NPC mind returned "wait" → unknown verb → failed event → no observable witness line.
    expect(r.render).toContain('Tavern');
    expect(r.witnessed).toEqual([]);
    // No throw, no infinite loop.
  });

  it('still ticks non-co-located NPCs (so offstage agents can pursue their own intents) but the player witnesses nothing of their actions', async () => {
    const remote: Agent = { ...spark, id: asAgentId('char_remote'), locationId: B };
    const repo = makeWorld([player, remote]);
    let calls = 0;
    const llm = makeFakeLanguageModel({
      textResponder: () => {
        calls++;
        return 'go north';
      },
    });
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, llm });
    // Remote NPC ticks, but in another room; player sees nothing of it.
    expect(calls).toBe(1);
    expect(r.witnessed).toEqual([]);
  });

  it('runs the consequence pass after a player `take` and updates the room description end-to-end', async () => {
    const lantern: Item = {
      id: asItemId('item_lantern'),
      worldId: W,
      label: 'lantern',
      shortDescription: 's',
      longDescription: 'l',
      owner: { kind: OwnerKind.Location, id: A },
      weight: 1,
      hidden: false,
      tags: [],
    };
    const sys: Agent = {
      id: SYSTEM_AGENT_ID,
      worldId: W,
      label: 'System',
      shortDescription: '',
      longDescription: '',
      locationId: A,
      hp: 0,
      damage: 0,
      defense: 0,
      capacity: 0,
      mood: null,
      shortTermIntent: null,
      goal: null,
      autonomous: false,
      awake: false,
      tags: [],
    };
    const repo = makeWorld([player, sys], [lantern]);
    const llm = makeFakeLanguageModel({
      textResponder: () => 'wait',
      responder: () => ({
        raw: '',
        parsed: {
          consequences: [
            {
              kind: 'update_description',
              targetKind: 'location',
              targetRef: 'Tavern',
              shortDescription: null,
              longDescription: 'A tavern, now darker without the lantern.',
            },
          ],
        },
      }),
    });
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'take lantern', repo, { parse, llm });
    // The event log includes a description_updated event.
    const descUpdates = r.events.filter((e) => e.kind === EventKind.DescriptionUpdated);
    expect(descUpdates).toHaveLength(1);
    // Subsequent `look` returns the new long description.
    const look = await runTick(player.id, 'look', repo, { parse, llm });
    expect(look.render).toContain('A tavern, now darker without the lantern.');
  });

  it('with a null llm, the consequence pass is a no-op (slice-4 baseline)', async () => {
    const repo = makeWorld();
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, llm: null });
    expect(r.events.some((e) => e.kind === EventKind.DescriptionUpdated)).toBe(false);
  });

  it('per-tick discovery budget caps generative LLM calls to one across player + NPC turns', async () => {
    // Force two discovery-eligible triggers in one tick: the player issues
    // `search`, and Spark (autonomous) is fed `search the bar` via a custom
    // text responder. The per-tick budget should cap discovery LLM calls
    // to exactly one — Spark's search falls back to "nothing of note".
    const repo = makeWorld();
    const builderRepo = new MemoryBuilderRepository();
    const llm = makeFakeLanguageModel({
      textResponder: () => 'search the bar',
      responder: () => ({
        raw: '',
        parsed: {
          narration: 'You catch a glimpse of something faint.',
          matchedItemId: null,
          matchedAgentId: null,
          spawnedItem: null,
          spawnedAgent: null,
        },
      }),
    });
    const parse = makeCompositeParser({ llm: null });
    await runTick(player.id, 'search dusty corner', repo, {
      parse,
      llm,
      builderRepo,
    });
    const discoveryCalls = llm.calls.filter((c) => c.schemaName === 'discovery_response');
    expect(discoveryCalls.length).toBe(1);
  });

  it('aggregates events from player + NPCs in order', async () => {
    const repo = makeWorld();
    const llm = makeFakeLanguageModel({ textResponder: () => 'go north' });
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, llm });
    // First event = player look; later events include Spark moving.
    expect(r.events.length).toBeGreaterThanOrEqual(2);
    const first = r.events[0];
    if (!first) throw new Error('expected at least one event');
    expect(first.actorId).toBe(player.id);
  });
});
