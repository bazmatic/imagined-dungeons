import type { BuilderRepository } from '@core/builder/repository';
import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  TriggerFireState,
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
  WorldSummary,
} from '@core/domain/builder-types';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type MonsterTemplateId,
  type SpawnTriggerId,
  type WorldId,
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
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

  private bucket<K, V>(map: Map<WorldId, Map<K, V>>, world: WorldId): Map<K, V> {
    let b = map.get(world);
    if (!b) {
      b = new Map<K, V>();
      map.set(world, b);
    }
    return b;
  }

  async listWorlds() {
    return [...this.worlds.values()];
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
    this.bucket(this.items, w).set(i.id, {
      id: asItemId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      owner,
      weight: i.weight,
      hidden: i.hidden,
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
      shortTermIntent: existing ? existing.shortTermIntent : null,
      goal: i.goal,
      autonomous: i.autonomous,
      awake: existing ? existing.awake : false,
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

  async listMonsterTemplates(_w: WorldId): Promise<readonly MonsterTemplate[]> {
    throw new Error('listMonsterTemplates: not implemented yet (Task 4/5)');
  }
  async getMonsterTemplate(_w: WorldId, _id: MonsterTemplateId): Promise<MonsterTemplate | null> {
    throw new Error('getMonsterTemplate: not implemented yet (Task 4/5)');
  }
  async upsertMonsterTemplate(_w: WorldId, _input: UpsertMonsterTemplateInput): Promise<void> {
    throw new Error('upsertMonsterTemplate: not implemented yet (Task 4/5)');
  }
  async deleteMonsterTemplate(_w: WorldId, _id: MonsterTemplateId): Promise<void> {
    throw new Error('deleteMonsterTemplate: not implemented yet (Task 4/5)');
  }

  async listLocationSpawnTriggers(
    _w: WorldId,
    _locationId?: LocationId,
  ): Promise<readonly LocationSpawnTrigger[]> {
    throw new Error('listLocationSpawnTriggers: not implemented yet (Task 4/5)');
  }
  async getLocationSpawnTrigger(
    _w: WorldId,
    _id: SpawnTriggerId,
  ): Promise<LocationSpawnTrigger | null> {
    throw new Error('getLocationSpawnTrigger: not implemented yet (Task 4/5)');
  }
  async upsertLocationSpawnTrigger(
    _w: WorldId,
    _input: UpsertLocationSpawnTriggerInput,
  ): Promise<void> {
    throw new Error('upsertLocationSpawnTrigger: not implemented yet (Task 4/5)');
  }
  async deleteLocationSpawnTrigger(_w: WorldId, _id: SpawnTriggerId): Promise<void> {
    throw new Error('deleteLocationSpawnTrigger: not implemented yet (Task 4/5)');
  }

  async readTriggerFireState(_w: WorldId): Promise<TriggerFireState> {
    throw new Error('readTriggerFireState: not implemented yet (Task 4/5)');
  }
  async writeTriggerFireState(_w: WorldId, _state: TriggerFireState): Promise<void> {
    throw new Error('writeTriggerFireState: not implemented yet (Task 4/5)');
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
    };
  }
  private restore(b: ReturnType<MemoryBuilderRepository['clone']>) {
    this.worlds = b.worlds;
    this.locations = b.locations;
    this.exits = b.exits;
    this.items = b.items;
    this.agents = b.agents;
    this.snapshots = b.snapshots;
  }
}
