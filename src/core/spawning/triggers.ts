import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, TriggerFireState } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ItemId, LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { JsonSchema, LanguageModel } from '@core/engine/language-model';

export interface PerceptionView {
  /** Map of agentId → its current locationId, for resolving combat targets / speech. */
  readonly agentLocations: ReadonlyMap<AgentId, LocationId>;
  /** Map of itemId → templateKey (for ItemTaken filter). */
  readonly itemTemplateKeys: ReadonlyMap<ItemId, string>;
  readonly playerId: AgentId;
}

export interface TriggerHit {
  readonly trigger: LocationSpawnTrigger;
}

const isFired = (state: TriggerFireState, id: string): boolean =>
  state.byTriggerId[id] !== undefined;

type MatchFn = (
  trigger: LocationSpawnTrigger,
  events: readonly DomainEvent[],
  perception: PerceptionView,
) => boolean;

const MATCHERS: Record<TriggerEventKind, MatchFn | null> = {
  [TriggerEventKind.PlayerEnters]: (t, events, p) =>
    events.some(
      (e) => e.kind === EventKind.Move && e.actorId === p.playerId && e.to === t.locationId,
    ),
  [TriggerEventKind.CombatStarts]: (t, events, p) =>
    events.some(
      (e) => e.kind === EventKind.Attack && p.agentLocations.get(e.targetAgentId) === t.locationId,
    ),
  [TriggerEventKind.ItemTaken]: (t, events, p) =>
    events.some((e) => {
      if (e.kind !== EventKind.Take) return false;
      if (e.from !== t.locationId) return false;
      if (t.params.kind !== TriggerEventKind.ItemTaken) return false;
      const key = t.params.itemTemplateKey;
      if (key === undefined) return true;
      return p.itemTemplateKeys.get(e.itemId) === key;
    }),
  [TriggerEventKind.Speech]: (t, events, p) =>
    events.some((e) => {
      if (e.kind !== EventKind.Speak) return false;
      if (p.agentLocations.get(e.actorId) !== t.locationId) return false;
      if (t.params.kind !== TriggerEventKind.Speech) return false;
      return e.utterance.toLowerCase().includes(t.params.phrase.toLowerCase());
    }),
  [TriggerEventKind.LlmJudgement]: null,
};

export function matchMechanicalTriggers(args: {
  readonly events: readonly DomainEvent[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly fireState: TriggerFireState;
  readonly perception: PerceptionView;
}): readonly TriggerHit[] {
  const hits: TriggerHit[] = [];
  for (const trigger of args.triggers) {
    const matcher = MATCHERS[trigger.params.kind];
    if (!matcher) continue;
    if (trigger.oneShot && isFired(args.fireState, trigger.id as string)) continue;
    if (matcher(trigger, args.events, args.perception)) {
      hits.push({ trigger });
    }
  }
  return hits;
}

const JUDGEMENT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { matches: { type: 'boolean' } },
  required: ['matches'],
  additionalProperties: false,
};

export interface JudgementResult {
  readonly hits: readonly TriggerHit[];
  readonly callsUsed: number;
}

function locationOfEvent(e: DomainEvent, p: PerceptionView): LocationId | null {
  switch (e.kind) {
    case EventKind.Move:
      return e.to;
    case EventKind.Take:
      return e.from;
    case EventKind.Drop:
      return e.to;
    case EventKind.Look:
      return e.locationId;
    case EventKind.AgentSpawned:
      return e.locationId;
    case EventKind.Speak:
    case EventKind.Emote:
    case EventKind.Attack:
    case EventKind.Give:
      return p.agentLocations.get(e.actorId) ?? null;
    default:
      return null;
  }
}

export async function matchJudgementTriggers(args: {
  readonly events: readonly DomainEvent[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly fireState: TriggerFireState;
  readonly perception: PerceptionView;
  readonly llm: LanguageModel | null;
  readonly judgementBudget: number;
}): Promise<JudgementResult> {
  if (!args.llm || args.judgementBudget <= 0) return { hits: [], callsUsed: 0 };

  const eventLocations = new Set<LocationId>();
  for (const e of args.events) {
    const loc = locationOfEvent(e, args.perception);
    if (loc !== null) eventLocations.add(loc);
  }

  const hits: TriggerHit[] = [];
  let calls = 0;
  for (const trigger of args.triggers) {
    if (trigger.params.kind !== TriggerEventKind.LlmJudgement) continue;
    if (trigger.oneShot && isFired(args.fireState, trigger.id as string)) continue;
    if (!eventLocations.has(trigger.locationId)) continue;
    if (calls >= args.judgementBudget) break;
    calls += 1;
    try {
      const eventsHere = args.events.filter(
        (e) => locationOfEvent(e, args.perception) === trigger.locationId,
      );
      const resp = await args.llm.complete({
        system:
          'You are a deterministic predicate evaluator. Answer whether the predicate is true given the recent events. Reply with strict JSON.',
        user: JSON.stringify({
          predicate: trigger.params.predicate,
          events: eventsHere.map((e) => ({ kind: e.kind, actorId: e.actorId })),
        }),
        schema: JUDGEMENT_SCHEMA,
        schemaName: 'TriggerJudgement',
      });
      const parsed = resp.parsed as { matches?: boolean };
      if (parsed?.matches === true) hits.push({ trigger });
    } catch {
      // Per spec — log + skip; trigger remains eligible for future ticks.
    }
  }
  return { hits, callsUsed: calls };
}
