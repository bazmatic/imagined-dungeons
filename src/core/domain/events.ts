import type { Direction } from './entities';
import type { AgentId, EventId, ItemId, LocationId, WorldId } from './ids';

export type EventKind = 'move' | 'take' | 'drop' | 'look' | 'inventory' | 'failed';

export interface BaseEvent {
  readonly id: EventId;
  readonly worldId: WorldId;
  readonly actorId: AgentId;
  readonly kind: EventKind;
  readonly witnesses: readonly AgentId[];
  readonly createdAt: Date;
}

export type DomainEvent =
  | (BaseEvent & { kind: 'move'; from: LocationId; to: LocationId; direction: Direction })
  | (BaseEvent & { kind: 'take'; itemId: ItemId; from: LocationId })
  | (BaseEvent & { kind: 'drop'; itemId: ItemId; to: LocationId })
  | (BaseEvent & { kind: 'look'; locationId: LocationId; targetItemId: ItemId | null })
  | (BaseEvent & { kind: 'inventory' })
  | (BaseEvent & { kind: 'failed'; attempted: string; reason: string });
