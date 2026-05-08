import type { Agent, Location } from '@core/domain/entities';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';

const W = asWorldId('w');
const LOC = asLocationId('loc_room');
const PLAYER = asAgentId('char_player');
const SERENA = asAgentId('char_serena');

const loc: Location = {
  id: LOC,
  worldId: W,
  label: 'A room',
  shortDescription: '',
  longDescription: 'Just a room.',
};

const player: Agent = {
  id: PLAYER,
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: LOC,
  hp: 20,
  damage: 2,
  defense: 12,
  capacity: 30,
  mood: null,
  shortTermIntent: null,
  goal: null,
  autonomous: false,
};

const dormantSerena: Agent = {
  id: SERENA,
  worldId: W,
  label: 'Captain Serena',
  shortDescription: 'a tiefling sailor',
  longDescription: 'A tall tiefling.',
  locationId: LOC,
  hp: 25,
  damage: 3,
  defense: 14,
  capacity: 10,
  mood: 'Cautious',
  shortTermIntent: null,
  goal: 'Return to the sea',
  autonomous: false,
};

describe('wake-on-interaction', () => {
  it('addressing a dormant NPC by name in broadcast speech wakes them', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [player, dormantSerena],
    });
    const parse = makeCompositeParser({ llm: null });
    expect((await repo.getAgent(SERENA)).autonomous).toBe(false);
    await runTick(PLAYER, 'say "hello Captain Serena"', repo, { parse, llm: null });
    expect((await repo.getAgent(SERENA)).autonomous).toBe(true);
  });

  it('speaking with no addressee and no vocative does NOT wake a dormant NPC', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [player, dormantSerena],
    });
    const parse = makeCompositeParser({ llm: null });
    await runTick(PLAYER, 'say "the weather is nice"', repo, { parse, llm: null });
    expect((await repo.getAgent(SERENA)).autonomous).toBe(false);
  });
});
