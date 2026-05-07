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
  goal: 'Map out all safe routes in the district',
  autonomous: true,
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
  goal: null,
  autonomous: false,
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
});
