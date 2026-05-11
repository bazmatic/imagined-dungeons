import type { BuilderRepository } from '@core/builder/repository';
import type { WorldKind } from '@core/domain/builder-kinds';
import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  StarterPackEntry,
  TagLore,
  TriggerFireState,
  TriggerParams,
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
  UpsertTagLoreInput,
  WorldLore,
  WorldSummary,
  WorldSummaryWithStats,
} from '@core/domain/builder-types';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type MonsterTemplateId,
  type SpawnTriggerId,
  type TagLoreId,
  type WorldId,
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
} from '@core/domain/ids';
import { type Direction, OwnerKind } from '@core/domain/kinds';
import { and, eq, sql } from 'drizzle-orm';
import type { DB } from './db';
import * as schema from './schema';

export class SqliteBuilderRepository implements BuilderRepository {
  constructor(private readonly db: DB) {}

  async listWorlds(): Promise<readonly WorldSummaryWithStats[]> {
    const worldRows = await this.db.select().from(schema.worlds);
    if (worldRows.length === 0) return [];
    const locationRows = await this.db.select().from(schema.locations);
    const agentRows = await this.db.select().from(schema.agents);
    const itemRows = await this.db.select().from(schema.items);

    const countByWorld = (rows: readonly { worldId: string }[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.worldId, (m.get(r.worldId) ?? 0) + 1);
      return m;
    };
    const locByWorld = countByWorld(locationRows);
    const agentByWorld = countByWorld(agentRows);
    const itemByWorld = countByWorld(itemRows);

    return worldRows.map((r) => {
      const s = toSummary(r);
      return {
        ...s,
        locationCount: locByWorld.get(s.id) ?? 0,
        agentCount: agentByWorld.get(s.id) ?? 0,
        itemCount: itemByWorld.get(s.id) ?? 0,
      };
    });
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
      coverImageUrl: s.coverImageUrl,
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

  async updateWorldCover(id: WorldId, coverImageUrl: string | null): Promise<void> {
    await this.db.update(schema.worlds).set({ coverImageUrl }).where(eq(schema.worlds.id, id));
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
    const tagsJson = JSON.stringify(i.tags);
    await this.db
      .insert(schema.locations)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        tags: tagsJson,
      })
      .onConflictDoUpdate({
        target: [schema.locations.worldId, schema.locations.id],
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          tags: tagsJson,
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
        target: [schema.exits.worldId, schema.exits.id],
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
        target: [schema.items.worldId, schema.items.id],
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
        target: [schema.agents.worldId, schema.agents.id],
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

  async deleteLocation(w: WorldId, id: LocationId) {
    await this.db
      .delete(schema.locations)
      .where(and(eq(schema.locations.worldId, w), eq(schema.locations.id, id)));
  }
  async deleteExit(w: WorldId, id: ExitId) {
    await this.db
      .delete(schema.exits)
      .where(and(eq(schema.exits.worldId, w), eq(schema.exits.id, id)));
  }
  async deleteItem(w: WorldId, id: ItemId) {
    await this.db
      .delete(schema.items)
      .where(and(eq(schema.items.worldId, w), eq(schema.items.id, id)));
  }
  async deleteAgent(w: WorldId, id: AgentId) {
    await this.db
      .delete(schema.agents)
      .where(and(eq(schema.agents.worldId, w), eq(schema.agents.id, id)));
  }

  async listMonsterTemplates(w: WorldId): Promise<readonly MonsterTemplate[]> {
    const rows = await this.db
      .select()
      .from(schema.monsterTemplates)
      .where(eq(schema.monsterTemplates.worldId, w));
    return rows.map((r) => toMonsterTemplate(r, w));
  }
  async getMonsterTemplate(w: WorldId, id: MonsterTemplateId): Promise<MonsterTemplate | null> {
    const rows = await this.db
      .select()
      .from(schema.monsterTemplates)
      .where(and(eq(schema.monsterTemplates.worldId, w), eq(schema.monsterTemplates.id, id)));
    const row = rows[0];
    return row ? toMonsterTemplate(row, w) : null;
  }
  async upsertMonsterTemplate(w: WorldId, i: UpsertMonsterTemplateInput): Promise<void> {
    await this.db
      .insert(schema.monsterTemplates)
      .values({
        id: i.id,
        worldId: w,
        templateKey: i.templateKey,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        hp: i.hp,
        mood: i.mood,
        startingItemsJson: JSON.stringify(i.startingItems),
      })
      .onConflictDoUpdate({
        target: [schema.monsterTemplates.worldId, schema.monsterTemplates.id],
        set: {
          templateKey: i.templateKey,
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          hp: i.hp,
          mood: i.mood,
          startingItemsJson: JSON.stringify(i.startingItems),
        },
      });
  }
  async deleteMonsterTemplate(w: WorldId, id: MonsterTemplateId): Promise<void> {
    await this.db
      .delete(schema.monsterTemplates)
      .where(and(eq(schema.monsterTemplates.worldId, w), eq(schema.monsterTemplates.id, id)));
  }

  async listLocationSpawnTriggers(
    w: WorldId,
    locationId?: LocationId,
  ): Promise<readonly LocationSpawnTrigger[]> {
    const where = locationId
      ? and(
          eq(schema.locationSpawnTriggers.worldId, w),
          eq(schema.locationSpawnTriggers.locationId, locationId),
        )
      : eq(schema.locationSpawnTriggers.worldId, w);
    const rows = await this.db.select().from(schema.locationSpawnTriggers).where(where);
    return rows.map((r) => toTrigger(r, w));
  }
  async getLocationSpawnTrigger(
    w: WorldId,
    id: SpawnTriggerId,
  ): Promise<LocationSpawnTrigger | null> {
    const rows = await this.db
      .select()
      .from(schema.locationSpawnTriggers)
      .where(
        and(eq(schema.locationSpawnTriggers.worldId, w), eq(schema.locationSpawnTriggers.id, id)),
      );
    const row = rows[0];
    return row ? toTrigger(row, w) : null;
  }
  async upsertLocationSpawnTrigger(w: WorldId, i: UpsertLocationSpawnTriggerInput): Promise<void> {
    const values = {
      id: i.id,
      worldId: w,
      locationId: i.locationId,
      templateId: i.templateId,
      kind: i.params.kind,
      paramsJson: JSON.stringify(i.params),
      count: i.count,
      oneShot: i.oneShot,
      fireOnInitialPublish: i.fireOnInitialPublish,
    };
    await this.db
      .insert(schema.locationSpawnTriggers)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.locationSpawnTriggers.worldId, schema.locationSpawnTriggers.id],
        set: {
          locationId: values.locationId,
          templateId: values.templateId,
          kind: values.kind,
          paramsJson: values.paramsJson,
          count: values.count,
          oneShot: values.oneShot,
          fireOnInitialPublish: values.fireOnInitialPublish,
        },
      });
  }
  async deleteLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId): Promise<void> {
    await this.db
      .delete(schema.locationSpawnTriggers)
      .where(
        and(eq(schema.locationSpawnTriggers.worldId, w), eq(schema.locationSpawnTriggers.id, id)),
      );
  }

  async readWorldLore(_w: WorldId): Promise<WorldLore> {
    throw new Error('readWorldLore: not implemented yet (Task 6)');
  }
  async writeWorldLore(_w: WorldId, _lore: Omit<WorldLore, 'worldId'>): Promise<void> {
    throw new Error('writeWorldLore: not implemented yet (Task 6)');
  }
  async listTagLore(_w: WorldId): Promise<readonly TagLore[]> {
    throw new Error('listTagLore: not implemented yet (Task 6)');
  }
  async getTagLore(_w: WorldId, _id: TagLoreId): Promise<TagLore | null> {
    throw new Error('getTagLore: not implemented yet (Task 6)');
  }
  async getTagLoreByTag(_w: WorldId, _tag: string): Promise<TagLore | null> {
    throw new Error('getTagLoreByTag: not implemented yet (Task 6)');
  }
  async upsertTagLore(_w: WorldId, _input: UpsertTagLoreInput): Promise<void> {
    throw new Error('upsertTagLore: not implemented yet (Task 6)');
  }
  async deleteTagLore(_w: WorldId, _id: TagLoreId): Promise<void> {
    throw new Error('deleteTagLore: not implemented yet (Task 6)');
  }

  /**
   * Trigger-fire-state lives on the snapshot JSON's `triggerFireState` field
   * (per spec §"world_snapshots.snapshotJson"). Read defaults to empty when
   * the field is absent (existing snapshots predate this slice).
   */
  async readTriggerFireState(w: WorldId): Promise<TriggerFireState> {
    const snap = await this.readSnapshot(w);
    if (!snap) return { byTriggerId: {} };
    const payload = JSON.parse(snap.json) as { triggerFireState?: TriggerFireState };
    return payload.triggerFireState ?? { byTriggerId: {} };
  }
  async writeTriggerFireState(w: WorldId, state: TriggerFireState): Promise<void> {
    const snap = await this.readSnapshot(w);
    const base = snap ? (JSON.parse(snap.json) as Record<string, unknown>) : {};
    const merged = JSON.stringify({ ...base, triggerFireState: state });
    await this.writeSnapshot(w, merged, Date.now());
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

function parseTagsJson(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

const toSummary = (r: typeof schema.worlds.$inferSelect): WorldSummary => ({
  id: r.id as WorldId,
  kind: r.kind as WorldKind,
  label: r.label,
  displayName: r.displayName || r.label,
  parentDraftId: (r.parentDraftId ?? null) as WorldId | null,
  playerAgentId: (r.playerAgentId ?? null) as AgentId | null,
  coverImageUrl: r.coverImageUrl ?? null,
});

const toLocation = (r: typeof schema.locations.$inferSelect, w: WorldId): Location => ({
  id: asLocationId(r.id),
  worldId: w,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  tags: parseTagsJson(r.tags),
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
  tags: [],
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
  tags: [],
});

function toMonsterTemplate(
  r: typeof schema.monsterTemplates.$inferSelect,
  w: WorldId,
): MonsterTemplate {
  return {
    id: asMonsterTemplateId(r.id),
    worldId: w,
    templateKey: r.templateKey,
    label: r.label,
    shortDescription: r.shortDescription,
    longDescription: r.longDescription,
    hp: r.hp,
    mood: r.mood,
    startingItems: JSON.parse(r.startingItemsJson) as StarterPackEntry[],
    tags: [],
  };
}

function toTrigger(
  r: typeof schema.locationSpawnTriggers.$inferSelect,
  w: WorldId,
): LocationSpawnTrigger {
  const params = (r.paramsJson ? JSON.parse(r.paramsJson) : { kind: r.kind }) as TriggerParams;
  return {
    id: asSpawnTriggerId(r.id),
    worldId: w,
    locationId: asLocationId(r.locationId),
    templateId: asMonsterTemplateId(r.templateId),
    params,
    count: r.count,
    oneShot: r.oneShot,
    fireOnInitialPublish: r.fireOnInitialPublish,
  };
}
