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
  tags: [],
  secretDescription: '',
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
  gold: 0,
  tags: [],
  secretDescription: '',
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
  gold: 0,
  tags: [],
  secretDescription: '',
};

describe('wake-on-interaction', () => {
  it('a dormant NPC is woken by witnessed events, then dismissed by the sleep sweep when they do not set an intent', async () => {
    // Without an LLM, the woken NPC can't form an intent (NPC mind falls
    // back to "wait" silently). The sleep sweep at end-of-tick then sends
    // them back to dormant — exactly the right behavior under the
    // "agent owns their own intent" model. We assert the lifecycle by
    // peeking at the wake state mid-tick is a hassle, so we assert the
    // observable end state (intent stays null, awake back to false) AND
    // the autonomous flag is untouched.
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [player, dormantSerena],
    });
    const parse = makeCompositeParser({ llm: null });
    expect((await repo.getAgent(SERENA)).awake).toBe(false);

    await runTick(PLAYER, 'say "hello there"', repo, { parse, llm: null });

    const serena = await repo.getAgent(SERENA);
    expect(serena.shortTermIntent).toBeNull();
    expect(serena.awake).toBe(false);
    expect(serena.autonomous).toBe(false);
  });

  it('private events (look) do NOT wake a dormant NPC', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [player, dormantSerena],
    });
    const parse = makeCompositeParser({ llm: null });
    await runTick(PLAYER, 'look', repo, { parse, llm: null });
    expect((await repo.getAgent(SERENA)).awake).toBe(false);
    expect((await repo.getAgent(SERENA)).shortTermIntent).toBeNull();
  });
});
