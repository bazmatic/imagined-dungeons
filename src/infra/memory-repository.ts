import type { Agent, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from '@core/domain/ids';
import type { Repository } from '@core/engine/repository';

export interface SeedData {
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly rngSeed?: number;
}

const sameOwner = (a: Owner, b: Owner): boolean => a.kind === b.kind && a.id === b.id;

export class MemoryRepository implements Repository {
  private readonly worldId: WorldId;
  private readonly locations = new Map<LocationId, Location>();
  private readonly exits = new Map<ExitId, Exit>();
  private readonly items = new Map<ItemId, Item>();
  private readonly agents = new Map<AgentId, Agent>();
  private readonly events: DomainEvent[] = [];
  private rngSeed: number;

  constructor(worldId: WorldId, seed: SeedData) {
    this.worldId = worldId;
    for (const l of seed.locations) this.locations.set(l.id, l);
    for (const e of seed.exits) this.exits.set(e.id, e);
    for (const i of seed.items) this.items.set(i.id, i);
    for (const a of seed.agents) this.agents.set(a.id, a);
    this.rngSeed = seed.rngSeed ?? 1;
  }

  async getWorldId(): Promise<WorldId> {
    return this.worldId;
  }

  async getAgent(id: AgentId): Promise<Agent> {
    const a = this.agents.get(id);
    if (!a) throw new Error(`agent not found: ${id}`);
    return a;
  }

  async getLocation(id: LocationId): Promise<Location> {
    const l = this.locations.get(id);
    if (!l) throw new Error(`location not found: ${id}`);
    return l;
  }

  async getItem(id: ItemId): Promise<Item> {
    const i = this.items.get(id);
    if (!i) throw new Error(`item not found: ${id}`);
    return i;
  }

  async getExit(id: ExitId): Promise<Exit> {
    const e = this.exits.get(id);
    if (!e) throw new Error(`exit not found: ${id}`);
    return e;
  }

  async itemsOwnedBy(owner: Owner): Promise<readonly Item[]> {
    return [...this.items.values()].filter((i) => sameOwner(i.owner, owner));
  }

  async agentsAt(loc: LocationId): Promise<readonly Agent[]> {
    return [...this.agents.values()].filter((a) => a.locationId === loc);
  }

  async exitsFrom(loc: LocationId): Promise<readonly Exit[]> {
    return [...this.exits.values()].filter((e) => e.from === loc);
  }

  async moveAgent(id: AgentId, to: LocationId): Promise<void> {
    const a = await this.getAgent(id);
    this.agents.set(id, { ...a, locationId: to });
  }

  async transferItem(id: ItemId, to: Owner): Promise<void> {
    const i = await this.getItem(id);
    this.items.set(id, { ...i, owner: to });
  }

  async setAgentHp(id: AgentId, hp: number): Promise<void> {
    const a = await this.getAgent(id);
    this.agents.set(id, { ...a, hp });
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }

  async recentEvents(limit: number): Promise<readonly DomainEvent[]> {
    return this.events.slice(-limit);
  }

  async getRngSeed(): Promise<number> {
    return this.rngSeed;
  }

  async setRngSeed(seed: number): Promise<void> {
    this.rngSeed = seed >>> 0;
  }

  async updateLocationDescription(
    id: LocationId,
    patch: { short?: string; long?: string },
  ): Promise<void> {
    const current = await this.getLocation(id);
    this.locations.set(id, {
      ...current,
      ...(patch.short !== undefined ? { shortDescription: patch.short } : {}),
      ...(patch.long !== undefined ? { longDescription: patch.long } : {}),
    });
  }

  async updateItemDescription(id: ItemId, patch: { short?: string; long?: string }): Promise<void> {
    const current = await this.getItem(id);
    this.items.set(id, {
      ...current,
      ...(patch.short !== undefined ? { shortDescription: patch.short } : {}),
      ...(patch.long !== undefined ? { longDescription: patch.long } : {}),
    });
  }

  async updateAgentDescription(
    id: AgentId,
    patch: {
      short?: string;
      long?: string;
      mood?: string | null;
      shortTermIntent?: string | null;
    },
  ): Promise<void> {
    const current = await this.getAgent(id);
    this.agents.set(id, {
      ...current,
      ...(patch.short !== undefined ? { shortDescription: patch.short } : {}),
      ...(patch.long !== undefined ? { longDescription: patch.long } : {}),
      ...(patch.mood !== undefined ? { mood: patch.mood } : {}),
      ...(patch.shortTermIntent !== undefined ? { shortTermIntent: patch.shortTermIntent } : {}),
    });
  }
}
