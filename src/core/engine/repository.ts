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
  appendEvent(event: DomainEvent): Promise<void>;
  recentEvents(limit: number): Promise<readonly DomainEvent[]>;
  /** Read the current world RNG seed. */
  getRngSeed(): Promise<number>;
  /** Persist a new RNG seed for the world (after one or more rolls). */
  setRngSeed(seed: number): Promise<void>;
}
