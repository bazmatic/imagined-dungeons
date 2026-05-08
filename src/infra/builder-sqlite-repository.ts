import type { BuilderRepository } from '@core/builder/repository';
import type { WorldKind } from '@core/domain/builder-kinds';
import type {
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  WorldSummary,
} from '@core/domain/builder-types';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type WorldId,
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
} from '@core/domain/ids';
import { type Direction, OwnerKind } from '@core/domain/kinds';
import { eq, sql } from 'drizzle-orm';
import type { DB } from './db';
import * as schema from './schema';

export class SqliteBuilderRepository implements BuilderRepository {
  constructor(private readonly db: DB) {}

  async listWorlds(): Promise<readonly WorldSummary[]> {
    const rows = await this.db.select().from(schema.worlds);
    return rows.map(toSummary);
  }
  async getWorldSummary(id: WorldId): Promise<WorldSummary | null> {
    const rows = await this.db.select().from(schema.worlds).where(eq(schema.worlds.id, id));
    const row = rows[0];
    return row ? toSummary(row) : null;
  }
  async createWorld(s: WorldSummary): Promise<void> {
    await this.db.insert(schema.worlds).values({
      id: s.id,
      label: s.label,
      kind: s.kind,
      parentDraftId: s.parentDraftId,
      displayName: s.displayName,
      playerAgentId: s.playerAgentId,
      rngSeed: 1,
    });
  }
  async updateWorldSummary(
    id: WorldId,
    patch: Partial<Omit<WorldSummary, 'id' | 'kind'>>,
  ): Promise<void> {
    const update: Partial<typeof schema.worlds.$inferInsert> = {};
    if (patch.label !== undefined) update.label = patch.label;
    if (patch.displayName !== undefined) update.displayName = patch.displayName;
    if (patch.parentDraftId !== undefined) update.parentDraftId = patch.parentDraftId;
    if (patch.playerAgentId !== undefined) update.playerAgentId = patch.playerAgentId;
    if (Object.keys(update).length === 0) return;
    await this.db.update(schema.worlds).set(update).where(eq(schema.worlds.id, id));
  }

  async listLocations(w: WorldId) {
    const rows = await this.db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.worldId, w));
    return rows.map((r) => toLocation(r, w));
  }
  async listExits(w: WorldId) {
    const rows = await this.db.select().from(schema.exits).where(eq(schema.exits.worldId, w));
    return rows.map((r) => toExit(r, w));
  }
  async listItems(w: WorldId) {
    const rows = await this.db.select().from(schema.items).where(eq(schema.items.worldId, w));
    return rows.map((r) => toItem(r, w));
  }
  async listAgents(w: WorldId) {
    const rows = await this.db.select().from(schema.agents).where(eq(schema.agents.worldId, w));
    return rows.map((r) => toAgent(r, w));
  }

  async upsertLocation(w: WorldId, i: UpsertLocationInput): Promise<void> {
    await this.db
      .insert(schema.locations)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
      })
      .onConflictDoUpdate({
        target: schema.locations.id,
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
        },
      });
  }
  async upsertExit(w: WorldId, i: UpsertExitInput): Promise<void> {
    await this.db
      .insert(schema.exits)
      .values({
        id: i.id,
        worldId: w,
        fromLocationId: i.from,
        toLocationId: i.to,
        direction: i.direction,
        label: i.label,
        locked: i.locked,
        lockedByItemId: i.lockedByItem,
      })
      .onConflictDoUpdate({
        target: schema.exits.id,
        set: {
          fromLocationId: i.from,
          toLocationId: i.to,
          direction: i.direction,
          label: i.label,
          locked: i.locked,
          lockedByItemId: i.lockedByItem,
        },
      });
  }
  async upsertItem(w: WorldId, i: UpsertItemInput): Promise<void> {
    await this.db
      .insert(schema.items)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        ownerKind: i.ownerKind,
        ownerId: i.ownerId,
        weight: i.weight,
        hidden: i.hidden,
      })
      .onConflictDoUpdate({
        target: schema.items.id,
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          ownerKind: i.ownerKind,
          ownerId: i.ownerId,
          weight: i.weight,
          hidden: i.hidden,
        },
      });
  }
  async upsertAgent(w: WorldId, i: UpsertAgentInput): Promise<void> {
    // Insert path: full row with runtime defaults.
    // Update path: structural fields only — never touches hp/mood/short_term_intent/awake.
    // This preserves gameplay state during publish merges.
    await this.db
      .insert(schema.agents)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        locationId: i.locationId,
        hp: i.hp,
        damage: i.damage,
        defense: i.defense,
        capacity: i.capacity,
        mood: i.mood,
        shortTermIntent: null,
        goal: i.goal,
        autonomous: i.autonomous,
        awake: false,
      })
      .onConflictDoUpdate({
        target: schema.agents.id,
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          locationId: i.locationId,
          damage: i.damage,
          defense: i.defense,
          capacity: i.capacity,
          goal: i.goal,
          autonomous: i.autonomous,
        },
      });
  }

  async deleteLocation(_w: WorldId, id: LocationId) {
    await this.db.delete(schema.locations).where(eq(schema.locations.id, id));
  }
  async deleteExit(_w: WorldId, id: ExitId) {
    await this.db.delete(schema.exits).where(eq(schema.exits.id, id));
  }
  async deleteItem(_w: WorldId, id: ItemId) {
    await this.db.delete(schema.items).where(eq(schema.items.id, id));
  }
  async deleteAgent(_w: WorldId, id: AgentId) {
    await this.db.delete(schema.agents).where(eq(schema.agents.id, id));
  }

  async readSnapshot(w: WorldId) {
    const rows = await this.db
      .select()
      .from(schema.worldSnapshots)
      .where(eq(schema.worldSnapshots.worldId, w));
    const row = rows[0];
    if (!row) return null;
    return { json: row.snapshotJson, takenAt: row.takenAt.getTime() };
  }
  async writeSnapshot(w: WorldId, json: string, takenAt: number) {
    await this.db
      .insert(schema.worldSnapshots)
      .values({ worldId: w, snapshotJson: json, takenAt: new Date(takenAt) })
      .onConflictDoUpdate({
        target: schema.worldSnapshots.worldId,
        set: { snapshotJson: json, takenAt: new Date(takenAt) },
      });
  }

  async transaction<T>(fn: (tx: BuilderRepository) => Promise<T>): Promise<T> {
    // better-sqlite3 transactions are sync and reject async callbacks, so we
    // drive BEGIN/COMMIT/ROLLBACK ourselves. Statements run in declaration order
    // because better-sqlite3 is synchronous under the drizzle Promise wrapper.
    await this.db.run(sql`BEGIN`);
    try {
      const result = await fn(this);
      await this.db.run(sql`COMMIT`);
      return result;
    } catch (err) {
      await this.db.run(sql`ROLLBACK`);
      throw err;
    }
  }
}

const toSummary = (r: typeof schema.worlds.$inferSelect): WorldSummary => ({
  id: r.id as WorldId,
  kind: r.kind as WorldKind,
  label: r.label,
  displayName: r.displayName || r.label,
  parentDraftId: (r.parentDraftId ?? null) as WorldId | null,
  playerAgentId: (r.playerAgentId ?? null) as AgentId | null,
});

const toLocation = (r: typeof schema.locations.$inferSelect, w: WorldId): Location => ({
  id: asLocationId(r.id),
  worldId: w,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
});

const toExit = (r: typeof schema.exits.$inferSelect, w: WorldId): Exit => ({
  id: asExitId(r.id),
  worldId: w,
  from: asLocationId(r.fromLocationId),
  to: asLocationId(r.toLocationId),
  direction: r.direction as Direction,
  label: r.label,
  locked: r.locked,
  lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});

const toItem = (r: typeof schema.items.$inferSelect, w: WorldId): Item => ({
  id: asItemId(r.id),
  worldId: w,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  owner:
    r.ownerKind === OwnerKind.Location
      ? { kind: OwnerKind.Location, id: asLocationId(r.ownerId) }
      : r.ownerKind === OwnerKind.Agent
        ? { kind: OwnerKind.Agent, id: asAgentId(r.ownerId) }
        : { kind: OwnerKind.Item, id: asItemId(r.ownerId) },
  weight: r.weight,
  hidden: r.hidden,
});

const toAgent = (r: typeof schema.agents.$inferSelect, w: WorldId): Agent => ({
  id: asAgentId(r.id),
  worldId: w,
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
});
