import type { Agent, Location } from '@core/domain/entities';
import { asAgentId, asEventId, asLocationId, asWorldId } from '@core/domain/ids';
import { EventKind, NpcFallbackIntent } from '@core/domain/kinds';
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
  tags: [],
  secretDescription: '',
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
  gold: 0,
  tags: [],
  secretDescription: '',
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
  gold: 0,
  tags: [],
  secretDescription: '',
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
    expect(intent).toEqual(['I want to head north and scout the street.']);
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
    expect(intent).toEqual([NpcFallbackIntent]);
    expect(intent).toEqual(['wait']);
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
      expect(intent).toEqual([NpcFallbackIntent]);
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
      expect(intent).toEqual([NpcFallbackIntent]);
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
    expect(intent).toEqual(['I emote wave at Paff.']);
    // System prompt should advertise emote.
    const call = llm.textCalls[0];
    expect(call?.system).toContain('emote');
    // Forbidden-verbs rule should NOT mention "smile" as forbidden any more.
    expect(call?.system ?? '').not.toMatch(/Do not use[^.]*"smile"/);
  });

  it('does not call the LLM when llm is null (no model usage on fallback)', async () => {
    const repo = makeRepo();
    // Sanity: passing null skips construction of the prompt entirely.
    await expect(decideNpcIntent(SPARK_ID, repo, null)).resolves.toEqual(['wait']);
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
    expect(intent).toEqual(['I wait.']);
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
    expect(intent).toEqual([NpcFallbackIntent]);
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
    expect(intent).toEqual(['I take the fire map.']);
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
    expect(intent).toEqual(['I move north.']);
    expect((await repo.getAgent(SPARK_ID)).shortTermIntent).toBe('head back to the tavern');
  });

  it('returns speech AND a non-speech action when the reply has both — speech first', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () =>
        'THOUGHT: I should say goodbye and head out.\nI say "Be right back!" to Paff.\nI move north.',
    });
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [spark, paff],
    });
    const intents = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intents).toEqual(['I say "Be right back!" to Paff.', 'I move north.']);
  });

  it('drops a second physical-action line and keeps only the first when no speech is present', async () => {
    const llm = makeFakeLanguageModel({
      textResponder: () => 'I move north.\nI take the lantern.',
    });
    const repo = new MemoryRepository(W, {
      locations: [loc],
      exits: [],
      items: [],
      agents: [spark, paff],
    });
    const intents = await decideNpcIntent(SPARK_ID, repo, llm);
    expect(intents).toEqual(['I move north.']);
  });
});

describe('decideNpcIntent — tick-grouped memory prompt', () => {
  function makeSpyLlm(capturedPrompts: string[]) {
    return {
      completeText: async ({ user }: { system: string; user: string }) => {
        capturedPrompts.push(user);
        return 'I wait.';
      },
      complete: async () => ({ raw: '', parsed: {} }),
    };
  }

  function makeEvent(
    id: string,
    tickId: number | null,
    locationLabel: string | null,
    actorId = SPARK_ID,
  ) {
    return {
      id: asEventId(id),
      worldId: W,
      actorId,
      kind: EventKind.Inventory,
      witnesses: [SPARK_ID],
      createdAt: new Date(2000 + Number(id.replace(/\D/g, ''))),
      tickId,
      locationLabel,
    };
  }

  it('renders single tick group as "This turn" block', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([makeEvent('e1', 7, 'Town Hall')]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).toContain('What you have witnessed, oldest to most recent:');
    expect(captured[0]).toContain('This turn — Town Hall:');
    expect(captured[0]).not.toContain('What you have witnessed recently:');
  });

  it('renders multiple groups oldest-first with correct labels', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([
      makeEvent('e1', 5, 'Market'),
      makeEvent('e2', 6, 'Alley'),
      makeEvent('e3', 7, 'Tavern'),
    ]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, { memoryLimit: 8 });
    const prompt = captured[0] ?? '';
    const twoIdx = prompt.indexOf('Two turns ago — Market:');
    const lastIdx = prompt.indexOf('Last turn — Alley:');
    const thisIdx = prompt.indexOf('This turn — Tavern:');
    expect(twoIdx).toBeGreaterThan(-1);
    expect(lastIdx).toBeGreaterThan(twoIdx);
    expect(thisIdx).toBeGreaterThan(lastIdx);
  });

  it('renders null-tickId events under "Earlier:"', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([makeEvent('e1', null, null)]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).toContain('Earlier:');
  });

  it('caps groups to maxTurnDepth, keeping the most recent', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([
      makeEvent('e1', 1, 'Place A'),
      makeEvent('e2', 2, 'Place B'),
      makeEvent('e3', 3, 'Place C'),
      makeEvent('e4', 4, 'Place D'),
    ]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, {
      memoryLimit: 8,
      maxTurnDepth: 2,
    });
    const prompt = captured[0] ?? '';
    expect(prompt).not.toContain('Place A');
    expect(prompt).not.toContain('Place B');
    expect(prompt).toContain('Place C');
    expect(prompt).toContain('Place D');
  });

  it('omits memory section entirely when memory is empty', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).not.toContain('What you have witnessed');
  });

  it('omits location from header when locationLabel is null', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([makeEvent('e1', 7, null)]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).toContain('This turn:');
    expect(captured[0]).not.toContain('This turn — ');
  });

  it('renders null-tickId group as "Earlier" alongside a stamped group', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([
      makeEvent('e1', null, null),    // pre-migration event
      makeEvent('e2', 7, 'The Keep'), // current tick
    ]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeSpyLlm(captured) as any, { memoryLimit: 8 });
    const prompt = captured[0] ?? '';
    const earlierIdx = prompt.indexOf('Earlier:');
    const thisTurnIdx = prompt.indexOf('This turn — The Keep:');
    expect(earlierIdx).toBeGreaterThan(-1);
    expect(thisTurnIdx).toBeGreaterThan(-1);
    // "Earlier" must appear before "This turn"
    expect(earlierIdx).toBeLessThan(thisTurnIdx);
  });
});
