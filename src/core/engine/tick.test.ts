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
import { EntityKind, EventKind, ExaminableKind, OwnerKind } from '@core/domain/kinds';
import { SegmentKind } from '@core/domain/segments';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { LlmGameAI } from './game-ai';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { makeCompositeParser } from './parser/composite';
import { runTick } from './tick';
import { TickChunkKind, type NpcTurnChunk, type PlayerTurnChunk } from './tick-stream-types';

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
  secretDescription: '',
};
const locB: Location = {
  id: B,
  worldId: W,
  label: 'Street',
  shortDescription: '',
  longDescription: 'A street.',
  tags: [],
  secretDescription: '',
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
  sideQuest: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
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
  sideQuest: null,
  goal: 'Explore',
  autonomous: true,
  awake: true,
  gold: 0,
  tags: [],
  secretDescription: '',
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
  sideQuest: null,
  goal: 'Spread chaos',
  autonomous: true,
  awake: true,
  gold: 0,
  tags: [],
  secretDescription: '',
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
    const r = await runTick(player.id, 'look', repo, { parse, ai: new LlmGameAI(llm) });
    expect(r.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'Tavern' });
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
    const r = await runTick(player.id, 'say hello', repo, { parse, ai: new LlmGameAI(llm) });
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
    await runTick(player.id, 'look', repo, { parse, ai: new LlmGameAI(llm) });
    // 2 NPCs both ticked: each calls the NPC mind once.
    expect(calls).toBe(2);
  });

  it('produces no NPC actions and no errors when llm is null (mechanical fallback path)', async () => {
    const repo = makeWorld();
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, ai: null });
    // NPC mind returned "wait" → unknown verb → failed event → no observable witness line.
    expect(r.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'Tavern' });
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
    const r = await runTick(player.id, 'look', repo, { parse, ai: new LlmGameAI(llm) });
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
      equipped: false,
      container: false,
      opened: true,
      locked: false,
      lockedByItem: null,
      priceTag: null,
      weaponDamage: null,
      armorDefense: null,
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
      sideQuest: null,
      goal: null,
      autonomous: false,
      awake: false,
      gold: 0,
      tags: [],
      secretDescription: '',
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
    const r = await runTick(player.id, 'take lantern', repo, { parse, ai: new LlmGameAI(llm) });
    // The event log includes a description_updated event.
    const descUpdates = r.events.filter((e) => e.kind === EventKind.DescriptionUpdated);
    expect(descUpdates).toHaveLength(1);
    // Subsequent `look` returns the new long description.
    const look = await runTick(player.id, 'look', repo, { parse, ai: new LlmGameAI(llm) });
    expect(look.render.some((s) => s.text.includes('A tavern, now darker without the lantern.'))).toBe(true);
  });

  it('with a null llm, the consequence pass is a no-op (slice-4 baseline)', async () => {
    const repo = makeWorld();
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, ai: null });
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
    const r = await runTick(player.id, 'search dusty corner', repo, {
      parse,
      ai: new LlmGameAI(llm),
      builderRepo,
    });
    const discoveryCalls = llm.calls.filter((c) => c.schemaName === 'discovery_response');
    // Exactly one discovery LLM call fired this tick.
    expect(discoveryCalls.length).toBe(1);
    // And it was the player's — the player's query appears in the prompt.
    const first = discoveryCalls[0];
    if (!first) throw new Error('expected one discovery call');
    expect(first.user).toContain('dusty corner');

    // Spark's `search the bar` turn also fired, but the budget was exhausted:
    // runTurn emits a Look(target=Room) event via the budget-exhausted
    // fallback branch (no LLM call) instead of dispatching to handleSearch.
    // We assert that event exists for Spark to prove the fallback path ran.
    const sparkFallback = r.events.find(
      (e) =>
        e.actorId === SPARK && e.kind === EventKind.Look && e.target.kind === ExaminableKind.Room,
    );
    expect(sparkFallback).toBeDefined();
  });

  it('aggregates events from player + NPCs in order', async () => {
    const repo = makeWorld();
    const llm = makeFakeLanguageModel({ textResponder: () => 'go north' });
    const parse = makeCompositeParser({ llm: null });
    const r = await runTick(player.id, 'look', repo, { parse, ai: new LlmGameAI(llm) });
    // First event = player look; later events include Spark moving.
    expect(r.events.length).toBeGreaterThanOrEqual(2);
    const first = r.events[0];
    if (!first) throw new Error('expected at least one event');
    expect(first.actorId).toBe(player.id);
  });

  it('onChunk: emits player_turn chunk first', async () => {
    const repo = makeWorld(); // player + Spark
    const chunks: Array<PlayerTurnChunk | NpcTurnChunk> = [];
    const llm = makeFakeLanguageModel({ textResponder: () => 'go north' });
    const parse = makeCompositeParser({ llm: null });
    await runTick(PLAYER, 'look', repo, {
      parse,
      ai: new LlmGameAI(llm),
      onChunk: (c) => chunks.push(c),
    });
    expect(chunks[0]?.kind).toBe(TickChunkKind.PlayerTurn);
    expect(chunks[0] as PlayerTurnChunk).toMatchObject({ render: expect.any(Array) });
  });

  it('onChunk: emits one npc_turn chunk per NPC that produces a visible action', async () => {
    const repo = makeWorld(); // player + Spark (autonomous)
    const chunks: Array<PlayerTurnChunk | NpcTurnChunk> = [];
    const llm = makeFakeLanguageModel({ textResponder: () => 'go north' });
    const parse = makeCompositeParser({ llm: null });
    await runTick(PLAYER, 'look', repo, {
      parse,
      ai: new LlmGameAI(llm),
      onChunk: (c) => chunks.push(c),
    });
    const npcChunks = chunks.filter((c) => c.kind === TickChunkKind.NpcTurn);
    expect(npcChunks).toHaveLength(1); // Spark moved north → one witnessed event
  });

  it('onChunk: emits no npc_turn chunks when no NPCs are visible', async () => {
    const repo = makeWorld([player]); // player only
    const chunks: Array<PlayerTurnChunk | NpcTurnChunk> = [];
    const parse = makeCompositeParser({ llm: null });
    await runTick(PLAYER, 'look', repo, {
      parse,
      ai: null,
      onChunk: (c) => chunks.push(c),
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].kind).toBe(TickChunkKind.PlayerTurn);
  });

  it('onChunk: is optional — runTick works without it', async () => {
    const repo = makeWorld();
    const parse = makeCompositeParser({ llm: null });
    await expect(runTick(PLAYER, 'look', repo, { parse, ai: null })).resolves.toBeTruthy();
  });

  it('record_effect consequence stores a trace that appears in a subsequent look description', async () => {
    const GRAFFITI = "a crude carving reading 'Paff woz ere' scratched into the wall";
    const NARRATED = `You look around the tavern. ${GRAFFITI}.`;

    const repo = makeWorld([player]);
    const llm = makeFakeLanguageModel({
      // consequence engine call: return a record_effect for the tavern
      responder: () => ({
        raw: '',
        parsed: {
          updatedStorySoFar: null,
          consequences: [
            {
              kind: 'record_effect',
              targetKind: EntityKind.Location,
              targetRef: 'Tavern',
              effect: GRAFFITI,
            },
          ],
        },
      }),
      // narrateRoomWithTraces call (completeText)
      textResponder: () => NARRATED,
    });
    const parse = makeCompositeParser({ llm: null });

    // Emote tick — consequence engine processes the emote event and stores the trace
    await runTick(player.id, 'emote carves graffiti into the wall', repo, {
      parse,
      ai: new LlmGameAI(llm),
    });

    // Trace must now be persisted
    const traces = await repo.getEntityTraces(EntityKind.Location, A, 10);
    expect(traces).toContain(GRAFFITI);

    // Subsequent look must incorporate the trace via narrateRoomWithTraces
    const look = await runTick(player.id, 'look', repo, { parse, ai: new LlmGameAI(llm) });
    const descSegment = look.render.find((s) => s.kind === SegmentKind.LocationDescription);
    expect(descSegment).toBeDefined();
    expect(descSegment?.text).toContain(GRAFFITI);
  });
});
