import type { Agent, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { asAgentId, asEventId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it, vi } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { narrate } from './narrate';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const locA: Location = {
  id: A,
  worldId: W,
  label: 'Tavern',
  shortDescription: '',
  longDescription: '',
  tags: [],
  secretDescription: '',
};
const paff: Agent = {
  id: asAgentId('char_p'),
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 1,
  defense: 4,
  capacity: 10,
  mood: 'cheerful',
  shortTermIntent: null,
  goal: 'find Spark',
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};
const spark: Agent = {
  id: asAgentId('char_spark'),
  worldId: W,
  label: 'Spark',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 2,
  defense: 4,
  capacity: 10,
  mood: 'wary',
  shortTermIntent: null,
  goal: 'observe',
  autonomous: false,
  awake: false,
  gold: 0,
  tags: [],
  secretDescription: '',
};

const speakEvent: Extract<DomainEvent, { kind: 'speak' }> = {
  id: asEventId('evt1'),
  worldId: W,
  actorId: paff.id,
  kind: 'speak',
  witnesses: [paff.id, spark.id],
  createdAt: new Date(),
  targetAgentId: spark.id,
  utterance: 'hello there',
};

const repoOf = () =>
  new MemoryRepository(W, {
    locations: [locA],
    exits: [],
    items: [],
    agents: [paff, spark],
  });

describe('narrate', () => {
  it('returns the LLM-provided prose when the LLM is available', async () => {
    const repo = repoOf();
    const llm = makeFakeLanguageModel({
      textResponder: () => 'Paff grins and calls out a warm greeting.',
    });
    const prose = await narrate(speakEvent, spark, repo, llm);
    expect(prose).toBe('Paff grins and calls out a warm greeting.');
    expect(llm.textCalls).toHaveLength(1);
    // Observer mood and goal feed the prompt.
    expect(llm.textCalls[0]?.user).toContain('wary');
    expect(llm.textCalls[0]?.user).toContain('observe');
    expect(llm.textCalls[0]?.user).toContain('hello there');
  });

  it('falls back to the mechanical template when the LLM is null', async () => {
    const repo = repoOf();
    const prose = await narrate(speakEvent, spark, repo, null);
    expect(prose).toBe('Paff says to you: "hello there"');
  });

  it('falls back to mechanical template on LLM error and warns', async () => {
    const repo = repoOf();
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const llm = makeFakeLanguageModel({
      textResponder: () => {
        throw new Error('boom');
      },
    });
    const prose = await narrate(speakEvent, spark, repo, llm);
    expect(prose).toBe('Paff says to you: "hello there"');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('uses "you" for the actor when narrating from the actor\'s perspective', async () => {
    const repo = repoOf();
    const prose = await narrate(speakEvent, paff, repo, null);
    expect(prose).toBe('You say to Spark: "hello there"');
  });

  it('renders attack hit/miss with damage info mechanically', async () => {
    const hit: Extract<DomainEvent, { kind: 'attack' }> = {
      id: asEventId('e2'),
      worldId: W,
      actorId: paff.id,
      kind: 'attack',
      witnesses: [paff.id, spark.id],
      createdAt: new Date(),
      targetAgentId: spark.id,
      outcome: 'hit',
      damageDealt: 3,
    };
    const repo = repoOf();
    expect(await narrate(hit, paff, repo, null)).toBe(
      'You attack Spark. Hit! Spark takes 3 damage.',
    );
    const miss: Extract<DomainEvent, { kind: 'attack' }> = {
      ...hit,
      outcome: 'miss',
      damageDealt: 0,
    };
    expect(await narrate(miss, spark, repo, null)).toBe('Paff attacks you. Miss.');
  });
});
