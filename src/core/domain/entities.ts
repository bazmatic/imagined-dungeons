import type { AgentId, ExitId, ItemId, LocationId, WorldId } from './ids';
import type { Direction } from './kinds';

export { ALL_DIRECTIONS, Direction } from './kinds';

export type Owner =
  | { kind: 'location'; id: LocationId }
  | { kind: 'agent'; id: AgentId }
  | { kind: 'item'; id: ItemId };

export interface Location {
  readonly id: LocationId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
}

export interface Exit {
  readonly id: ExitId;
  readonly worldId: WorldId;
  readonly from: LocationId;
  readonly to: LocationId;
  readonly direction: Direction;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}

export interface Item {
  readonly id: ItemId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly owner: Owner;
  readonly weight: number;
  readonly hidden: boolean;
}

export interface Agent {
  readonly id: AgentId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly locationId: LocationId;
  readonly hp: number;
  readonly damage: number;
  readonly defense: number;
  readonly capacity: number;
  readonly mood: string | null;
  readonly goal: string | null;
  readonly autonomous: boolean;
}
