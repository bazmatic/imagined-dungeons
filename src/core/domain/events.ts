import type { DescriptionTarget } from './actions';
import type { Direction } from './entities';
import type { ExaminableTarget } from './examinable';
import type { AgentId, EventId, ItemId, LocationId, MonsterTemplateId, WorldId } from './ids';
import { EventKind } from './kinds';

export { EventKind } from './kinds';

export interface BaseEvent {
  readonly id: EventId;
  readonly worldId: WorldId;
  readonly actorId: AgentId;
  readonly kind: EventKind;
  readonly witnesses: readonly AgentId[];
  readonly createdAt: Date;
  readonly narrations?: Readonly<Record<string, string>>;
  readonly tickId?: number | null;
  readonly locationLabel?: string | null;
}

export type DomainEvent =
  | (BaseEvent & { kind: 'move'; from: LocationId; to: LocationId; direction: Direction })
  | (BaseEvent & { kind: 'take'; itemId: ItemId; from: LocationId })
  | (BaseEvent & { kind: 'drop'; itemId: ItemId; to: LocationId })
  | (BaseEvent & { kind: 'give'; itemId: ItemId; targetAgentId: AgentId })
  | (BaseEvent & { kind: 'look'; locationId: LocationId; target: ExaminableTarget })
  | (BaseEvent & { kind: 'inventory' })
  | (BaseEvent & { kind: 'failed'; attempted: string; reason: string })
  | (BaseEvent & { kind: 'speak'; targetAgentId: AgentId | null; utterance: string })
  | (BaseEvent & {
      kind: 'emote';
      description: string;
      targetAgentId: AgentId | null;
    })
  | (BaseEvent & {
      kind: 'attack';
      targetAgentId: AgentId;
      outcome: 'hit' | 'miss';
      damageDealt: number;
    })
  | (BaseEvent & {
      kind: 'creative_attack';
      targetAgentId: AgentId;
      outcome: 'hit' | 'miss';
      damageDealt: number;
      narrative: string;
    })
  /**
   * The event kind name `description_updated` is retained for compatibility
   * with persisted history; the payload now also covers mood and short-term
   * intent on agent targets. For non-agent targets the new mood/intent
   * before/after fields are always null.
   */
  | (BaseEvent & {
      kind: 'description_updated';
      target: DescriptionTarget;
      shortBefore: string | null;
      shortAfter: string | null;
      longBefore: string | null;
      longAfter: string | null;
      moodBefore: string | null;
      moodAfter: string | null;
      shortTermIntentBefore: string | null;
      shortTermIntentAfter: string | null;
    })
  | (BaseEvent & {
      kind: 'agent_spawned';
      spawnedAgentId: AgentId;
      locationId: LocationId;
      templateId: MonsterTemplateId;
    })
  | (BaseEvent & { kind: 'equip'; itemId: ItemId; manner: string })
  | (BaseEvent & { kind: 'unequip'; itemId: ItemId; manner: string })
  | (BaseEvent & { kind: 'open'; itemId: ItemId; unlocked: boolean })
  | (BaseEvent & { kind: 'close'; itemId: ItemId })
  | (BaseEvent & {
      kind: typeof EventKind.Trade;
      buyerId: AgentId;
      sellerId: AgentId;
      itemId: ItemId;
      price: number;
      accepted: boolean;
    })
  | (BaseEvent & { kind: 'death'; targetAgentId: AgentId; locationId: LocationId })
  | (BaseEvent & { kind: 'reveal'; itemId: ItemId; locationId: LocationId });

export const NARRATED_EVENT_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  EventKind.Speak,
  EventKind.Emote,
  EventKind.Attack,
  EventKind.CreativeAttack,
]);
