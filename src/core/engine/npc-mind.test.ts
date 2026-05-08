import type { Agent, Location } from '@core/domain/entities';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { NpcFallbackIntent } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { decideNpcIntent } from './npc-mind';

const W = asWorldId('w');
const LOC = asLocationId('loc_x');
const SPARK_ID = asAgentId('char_spark');
const PAFF_ID = asAgentId('char_paff');

const loc: Location = {
  id: LOC,
  worldId: W,
  label: 'The Flaming Goblet',
  shortDescription: 'a tavern with a wall on fire',
  longDescription: 'A tavern with one wall constantly aflame.',
};

const spark: Agent = {
  id: SPARK_ID,
  worldId: W,
  label: 'Spark',
  shortDescription: 'a halfling courier',
  longDescription: 'Young halfling with crackling hair, swift messenger.',
  locationId: LOC,
  hp: 18,
  damage: 2,
  defense: 14,
  capacity: 10,
  mood: 'Energetic',
  shortTermIntent: null,
  goal: 'Map out all safe routes in the district',
  autonomous: true,
  awake: true,
};

const paff: Agent = {
  id: PAFF_ID,
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

const makeRepo = (): MemoryRepository =>
  new MemoryRepository(W, {
    locations: [loc],
    exits: [],
    items: [],
    agents: [spark, paff],
  });

describe('decideNpcIntent', () => {
  it('returns the LLM response trimmed when the model produces text', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => '  I want to head north and scout the street.  ',
    });
    const repo = makeRepo();
    const intent = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intent).toBe('I want to head north and scout the street.');
    expect(llm.textCalls).toHaveLength(1);
    const call = llm.textCalls[0];
    if (!call) throw new Error('expected textCall');
    expect(call.system).toContain('Spark');
    expect(call.system).toContain('Energetic');
    expect(call.system).toContain('Map out all safe routes');
    expect(call.user).toContain('The Flaming Goblet');
    expect(call.user).toContain('Paff');
  });

  it('returns the fallback intent "wait" when llm is null', async () => {
    const repo = makeRepo();
    const intent = await decideNpcIntent(SPARK_ID, repo, null);
    expect(intent).toBe(NpcFallbackIntent);
    expect(intent).toBe('wait');
  });

  it('falls back to "wait" and warns when the LLM throws', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => {
        throw new Error('boom');
      },
    });
    const repo = makeRepo();
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const intent = await decideNpcIntent(SPARK_ID, repo, llm);
      expect(intent).toBe(NpcFallbackIntent);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('falls back to "wait" when the LLM returns an empty string', async () => {
    const llm = makeFakeLanguageModel({ textResponder: () => '   ' });
    const repo = makeRepo();
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const intent = await decideNpcIntent(SPARK_ID, repo, llm);
      expect(intent).toBe(NpcFallbackIntent);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('NPC-mind prompt enumerates emote and the produced intent parses cleanly', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => 'I emote wave at Paff.',
    });
    const repo = makeRepo();
    const intent = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intent).toBe('I emote wave at Paff.');
    // System prompt should advertise emote.
    const call = llm.textCalls[0];
    expect(call?.system).toContain('emote');
    // Forbidden-verbs rule should NOT mention "smile" as forbidden any more.
    expect(call?.system ?? '').not.toMatch(/Do not use[^.]*"smile"/);
  });

  it('does not call the LLM when llm is null (no model usage on fallback)', async () => {
    const repo = makeRepo();
    // Sanity: passing null skips construction of the prompt entirely.
    await expect(decideNpcIntent(SPARK_ID, repo, null)).resolves.toBe('wait');
  });

  it("includes 'Current short-term intent' in the system prompt when set", async () => {
    const llm = makeFakeLanguageModel({ textResponder: () => 'I wait.' });
    const sparkWithIntent: Agent = {
      ...spark,
      shortTermIntent: 'deliver the fire map to the docks',
    };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [sparkWithIntent, paff],
    });
    await decideNpcIntent(SPARK_ID, repo, llm);
    const call = llm.textCalls[0];
    if (!call) throw new Error('expected textCall');
    expect(call.system).toContain('Current short-term intent: deliver the fire map to the docks');
  });

  it("does NOT include 'Current short-term intent' when null", async () => {
    const llm = makeFakeLanguageModel({ textResponder: () => 'I wait.' });
    const repo = makeRepo();
    await decideNpcIntent(SPARK_ID, repo, llm);
    const call = llm.textCalls[0];
    if (!call) throw new Error('expected textCall');
    expect(call.system).not.toMatch(/Current short-term intent:/);
  });

  it('clears own shortTermIntent when reply begins with INTENT_DONE; returns the trailing action', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => 'INTENT_DONE\nI wait.',
    });
    const sparkWithIntent: Agent = {
      ...spark,
      shortTermIntent: 'deliver the fire map to Captain Serena',
    };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [sparkWithIntent, paff],
    });
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBe(
      'deliver the fire map to Captain Serena',
    );
    const intent = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intent).toBe('I wait.');
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBeNull();
  });

  it('falls back to "wait" when INTENT_DONE arrives with no following action', async () => {
    const llm = makeFakeLanguageModel({ textResponder: () => 'INTENT_DONE' });
    const sparkWithIntent: Agent = {
      ...spark,
      shortTermIntent: 'deliver the fire map to Captain Serena',
    };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [sparkWithIntent, paff],
    });
    const intent = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intent).toBe(NpcFallbackIntent);
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBeNull();
  });

  it('behavioural priorities tell the agent to manage their own short-term intent', async () => {
    const llm = makeFakeLanguageModel({ textResponder: () => 'I wait.' });
    const repo = makeRepo();
    await decideNpcIntent(SPARK_ID, repo, llm);
    const call = llm.textCalls[0];
    if (!call) throw new Error('expected textCall');
    expect(call.system).toContain('short-term intent');
    expect(call.system).toMatch(/3\. Manage your own `Current short-term intent`/);
    expect(call.system).toMatch(/4\. Otherwise, pick something consistent with your long-term/);
  });

  it('reply format documents INTENT and INTENT_DONE control lines', async () => {
    const llm = makeFakeLanguageModel({ textResponder: () => 'I wait.' });
    const repo = makeRepo();
    await decideNpcIntent(SPARK_ID, repo, llm);
    const call = llm.textCalls[0];
    if (!call) throw new Error('expected textCall');
    expect(call.system).toContain('INTENT_DONE');
    expect(call.system).toContain('INTENT: <full plan>');
  });

  it('reply with `INTENT: <plan>` sets the agent shortTermIntent before the action runs', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => 'INTENT: deliver the fire map to Captain Serena\nI take the fire map.',
    });
    const repo = makeRepo();
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBeNull();
    const intent = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intent).toBe('I take the fire map.');
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBe(
      'deliver the fire map to Captain Serena',
    );
  });

  it('reply with `INTENT_DONE` followed by `INTENT: <new>` clears and re-sets in one tick', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => 'INTENT_DONE\nINTENT: head back to the tavern\nI move north.',
    });
    const sparkWithIntent: Agent = { ...spark, shortTermIntent: 'deliver the map' };
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [sparkWithIntent, paff],
    });
    const intent = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intent).toBe('I move north.');
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBe('head back to the tavern');
  });
});
