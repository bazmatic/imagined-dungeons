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
  awake: false,
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
  awake: false,
};

describe('wake-on-interaction', () => {
  it('any noteworthy event the dormant NPC witnesses sets awake=true and seeds an intent', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [player, dormantSerena],
    });
    const parse = makeCompositeParser({ llm: null });
    expect((await repo.getAgent(SERENA)).awake).toBe(false);
    expect((await repo.getAgent(SERENA)).shortTermIntent).toBeNull();

    await runTick(PLAYER, 'say "hello there"', repo, { parse, llm: null });

    const serena = await repo.getAgent(SERENA);
    expect(serena.awake).toBe(true);
    // Wake seeds a non-null short-term intent so the NPC has a reason to
    // tick on subsequent turns until the consequence engine clears it.
    expect(serena.shortTermIntent).not.toBeNull();
    // The seed-only autonomous flag is unchanged — wake doesn't promote.
    expect(serena.autonomous).toBe(false);
  });

  it('private events (look, inventory) do NOT wake a dormant NPC', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [player, dormantSerena],
    });
    const parse = makeCompositeParser({ llm: null });
    await runTick(PLAYER, 'look', repo, { parse, llm: null });
    expect((await repo.getAgent(SERENA)).awake).toBe(false);
  });
});
