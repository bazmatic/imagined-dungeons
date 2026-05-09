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
import type {
  AgentId,
  ExitId,
  ItemId,
  LocationId,
  MonsterTemplateId,
  SpawnTriggerId,
  WorldId,
} from '@core/domain/ids';

/**
 * Structural-write port for the campaign builder. The engine's `Repository`
 * is read-mostly with narrow runtime mutations; the builder needs broad
 * structural CRUD over locations/exits/items/agents plus world-level admin
 * (create/clone/list, snapshot read/write, transactional publish).
 *
 * Implemented by `MemoryBuilderRepository` (tests) and
 * `SqliteBuilderRepository` (production).
 */
export interface BuilderRepository {
  listWorlds(): Promise<readonly WorldSummary[]>;
  getWorldSummary(id: WorldId): Promise<WorldSummary | null>;
  createWorld(summary: WorldSummary): Promise<void>;
  updateWorldSummary(id: WorldId, patch: Partial<Omit<WorldSummary, 'id' | 'kind'>>): Promise<void>;

  listLocations(worldId: WorldId): Promise<readonly Location[]>;
  listExits(worldId: WorldId): Promise<readonly Exit[]>;
  listItems(worldId: WorldId): Promise<readonly Item[]>;
  listAgents(worldId: WorldId): Promise<readonly Agent[]>;

  upsertLocation(worldId: WorldId, input: UpsertLocationInput): Promise<void>;
  upsertExit(worldId: WorldId, input: UpsertExitInput): Promise<void>;
  upsertItem(worldId: WorldId, input: UpsertItemInput): Promise<void>;
  upsertAgent(worldId: WorldId, input: UpsertAgentInput): Promise<void>;

  deleteLocation(worldId: WorldId, id: LocationId): Promise<void>;
  deleteExit(worldId: WorldId, id: ExitId): Promise<void>;
  deleteItem(worldId: WorldId, id: ItemId): Promise<void>;
  deleteAgent(worldId: WorldId, id: AgentId): Promise<void>;

  listMonsterTemplates(worldId: WorldId): Promise<readonly MonsterTemplate[]>;
  getMonsterTemplate(worldId: WorldId, id: MonsterTemplateId): Promise<MonsterTemplate | null>;
  upsertMonsterTemplate(worldId: WorldId, input: UpsertMonsterTemplateInput): Promise<void>;
  deleteMonsterTemplate(worldId: WorldId, id: MonsterTemplateId): Promise<void>;

  listLocationSpawnTriggers(
    worldId: WorldId,
    locationId?: LocationId,
  ): Promise<readonly LocationSpawnTrigger[]>;
  getLocationSpawnTrigger(
    worldId: WorldId,
    id: SpawnTriggerId,
  ): Promise<LocationSpawnTrigger | null>;
  upsertLocationSpawnTrigger(
    worldId: WorldId,
    input: UpsertLocationSpawnTriggerInput,
  ): Promise<void>;
  deleteLocationSpawnTrigger(worldId: WorldId, id: SpawnTriggerId): Promise<void>;

  /**
   * Per-live-world spawn-firing record. Separate column-shape on
   * `world_snapshots.snapshotJson` is documented in the spec; for the port
   * we expose a typed accessor so adapters can keep the JSON detail
   * private.
   */
  readTriggerFireState(worldId: WorldId): Promise<TriggerFireState>;
  writeTriggerFireState(worldId: WorldId, state: TriggerFireState): Promise<void>;

  /** Snapshot of last published draft state for a live world (or null). */
  readSnapshot(worldId: WorldId): Promise<{
    json: string;
    takenAt: number;
  } | null>;
  writeSnapshot(worldId: WorldId, json: string, takenAt: number): Promise<void>;

  /**
   * Run `fn` inside a single transaction. Implementations must guarantee
   * either every write inside `fn` lands or none does.
   */
  transaction<T>(fn: (tx: BuilderRepository) => Promise<T>): Promise<T>;
}
