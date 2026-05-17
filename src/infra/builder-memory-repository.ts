import type { BuilderRepository } from '@core/builder/repository';
import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  TagLore,
  TriggerFireState,
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
  asTagLoreId,
} from '@core/domain/ids';
import type { Direction } from '@core/domain/kinds';
import { OwnerKind } from '@core/domain/kinds';

interface Snapshot {
  json: string;
  takenAt: number;
}

/**
 * Test-only in-memory `BuilderRepository`. Holds plain Maps. Transactions
 * snapshot-and-restore on failure so tests for atomicity work.
 */
export class MemoryBuilderRepository implements BuilderRepository {
  private worlds = new Map<WorldId, WorldSummary>();
  private locations = new Map<WorldId, Map<LocationId, Location>>();
  private exits = new Map<WorldId, Map<ExitId, Exit>>();
  private items = new Map<WorldId, Map<ItemId, Item>>();
  private agents = new Map<WorldId, Map<AgentId, Agent>>();
  private snapshots = new Map<WorldId, Snapshot>();
  private templates = new Map<WorldId, Map<MonsterTemplateId, MonsterTemplate>>();
  private triggers = new Map<WorldId, Map<SpawnTriggerId, LocationSpawnTrigger>>();
  private fireStates = new Map<WorldId, TriggerFireState>();
  private worldLore = new Map<WorldId, Omit<WorldLore, 'worldId'>>();
  private tagLore = new Map<WorldId, Map<TagLoreId, TagLore>>();

  private bucket<K, V>(map: Map<WorldId, Map<K, V>>, world: WorldId): Map<K, V> {
    let b = map.get(world);
    if (!b) {
      b = new Map<K, V>();
      map.set(world, b);
    }
    return b;
  }

  async listWorlds(): Promise<readonly WorldSummaryWithStats[]> {
    const summaries = [...this.worlds.values()];
    return summaries.map((s) => ({
      ...s,
      locationCount: this.locations.get(s.id)?.size ?? 0,
      agentCount: this.agents.get(s.id)?.size ?? 0,
      itemCount: this.items.get(s.id)?.size ?? 0,
    }));
  }
  async getWorldSummary(id: WorldId) {
    return this.worlds.get(id) ?? null;
  }
  async createWorld(s: WorldSummary) {
    this.worlds.set(s.id, s);
  }
  async updateWorldSummary(id: WorldId, patch: Partial<Omit<WorldSummary, 'id' | 'kind'>>) {
    const cur = this.worlds.get(id);
    if (!cur) return;
    this.worlds.set(id, { ...cur, ...patch });
  }
  async updateWorldCover(id: WorldId, coverImageUrl: string | null): Promise<void> {
    const w = this.worlds.get(id);
    if (!w) return;
    this.worlds.set(id, { ...w, coverImageUrl });
  }

  async listLocations(w: WorldId) {
    return [...this.bucket(this.locations, w).values()];
  }
  async listExits(w: WorldId) {
    return [...this.bucket(this.exits, w).values()];
  }
  async listItems(w: WorldId) {
    return [...this.bucket(this.items, w).values()];
  }
  async listAgents(w: WorldId) {
    return [...this.bucket(this.agents, w).values()];
  }

  async upsertLocation(w: WorldId, i: UpsertLocationInput) {
    this.bucket(this.locations, w).set(i.id, {
      id: asLocationId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      tags: [...i.tags],
      secretDescription: i.secretDescription,
    });
  }
  async upsertExit(w: WorldId, i: UpsertExitInput) {
    this.bucket(this.exits, w).set(i.id, {
      id: asExitId(i.id),
      worldId: w,
      from: i.from,
      to: i.to,
      // UpsertExitInput.direction is `string`; validation lives in the builder validator (validate.ts), not here.
      direction: i.direction as Direction,
      label: i.label,
      locked: i.locked,
      lockedByItem: i.lockedByItem,
    });
  }
  async upsertItem(w: WorldId, i: UpsertItemInput) {
    const owner =
      i.ownerKind === OwnerKind.Location
        ? { kind: OwnerKind.Location, id: asLocationId(i.ownerId) }
        : i.ownerKind === OwnerKind.Agent
          ? { kind: OwnerKind.Agent, id: asAgentId(i.ownerId) }
          : { kind: OwnerKind.Item, id: asItemId(i.ownerId) };
    // Preserve the runtime `equipped` flag on update; use input value on
    // insert (so spawn can set equipped: true). Mirrors the SQLite repo,
    // which uses input.equipped for the insert value but leaves the column
    // out of .onConflictDoUpdate so existing values survive authored upserts.
    const existing = this.bucket(this.items, w).get(i.id);
    this.bucket(this.items, w).set(i.id, {
      id: asItemId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      owner,
      weight: i.weight,
      hidden: i.hidden,
      tags: [...i.tags],
      equipped: existing?.equipped ?? (i.equipped ?? false),
      container: i.container,
      opened: i.opened,
      locked: i.locked,
      lockedByItem: i.lockedByItem,
      priceTag: i.priceTag ?? null,
      weaponDamage: i.weaponDamage,
      armorDefense: i.armorDefense,
    });
  }
  async upsertAgent(w: WorldId, i: UpsertAgentInput) {
    const existing = this.bucket(this.agents, w).get(i.id);
    this.bucket(this.agents, w).set(i.id, {
      id: asAgentId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      locationId: i.locationId,
      hp: existing ? existing.hp : i.hp,
      damage: i.damage,
      defense: i.defense,
      capacity: i.capacity,
      mood: existing ? existing.mood : i.mood,
      sideQuest: existing ? existing.sideQuest : null,
      goal: i.goal,
      autonomous: i.autonomous,
      awake: existing ? existing.awake : false,
      gold: i.gold ?? 0,
      tags: [...i.tags],
      secretDescription: i.secretDescription,
    });
  }

  async deleteLocation(w: WorldId, id: LocationId) {
    this.bucket(this.locations, w).delete(id);
  }
  async deleteExit(w: WorldId, id: ExitId) {
    this.bucket(this.exits, w).delete(id);
  }
  async deleteItem(w: WorldId, id: ItemId) {
    this.bucket(this.items, w).delete(id);
  }
  async deleteAgent(w: WorldId, id: AgentId) {
    this.bucket(this.agents, w).delete(id);
  }

  async silenceAllAgents(w: WorldId) {
    const bucket = this.bucket(this.agents, w);
    let changed = 0;
    for (const [id, a] of bucket) {
      if (!a.autonomous && !a.awake) continue;
      bucket.set(id, { ...a, autonomous: false, awake: false });
      changed += 1;
    }
    return { changed, total: bucket.size };
  }

  async setAgentAutonomous(w: WorldId, id: AgentId, autonomous: boolean) {
    const bucket = this.bucket(this.agents, w);
    const a = bucket.get(id);
    if (!a) return;
    bucket.set(id, { ...a, autonomous });
  }

  async listMonsterTemplates(w: WorldId) {
    return [...this.bucket(this.templates, w).values()];
  }
  async getMonsterTemplate(w: WorldId, id: MonsterTemplateId) {
    return this.bucket(this.templates, w).get(id) ?? null;
  }
  async upsertMonsterTemplate(w: WorldId, i: UpsertMonsterTemplateInput) {
    this.bucket(this.templates, w).set(i.id, {
      id: asMonsterTemplateId(i.id),
      worldId: w,
      templateKey: i.templateKey,
      label: i.label,
      labelPrefixInstructions: i.labelPrefixInstructions,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      hpMin: i.hpMin,
      hpMax: i.hpMax,
      damageMin: i.damageMin,
      damageMax: i.damageMax,
      defenseMin: i.defenseMin,
      defenseMax: i.defenseMax,
      mood: i.mood,
      startingItems: i.startingItems,
      tags: [...i.tags],
    });
  }
  async deleteMonsterTemplate(w: WorldId, id: MonsterTemplateId) {
    this.bucket(this.templates, w).delete(id);
  }

  async listLocationSpawnTriggers(w: WorldId, locationId?: LocationId) {
    const all = [...this.bucket(this.triggers, w).values()];
    return locationId ? all.filter((t) => t.locationId === locationId) : all;
  }
  async getLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId) {
    return this.bucket(this.triggers, w).get(id) ?? null;
  }
  async upsertLocationSpawnTrigger(w: WorldId, i: UpsertLocationSpawnTriggerInput) {
    this.bucket(this.triggers, w).set(i.id, {
      id: asSpawnTriggerId(i.id),
      worldId: w,
      locationId: i.locationId,
      templateId: i.templateId,
      params: i.params,
      count: i.count,
      oneShot: i.oneShot,
      fireOnInitialPublish: i.fireOnInitialPublish,
    });
  }
  async deleteLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId) {
    this.bucket(this.triggers, w).delete(id);
  }

  async readWorldLore(w: WorldId): Promise<WorldLore> {
    const row = this.worldLore.get(w);
    return {
      worldId: w,
      worldOverview: row?.worldOverview ?? '',
      storySoFar: row?.storySoFar ?? '',
    };
  }

  async writeWorldLore(w: WorldId, lore: Omit<WorldLore, 'worldId'>): Promise<void> {
    this.worldLore.set(w, { ...lore });
  }

  async listTagLore(w: WorldId): Promise<readonly TagLore[]> {
    return [...this.bucket(this.tagLore, w).values()];
  }

  async getTagLore(w: WorldId, id: TagLoreId): Promise<TagLore | null> {
    return this.bucket(this.tagLore, w).get(id) ?? null;
  }

  async getTagLoreByTag(w: WorldId, tag: string): Promise<TagLore | null> {
    for (const row of this.bucket(this.tagLore, w).values()) {
      if (row.tag === tag) return row;
    }
    return null;
  }

  async upsertTagLore(w: WorldId, i: UpsertTagLoreInput): Promise<void> {
    this.bucket(this.tagLore, w).set(i.id, {
      id: asTagLoreId(i.id),
      worldId: w,
      tag: i.tag,
      title: i.title,
      description: i.description,
    });
  }

  async deleteTagLore(w: WorldId, id: TagLoreId): Promise<void> {
    this.bucket(this.tagLore, w).delete(id);
  }

  async deleteAllEvents(_w: WorldId): Promise<void> {}

  async readTriggerFireState(w: WorldId): Promise<TriggerFireState> {
    return this.fireStates.get(w) ?? { byTriggerId: {} };
  }
  async writeTriggerFireState(w: WorldId, state: TriggerFireState): Promise<void> {
    this.fireStates.set(w, state);
  }

  async readSnapshot(w: WorldId) {
    return this.snapshots.get(w) ?? null;
  }
  async writeSnapshot(w: WorldId, json: string, takenAt: number) {
    this.snapshots.set(w, { json, takenAt });
  }

  async transaction<T>(fn: (tx: BuilderRepository) => Promise<T>): Promise<T> {
    const backup = this.clone();
    try {
      return await fn(this);
    } catch (err) {
      this.restore(backup);
      throw err;
    }
  }

  private clone() {
    const dup = <K, V>(m: Map<WorldId, Map<K, V>>) => {
      const out = new Map<WorldId, Map<K, V>>();
      for (const [k, v] of m) out.set(k, new Map(v));
      return out;
    };
    return {
      worlds: new Map(this.worlds),
      locations: dup(this.locations),
      exits: dup(this.exits),
      items: dup(this.items),
      agents: dup(this.agents),
      snapshots: new Map(this.snapshots),
      templates: dup(this.templates),
      triggers: dup(this.triggers),
      fireStates: new Map(this.fireStates),
      worldLore: new Map(this.worldLore),
      tagLore: dup(this.tagLore),
    };
  }
  private restore(b: ReturnType<MemoryBuilderRepository['clone']>) {
    this.worlds = b.worlds;
    this.locations = b.locations;
    this.exits = b.exits;
    this.items = b.items;
    this.agents = b.agents;
    this.snapshots = b.snapshots;
    this.templates = b.templates;
    this.triggers = b.triggers;
    this.fireStates = b.fireStates;
    this.worldLore = b.worldLore;
    this.tagLore = b.tagLore;
  }
}
