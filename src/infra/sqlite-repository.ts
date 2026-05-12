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
import { OwnerKind } from '@core/domain/kinds';
import type { Repository } from '@core/engine/repository';
import { and, eq } from 'drizzle-orm';
import type { DB } from './db';
import * as schema from './schema';

const ownerOf = (kind: OwnerKind, id: string): Owner => {
  if (kind === OwnerKind.Location) return { kind, id: asLocationId(id) };
  if (kind === OwnerKind.Agent) return { kind, id: asAgentId(id) };
  return { kind, id: asItemId(id) };
};

const toLocation = (r: typeof schema.locations.$inferSelect, worldId: WorldId): Location => ({
  id: asLocationId(r.id),
  worldId,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  tags: (() => {
    try {
      const parsed = JSON.parse(r.tags);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return [];
    }
  })(),
  secretDescription: r.secretDescription,
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
  shortTermIntent: r.shortTermIntent,
  goal: r.goal,
  autonomous: r.autonomous,
  awake: r.awake,
  tags: [],
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
  tags: [],
  equipped: r.equipped,
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
    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(and(eq(schema.agents.id, id), eq(schema.agents.worldId, this.worldId)));
    const row = rows[0];
    if (!row) throw new Error(`agent not found: ${id}`);
    return toAgent(row, this.worldId);
  }

  async getLocation(id: LocationId): Promise<Location> {
    const rows = await this.db
      .select()
      .from(schema.locations)
      .where(and(eq(schema.locations.id, id), eq(schema.locations.worldId, this.worldId)));
    const row = rows[0];
    if (!row) throw new Error(`location not found: ${id}`);
    return toLocation(row, this.worldId);
  }

  async getItem(id: ItemId): Promise<Item> {
    const rows = await this.db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.id, id), eq(schema.items.worldId, this.worldId)));
    const row = rows[0];
    if (!row) throw new Error(`item not found: ${id}`);
    return toItem(row, this.worldId);
  }

  async getExit(id: ExitId): Promise<Exit> {
    const rows = await this.db
      .select()
      .from(schema.exits)
      .where(and(eq(schema.exits.id, id), eq(schema.exits.worldId, this.worldId)));
    const row = rows[0];
    if (!row) throw new Error(`exit not found: ${id}`);
    return toExit(row, this.worldId);
  }

  async itemsOwnedBy(owner: Owner): Promise<readonly Item[]> {
    const rows = await this.db
      .select()
      .from(schema.items)
      .where(
        and(
          eq(schema.items.worldId, this.worldId),
          eq(schema.items.ownerKind, owner.kind),
          eq(schema.items.ownerId, owner.id),
        ),
      );
    return rows.map((r) => toItem(r, this.worldId));
  }

  async agentsAt(loc: LocationId): Promise<readonly Agent[]> {
    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(and(eq(schema.agents.worldId, this.worldId), eq(schema.agents.locationId, loc)));
    return rows.map((r) => toAgent(r, this.worldId));
  }

  async allAgents(): Promise<readonly Agent[]> {
    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.worldId, this.worldId));
    return rows.map((r) => toAgent(r, this.worldId));
  }

  async exitsFrom(loc: LocationId): Promise<readonly Exit[]> {
    const rows = await this.db
      .select()
      .from(schema.exits)
      .where(and(eq(schema.exits.worldId, this.worldId), eq(schema.exits.fromLocationId, loc)));
    return rows.map((r) => toExit(r, this.worldId));
  }

  async moveAgent(id: AgentId, to: LocationId): Promise<void> {
    await this.db
      .update(schema.agents)
      .set({ locationId: to })
      .where(and(eq(schema.agents.worldId, this.worldId), eq(schema.agents.id, id)));
  }

  async transferItem(id: ItemId, to: Owner): Promise<void> {
    await this.db
      .update(schema.items)
      .set({ ownerKind: to.kind, ownerId: to.id })
      .where(and(eq(schema.items.worldId, this.worldId), eq(schema.items.id, id)));
  }

  async setItemEquipped(id: ItemId, equipped: boolean): Promise<void> {
    await this.db
      .update(schema.items)
      .set({ equipped })
      .where(and(eq(schema.items.worldId, this.worldId), eq(schema.items.id, id)));
  }

  async setItemHidden(id: ItemId, hidden: boolean): Promise<void> {
    await this.db
      .update(schema.items)
      .set({ hidden })
      .where(and(eq(schema.items.worldId, this.worldId), eq(schema.items.id, id)));
  }

  async setAgentHp(id: AgentId, hp: number): Promise<void> {
    await this.db
      .update(schema.agents)
      .set({ hp })
      .where(and(eq(schema.agents.worldId, this.worldId), eq(schema.agents.id, id)));
  }

  async setAgentAwake(id: AgentId, awake: boolean): Promise<void> {
    await this.db
      .update(schema.agents)
      .set({ awake })
      .where(and(eq(schema.agents.worldId, this.worldId), eq(schema.agents.id, id)));
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    const { id, worldId, actorId, kind, witnesses, createdAt, narrations, ...rest } = event;
    await this.db.insert(schema.events).values({
      id,
      worldId,
      actorId,
      kind,
      witnesses: [...witnesses],
      createdAt,
      payload: rest,
      narrations: narrations ? { ...narrations } : null,
    });
  }

  async getRngSeed(): Promise<number> {
    const rows = await this.db
      .select({ rngSeed: schema.worlds.rngSeed })
      .from(schema.worlds)
      .where(eq(schema.worlds.id, this.worldId));
    const row = rows[0];
    if (!row) throw new Error(`world not found: ${this.worldId}`);
    return row.rngSeed;
  }

  async setRngSeed(seed: number): Promise<void> {
    await this.db
      .update(schema.worlds)
      .set({ rngSeed: seed >>> 0 })
      .where(eq(schema.worlds.id, this.worldId));
  }

  async updateLocationDescription(
    id: LocationId,
    patch: { short?: string; long?: string },
  ): Promise<void> {
    const set: { shortDescription?: string; longDescription?: string } = {};
    if (patch.short !== undefined) set.shortDescription = patch.short;
    if (patch.long !== undefined) set.longDescription = patch.long;
    if (Object.keys(set).length === 0) return;
    await this.db
      .update(schema.locations)
      .set(set)
      .where(and(eq(schema.locations.worldId, this.worldId), eq(schema.locations.id, id)));
  }

  async updateItemDescription(id: ItemId, patch: { short?: string; long?: string }): Promise<void> {
    const set: { shortDescription?: string; longDescription?: string } = {};
    if (patch.short !== undefined) set.shortDescription = patch.short;
    if (patch.long !== undefined) set.longDescription = patch.long;
    if (Object.keys(set).length === 0) return;
    await this.db
      .update(schema.items)
      .set(set)
      .where(and(eq(schema.items.worldId, this.worldId), eq(schema.items.id, id)));
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
    const set: {
      shortDescription?: string;
      longDescription?: string;
      mood?: string | null;
      shortTermIntent?: string | null;
    } = {};
    if (patch.short !== undefined) set.shortDescription = patch.short;
    if (patch.long !== undefined) set.longDescription = patch.long;
    if (patch.mood !== undefined) set.mood = patch.mood;
    if (patch.shortTermIntent !== undefined) set.shortTermIntent = patch.shortTermIntent;
    if (Object.keys(set).length === 0) return;
    await this.db
      .update(schema.agents)
      .set(set)
      .where(and(eq(schema.agents.worldId, this.worldId), eq(schema.agents.id, id)));
  }

  async recentEvents(limit: number): Promise<readonly DomainEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.worldId, this.worldId))
      .orderBy(schema.events.createdAt);
    const slice = rows.slice(-limit);
    return slice.map((r) => {
      const narrations = r.narrations as Record<string, string> | null;
      const payload = migratePayload(r.kind as DomainEvent['kind'], r.payload as object);
      return {
        id: asEventId(r.id),
        worldId: this.worldId,
        actorId: asAgentId(r.actorId),
        kind: r.kind as DomainEvent['kind'],
        witnesses: (r.witnesses as string[]).map(asAgentId),
        createdAt: r.createdAt,
        ...(narrations ? { narrations } : {}),
        ...payload,
      } as DomainEvent;
    });
  }
}

/**
 * Hydrate older event payload shapes into the current domain shape on read.
 * Persisted events written before a domain change still live in the DB; rather
 * than drop or rewrite them, normalise on the way out so the engine only ever
 * sees the current shape.
 *
 * Currently migrates:
 *   - `look` events: pre-ExaminableTarget rows had `{ targetItemId: ItemId | null }`.
 *     Translate to `{ target: { kind: 'room' } }` when null, or
 *     `{ target: { kind: 'item', id } }` when set.
 */
function migratePayload(kind: DomainEvent['kind'], payload: object): object {
  if (kind !== 'look') return payload;
  const p = payload as { target?: unknown; targetItemId?: string | null };
  if (p.target !== undefined) return payload; // already migrated
  if (p.targetItemId === null || p.targetItemId === undefined) {
    return { ...p, target: { kind: 'room' } };
  }
  return { ...p, target: { kind: 'item', id: p.targetItemId } };
}
