import type { Agent, Location } from '@core/domain/entities';
import { type AgentId, asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { MAX_NPCS_PER_TICK, scheduleNpcs } from './npc-scheduler';

const W = asWorldId('w');
const HERE = asLocationId('loc_here');
const ELSEWHERE = asLocationId('loc_elsewhere');

const here: Location = {
  id: HERE,
  worldId: W,
  label: 'Here',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
const elsewhere: Location = {
  id: ELSEWHERE,
  worldId: W,
  label: 'Elsewhere',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};

const mkAgent = (id: AgentId, opts: Partial<Agent>): Agent => ({
  id,
  worldId: W,
  label: id,
  shortDescription: '',
  longDescription: '',
  locationId: HERE,
  hp: 10,
  damage: 1,
  defense: 10,
  capacity: 10,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  ...opts,
  secretDescription: '',
});

const PLAYER = asAgentId('char_player');

describe('scheduleNpcs', () => {
  it('returns autonomous NPCs co-located with the player', async () => {
    const npc = mkAgent(asAgentId('char_a'), { autonomous: true });
    const repo = new MemoryRepository(W, {
      locations: [here, elsewhere],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), npc],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo });
    expect(ids).toEqual([npc.id]);
  });

  it('includes NPCs in other locations (offstage NPCs still tick so they can pursue intents)', async () => {
    const here_npc = mkAgent(asAgentId('char_here'), { autonomous: true });
    const there_npc = mkAgent(asAgentId('char_there'), {
      autonomous: true,
      awake: true,
      gold: 0,
      locationId: ELSEWHERE,
    });
    const repo = new MemoryRepository(W, {
      locations: [here, elsewhere],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), here_npc, there_npc],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo });
    // Both eligible. Co-located NPC ranks first (visible to the player).
    expect(ids).toEqual([here_npc.id, there_npc.id]);
  });

  it('prefers co-located NPCs over offstage ones when the cap is tight', async () => {
    const here_npc = mkAgent(asAgentId('char_here'), { autonomous: true });
    const there_npc = mkAgent(asAgentId('char_there'), {
      autonomous: true,
      locationId: ELSEWHERE,
    });
    const repo = new MemoryRepository(W, {
      locations: [here, elsewhere],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), here_npc, there_npc],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo, cap: 1 });
    expect(ids).toEqual([here_npc.id]);
  });

  it('excludes non-autonomous NPCs even when co-located', async () => {
    const auto_npc = mkAgent(asAgentId('char_auto'), { autonomous: true });
    const passive_npc = mkAgent(asAgentId('char_passive'), { autonomous: false });
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), auto_npc, passive_npc],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo });
    expect(ids).toEqual([auto_npc.id]);
  });

  it('excludes the player even if flagged autonomous', async () => {
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, { autonomous: true })],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo });
    expect(ids).toEqual([]);
  });

  it('excludes NPCs with hp <= 0', async () => {
    const dead_npc = mkAgent(asAgentId('char_dead'), { autonomous: true, awake: true, hp: 0 });
    const live_npc = mkAgent(asAgentId('char_live'), { autonomous: true });
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), dead_npc, live_npc],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo });
    expect(ids).toEqual([live_npc.id]);
  });

  it('returns ids sorted deterministically (lexicographic)', async () => {
    const c = mkAgent(asAgentId('char_c'), { autonomous: true });
    const a = mkAgent(asAgentId('char_a'), { autonomous: true });
    const b = mkAgent(asAgentId('char_b'), { autonomous: true });
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), c, a, b],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo, cap: 5 });
    expect(ids).toEqual([a.id, b.id, c.id]);
  });

  it('caps the result at MAX_NPCS_PER_TICK by default', async () => {
    const npcs = Array.from({ length: 5 }, (_, i) =>
      mkAgent(asAgentId(`char_${i}`), { autonomous: true }),
    );
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), ...npcs],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo });
    expect(ids.length).toBeLessThanOrEqual(MAX_NPCS_PER_TICK);
    expect(MAX_NPCS_PER_TICK).toBe(2);
  });

  it('honours an explicit cap override', async () => {
    const npcs = Array.from({ length: 5 }, (_, i) =>
      mkAgent(asAgentId(`char_${i}`), { autonomous: true }),
    );
    const repo = new MemoryRepository(W, {
      locations: [here],
      exits: [],
      items: [],
      agents: [mkAgent(PLAYER, {}), ...npcs],
    });
    const ids = await scheduleNpcs({ playerId: PLAYER, repo, cap: 3 });
    expect(ids.length).toBe(3);
  });
});
