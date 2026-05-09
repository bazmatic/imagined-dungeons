import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, TriggerFireState } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ItemId, LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';

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
