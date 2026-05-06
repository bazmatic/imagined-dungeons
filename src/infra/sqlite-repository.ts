import { and, eq } from 'drizzle-orm';
import type { Agent, Direction, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import {
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type WorldId,
  asAgentId,
  asEventId,
  asExitId,
  asItemId,
  asLocationId,
} from '@core/domain/ids';
import type { Repository } from '@core/engine/repository';
import type { DB } from './db';
import * as schema from './schema';

const ownerOf = (kind: 'location' | 'agent' | 'item', id: string): Owner => {
  if (kind === 'location') return { kind, id: asLocationId(id) };
  if (kind === 'agent') return { kind, id: asAgentId(id) };
  return { kind, id: asItemId(id) };
};

const toLocation = (
  r: typeof schema.locations.$inferSelect,
  worldId: WorldId,
): Location => ({
  id: asLocationId(r.id),
  worldId,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
});

const toAgent = (r: typeof schema.agents.$inferSelect, worldId: WorldId): Agent => ({
  id: asAgentId(r.id),
  worldId,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  locationId: asLocationId(r.locationId),
  hp: r.hp,
  damage: r.damage,
  defense: r.defense,
  capacity: r.capacity,
  mood: r.mood,
  goal: r.goal,
  autonomous: r.autonomous,
});

const toItem = (r: typeof schema.items.$inferSelect, worldId: WorldId): Item => ({
  id: asItemId(r.id),
  worldId,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  owner: ownerOf(r.ownerKind, r.ownerId),
  weight: r.weight,
  hidden: r.hidden,
});

const toExit = (r: typeof schema.exits.$inferSelect, worldId: WorldId): Exit => ({
  id: asExitId(r.id),
  worldId,
  from: asLocationId(r.fromLocationId),
  to: asLocationId(r.toLocationId),
  direction: r.direction as Direction,
  label: r.label,
  locked: r.locked,
  lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});

export class SqliteRepository implements Repository {
  constructor(
    private readonly db: DB,
    private readonly worldId: WorldId,
  ) {}

  async getWorldId(): Promise<WorldId> {
    return this.worldId;
  }

  async getAgent(id: AgentId): Promise<Agent> {
    const rows = await this.db.select().from(schema.agents).where(eq(schema.agents.id, id));
    const row = rows[0];
    if (!row) throw new Error(`agent not found: ${id}`);
    return toAgent(row, this.worldId);
  }

  async getLocation(id: LocationId): Promise<Location> {
    const rows = await this.db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, id));
    const row = rows[0];
    if (!row) throw new Error(`location not found: ${id}`);
    return toLocation(row, this.worldId);
  }

  async getItem(id: ItemId): Promise<Item> {
    const rows = await this.db.select().from(schema.items).where(eq(schema.items.id, id));
    const row = rows[0];
    if (!row) throw new Error(`item not found: ${id}`);
    return toItem(row, this.worldId);
  }

  async getExit(id: ExitId): Promise<Exit> {
    const rows = await this.db.select().from(schema.exits).where(eq(schema.exits.id, id));
    const row = rows[0];
    if (!row) throw new Error(`exit not found: ${id}`);
    return toExit(row, this.worldId);
  }

  async itemsOwnedBy(owner: Owner): Promise<readonly Item[]> {
    const rows = await this.db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.ownerKind, owner.kind), eq(schema.items.ownerId, owner.id)));
    return rows.map((r) => toItem(r, this.worldId));
  }

  async agentsAt(loc: LocationId): Promise<readonly Agent[]> {
    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.locationId, loc));
    return rows.map((r) => toAgent(r, this.worldId));
  }

  async exitsFrom(loc: LocationId): Promise<readonly Exit[]> {
    const rows = await this.db
      .select()
      .from(schema.exits)
      .where(eq(schema.exits.fromLocationId, loc));
    return rows.map((r) => toExit(r, this.worldId));
  }

  async moveAgent(id: AgentId, to: LocationId): Promise<void> {
    await this.db
      .update(schema.agents)
      .set({ locationId: to })
      .where(eq(schema.agents.id, id));
  }

  async transferItem(id: ItemId, to: Owner): Promise<void> {
    await this.db
      .update(schema.items)
      .set({ ownerKind: to.kind, ownerId: to.id })
      .where(eq(schema.items.id, id));
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    const { id, worldId, actorId, kind, witnesses, createdAt, ...rest } = event;
    await this.db.insert(schema.events).values({
      id,
      worldId,
      actorId,
      kind,
      witnesses: [...witnesses],
      createdAt,
      payload: rest,
    });
  }

  async recentEvents(limit: number): Promise<readonly DomainEvent[]> {
    const rows = await this.db.select().from(schema.events).orderBy(schema.events.createdAt);
    const slice = rows.slice(-limit);
    return slice.map(
      (r) =>
        ({
          id: asEventId(r.id),
          worldId: this.worldId,
          actorId: asAgentId(r.actorId),
          kind: r.kind as DomainEvent['kind'],
          witnesses: (r.witnesses as string[]).map(asAgentId),
          createdAt: r.createdAt,
          ...(r.payload as object),
        }) as DomainEvent,
    );
  }
}
