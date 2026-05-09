import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, TriggerFireState } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import {
  asAgentId,
  asEventId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import type { AgentId, LocationId } from '@core/domain/ids';
import { Direction, EventKind } from '@core/domain/kinds';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { type PerceptionView, matchJudgementTriggers, matchMechanicalTriggers } from './triggers';

const W = asWorldId('w_live');
const PLAYER = asAgentId('char_p');
const LOC_A = asLocationId('loc_a');
const LOC_B = asLocationId('loc_b');

const baseTrigger = (overrides: Partial<LocationSpawnTrigger> = {}): LocationSpawnTrigger => ({
  id: asSpawnTriggerId('trg_1'),
  worldId: W,
  locationId: LOC_A,
  templateId: asMonsterTemplateId('tpl_goblin'),
  params: { kind: TriggerEventKind.PlayerEnters },
  count: 1,
  oneShot: false,
  fireOnInitialPublish: false,
  ...overrides,
});

const emptyFireState: TriggerFireState = { byTriggerId: {} };

const basePerception = (overrides: Partial<PerceptionView> = {}): PerceptionView => ({
  agentLocations: new Map(),
  itemTemplateKeys: new Map(),
  playerId: PLAYER,
  ...overrides,
});

const baseEventFields = {
  id: asEventId('ev_1'),
  worldId: W,
  actorId: PLAYER,
  witnesses: [] as readonly AgentId[],
  createdAt: new Date(0),
};

describe('matchMechanicalTriggers', () => {
  it('PlayerEnters: matches a Move into the location', () => {
    const event: DomainEvent = {
      ...baseEventFields,
      actorId: PLAYER,
      kind: EventKind.Move,
      from: LOC_B,
      to: LOC_A,
      direction: Direction.North,
    };
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [baseTrigger()],
      fireState: emptyFireState,
      perception: basePerception(),
    });
    expect(hits).toHaveLength(1);
  });

  it('PlayerEnters: misses when destination differs', () => {
    const event: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Move,
      from: LOC_A,
      to: LOC_B,
      direction: Direction.North,
    };
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [baseTrigger()],
      fireState: emptyFireState,
      perception: basePerception(),
    });
    expect(hits).toHaveLength(0);
  });

  it('CombatStarts: matches when target is in the trigger location', () => {
    const target = asAgentId('char_goblin');
    const event: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Attack,
      targetAgentId: target,
      outcome: 'hit',
      damageDealt: 1,
    };
    const trigger = baseTrigger({ params: { kind: TriggerEventKind.CombatStarts } });
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [trigger],
      fireState: emptyFireState,
      perception: basePerception({ agentLocations: new Map([[target, LOC_A]]) }),
    });
    expect(hits).toHaveLength(1);
  });

  it('CombatStarts: misses when target is in a different location', () => {
    const target = asAgentId('char_goblin');
    const event: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Attack,
      targetAgentId: target,
      outcome: 'hit',
      damageDealt: 1,
    };
    const trigger = baseTrigger({ params: { kind: TriggerEventKind.CombatStarts } });
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [trigger],
      fireState: emptyFireState,
      perception: basePerception({ agentLocations: new Map([[target, LOC_B]]) }),
    });
    expect(hits).toHaveLength(0);
  });

  it('ItemTaken: matches without itemTemplateKey filter', () => {
    const event: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Take,
      itemId: asItemId('item_pebble'),
      from: LOC_A,
    };
    const trigger = baseTrigger({ params: { kind: TriggerEventKind.ItemTaken } });
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [trigger],
      fireState: emptyFireState,
      perception: basePerception(),
    });
    expect(hits).toHaveLength(1);
  });

  it('ItemTaken: misses when from differs', () => {
    const event: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Take,
      itemId: asItemId('item_pebble'),
      from: LOC_B,
    };
    const trigger = baseTrigger({ params: { kind: TriggerEventKind.ItemTaken } });
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [trigger],
      fireState: emptyFireState,
      perception: basePerception(),
    });
    expect(hits).toHaveLength(0);
  });

  it('ItemTaken: filters by itemTemplateKey when set', () => {
    const itemPebble = asItemId('item_pebble');
    const itemKey = asItemId('item_key');
    const eventPebble: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Take,
      itemId: itemPebble,
      from: LOC_A,
    };
    const eventKey: DomainEvent = {
      ...baseEventFields,
      id: asEventId('ev_2'),
      kind: EventKind.Take,
      itemId: itemKey,
      from: LOC_A,
    };
    const trigger = baseTrigger({
      params: { kind: TriggerEventKind.ItemTaken, itemTemplateKey: 'rusty_key' },
    });
    const perception = basePerception({
      itemTemplateKeys: new Map([
        [itemPebble, 'pebble'],
        [itemKey, 'rusty_key'],
      ]),
    });
    const hitsKey = matchMechanicalTriggers({
      events: [eventKey],
      triggers: [trigger],
      fireState: emptyFireState,
      perception,
    });
    expect(hitsKey).toHaveLength(1);
    const hitsPebble = matchMechanicalTriggers({
      events: [eventPebble],
      triggers: [trigger],
      fireState: emptyFireState,
      perception,
    });
    expect(hitsPebble).toHaveLength(0);
  });

  it('Speech: matches case-insensitive substring', () => {
    const speaker = asAgentId('char_npc');
    const event: DomainEvent = {
      ...baseEventFields,
      actorId: speaker,
      kind: EventKind.Speak,
      targetAgentId: null,
      utterance: 'Hark, the BANSHEE wails again',
    };
    const trigger = baseTrigger({
      params: { kind: TriggerEventKind.Speech, phrase: 'banshee' },
    });
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [trigger],
      fireState: emptyFireState,
      perception: basePerception({ agentLocations: new Map([[speaker, LOC_A]]) }),
    });
    expect(hits).toHaveLength(1);
  });

  it('Speech: misses when phrase absent', () => {
    const speaker = asAgentId('char_npc');
    const event: DomainEvent = {
      ...baseEventFields,
      actorId: speaker,
      kind: EventKind.Speak,
      targetAgentId: null,
      utterance: 'a quiet day',
    };
    const trigger = baseTrigger({
      params: { kind: TriggerEventKind.Speech, phrase: 'banshee' },
    });
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [trigger],
      fireState: emptyFireState,
      perception: basePerception({ agentLocations: new Map([[speaker, LOC_A]]) }),
    });
    expect(hits).toHaveLength(0);
  });

  it('oneShot: skips a trigger that has already fired', () => {
    const event: DomainEvent = {
      ...baseEventFields,
      kind: EventKind.Move,
      from: LOC_B,
      to: LOC_A,
      direction: Direction.North,
    };
    const fireState: TriggerFireState = {
      byTriggerId: { trg_1: { firedAt: 1 } },
    };
    const hits = matchMechanicalTriggers({
      events: [event],
      triggers: [baseTrigger({ oneShot: true })],
      fireState,
      perception: basePerception(),
    });
    expect(hits).toHaveLength(0);
  });
});

describe('matchJudgementTriggers', () => {
  const judgementTrigger = (
    overrides: Partial<LocationSpawnTrigger> = {},
  ): LocationSpawnTrigger => ({
    id: asSpawnTriggerId('trg_j'),
    worldId: W,
    locationId: LOC_A,
    templateId: asMonsterTemplateId('tpl_goblin'),
    params: { kind: TriggerEventKind.LlmJudgement, predicate: 'the room is noisy' },
    count: 1,
    oneShot: false,
    fireOnInitialPublish: false,
    ...overrides,
  });

  const noisyEvent = (loc: LocationId): DomainEvent => ({
    ...baseEventFields,
    kind: EventKind.Move,
    from: LOC_B,
    to: loc,
    direction: Direction.North,
  });

  it('fires when LLM returns matches:true and events occurred in the location', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => Promise.resolve({ raw: '{"matches":true}', parsed: { matches: true } }),
    });
    const result = await matchJudgementTriggers({
      events: [noisyEvent(LOC_A)],
      triggers: [judgementTrigger()],
      fireState: emptyFireState,
      perception: basePerception(),
      llm,
      judgementBudget: 4,
    });
    expect(result.hits).toHaveLength(1);
    expect(result.callsUsed).toBe(1);
  });

  it('does not fire when LLM returns matches:false', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => Promise.resolve({ raw: '{"matches":false}', parsed: { matches: false } }),
    });
    const result = await matchJudgementTriggers({
      events: [noisyEvent(LOC_A)],
      triggers: [judgementTrigger()],
      fireState: emptyFireState,
      perception: basePerception(),
      llm,
      judgementBudget: 4,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.callsUsed).toBe(1);
  });

  it('skips remaining triggers when budget is exhausted', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => Promise.resolve({ raw: '{"matches":true}', parsed: { matches: true } }),
    });
    const result = await matchJudgementTriggers({
      events: [noisyEvent(LOC_A)],
      triggers: [
        judgementTrigger({ id: asSpawnTriggerId('trg_a') }),
        judgementTrigger({ id: asSpawnTriggerId('trg_b') }),
        judgementTrigger({ id: asSpawnTriggerId('trg_c') }),
      ],
      fireState: emptyFireState,
      perception: basePerception(),
      llm,
      judgementBudget: 1,
    });
    expect(result.hits).toHaveLength(1);
    expect(result.callsUsed).toBe(1);
  });

  it('skips a oneShot trigger that has already fired', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => Promise.resolve({ raw: '{"matches":true}', parsed: { matches: true } }),
    });
    const fireState: TriggerFireState = {
      byTriggerId: { trg_j: { firedAt: 1 } },
    };
    const result = await matchJudgementTriggers({
      events: [noisyEvent(LOC_A)],
      triggers: [judgementTrigger({ oneShot: true })],
      fireState,
      perception: basePerception(),
      llm,
      judgementBudget: 4,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.callsUsed).toBe(0);
  });

  it('skips triggers whose location had no events this tick', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => Promise.resolve({ raw: '{"matches":true}', parsed: { matches: true } }),
    });
    const result = await matchJudgementTriggers({
      events: [noisyEvent(LOC_B)],
      triggers: [judgementTrigger()],
      fireState: emptyFireState,
      perception: basePerception(),
      llm,
      judgementBudget: 4,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.callsUsed).toBe(0);
    expect(llm.calls).toHaveLength(0);
  });

  it('returns no hits when llm is null', async () => {
    const result = await matchJudgementTriggers({
      events: [noisyEvent(LOC_A)],
      triggers: [judgementTrigger()],
      fireState: emptyFireState,
      perception: basePerception(),
      llm: null,
      judgementBudget: 4,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.callsUsed).toBe(0);
  });
});
