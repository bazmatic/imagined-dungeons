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
  readonly shortTermIntent: string | null;
  readonly goal: string | null;
  /**
   * "Always awake." An autonomous agent ticks every turn they're co-located
   * with the player, regardless of any other signal. Player-companions,
   * patrol guards, etc.
   */
  readonly autonomous: boolean;
  /**
   * Runtime "in the scene" flag. The scheduler ticks any agent that is
   * `autonomous || awake`. The engine sets this true when something
   * interacts with the agent (direct address, attack, emote-at, vocative
   * broadcast) and clears it once `shortTermIntent` is null again — i.e.
   * the agent has finished what they were drawn into.
   */
  readonly awake: boolean;
}
