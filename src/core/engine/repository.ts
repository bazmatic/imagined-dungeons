import type { Agent, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from '@core/domain/ids';

export interface Repository {
  getWorldId(): Promise<WorldId>;
  getAgent(id: AgentId): Promise<Agent>;
  getLocation(id: LocationId): Promise<Location>;
  getItem(id: ItemId): Promise<Item>;
  getExit(id: ExitId): Promise<Exit>;
  itemsOwnedBy(owner: Owner): Promise<readonly Item[]>;
  agentsAt(loc: LocationId): Promise<readonly Agent[]>;
  exitsFrom(loc: LocationId): Promise<readonly Exit[]>;
  moveAgent(agent: AgentId, to: LocationId): Promise<void>;
  transferItem(item: ItemId, to: Owner): Promise<void>;
  setAgentHp(id: AgentId, hp: number): Promise<void>;
  /**
   * Wake or sleep an NPC. The scheduler ticks an agent only when
   * `autonomous === true`. Interactions targeting a dormant NPC wake them
   * (see tick.ts). Sleep is currently never triggered by the engine — once
   * woken, an NPC stays in the scene.
   */
  setAgentAutonomous(id: AgentId, autonomous: boolean): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
  recentEvents(limit: number): Promise<readonly DomainEvent[]>;
  /** Read the current world RNG seed. */
  getRngSeed(): Promise<number>;
  /** Persist a new RNG seed for the world (after one or more rolls). */
  setRngSeed(seed: number): Promise<void>;
  /**
   * Description-update primitives used by the consequence engine. A field
   * passed as `undefined` (i.e. omitted) MUST be left untouched. `null` is
   * not a meaningful patch value — the action's `null` is filtered to
   * "omit" by the handler before it reaches the repository.
   */
  updateLocationDescription(
    id: LocationId,
    patch: { short?: string; long?: string },
  ): Promise<void>;
  updateItemDescription(id: ItemId, patch: { short?: string; long?: string }): Promise<void>;
  /**
   * Agent description/state updates. Field convention (consistent across the
   * repo layer):
   *   - field is `undefined` (omitted) → leave that column untouched;
   *   - field is `null` → write SQL NULL (clear the column);
   *   - field is a string → write the string.
   *
   * The action handler translates the action's "null means unchanged"
   * convention into the repo's "undefined means unchanged" convention.
   */
  updateAgentDescription(
    id: AgentId,
    patch: {
      short?: string;
      long?: string;
      mood?: string | null;
      shortTermIntent?: string | null;
    },
  ): Promise<void>;
}
