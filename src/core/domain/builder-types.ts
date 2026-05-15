import type {
  BuilderErrorKind,
  DiscoverySubjectKind,
  DiscoveryTriggerKind,
  EntityKind,
  ImportMode,
  ProblemKind,
  PublishOutcomeKind,
  SkipReasonKind,
  StarterPackEntryKind,
  TriggerEventKind,
  WorldKind,
} from './builder-kinds';
import type { Agent, Exit, Item, Location } from './entities';
import type {
  AgentId,
  ExitId,
  ItemId,
  LocationId,
  MonsterTemplateId,
  SpawnTriggerId,
  TagLoreId,
  WorldId,
} from './ids';
import type { OwnerKind } from './kinds';

export interface WorldSummary {
  readonly id: WorldId;
  readonly kind: WorldKind;
  readonly label: string;
  readonly displayName: string;
  readonly parentDraftId: WorldId | null;
  readonly playerAgentId: AgentId | null;
  readonly coverImageUrl: string | null;
}

export interface WorldSummaryWithStats extends WorldSummary {
  readonly locationCount: number;
  readonly agentCount: number;
  readonly itemCount: number;
}

export interface InlineStarterPackEntry {
  readonly kind: typeof StarterPackEntryKind.Inline;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly weight: number;
  readonly hidden: boolean;
}
export type StarterPackEntry = InlineStarterPackEntry;

export interface MonsterTemplate {
  readonly id: MonsterTemplateId;
  readonly worldId: WorldId;
  readonly templateKey: string;
  readonly label: string;
  readonly labelPrefixInstructions: string | null;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hpMin: number;
  readonly hpMax: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly defenseMin: number;
  readonly defenseMax: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
  readonly tags: readonly string[];
}

export type TriggerParams =
  | { readonly kind: typeof TriggerEventKind.PlayerEnters }
  | { readonly kind: typeof TriggerEventKind.CombatStarts }
  | { readonly kind: typeof TriggerEventKind.ItemTaken; readonly itemTemplateKey?: string }
  | { readonly kind: typeof TriggerEventKind.Speech; readonly phrase: string }
  | { readonly kind: typeof TriggerEventKind.LlmJudgement; readonly predicate: string };

export interface LocationSpawnTrigger {
  readonly id: SpawnTriggerId;
  readonly worldId: WorldId;
  readonly locationId: LocationId;
  readonly templateId: MonsterTemplateId;
  readonly params: TriggerParams;
  readonly count: number;
  readonly oneShot: boolean;
  readonly fireOnInitialPublish: boolean;
}

export interface WorldLore {
  readonly worldId: WorldId;
  readonly worldOverview: string;
  readonly storySoFar: string;
}

export interface TagLore {
  readonly id: TagLoreId;
  readonly worldId: WorldId;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface UpsertTagLoreInput {
  readonly id: TagLoreId;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface LoreContext {
  readonly worldOverview: string;
  readonly storySoFar: string;
  readonly tagDescriptions: Readonly<Record<string, string>>;
}

export interface LoreSubject {
  readonly tags: readonly string[];
  readonly locationId: LocationId | null;
}

export interface DiscoverySubject {
  readonly kind: DiscoverySubjectKind;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
}

export interface DiscoveryRequest {
  readonly trigger: DiscoveryTriggerKind;
  readonly actorId: AgentId;
  readonly locationId: LocationId;
  readonly query: string;
  readonly subject: DiscoverySubject | null;
  readonly loreContext: LoreContext;
  readonly visibleItems: readonly Item[];
  readonly visibleAgents: readonly Agent[];
  /**
   * Items at this location with `hidden: true`. The player can't see them
   * via perception, but a careful search may turn them up. The discovery
   * LLM can match these via `matchedItemId` when the query indicates the
   * player is specifically searching for one; the search handler then
   * flips the hidden flag and routes through the normal look path.
   */
  readonly undiscoveredItems: readonly Item[];
}

export interface DiscoveryResponse {
  readonly narration: string;
  // When non-null and the id is in the request's visible list, the
  // engine routes through the normal `look <entity>` path and shows
  // the entity's authored description. `narration` and spawn fields
  // are ignored in this case.
  readonly matchedItemId: ItemId | null;
  readonly matchedAgentId: AgentId | null;
  readonly spawnedItem: UpsertItemInput | null;
  readonly spawnedAgent: UpsertAgentInput | null;
}

export interface WorldTree {
  readonly summary: WorldSummary;
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly templates: readonly MonsterTemplate[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly worldLore: WorldLore;
  readonly tagLore: readonly TagLore[];
}

export interface Problem {
  readonly kind: ProblemKind;
  readonly entity: EntityKind;
  readonly entityId: string;
  readonly message: string;
}

export interface BuilderError {
  readonly kind: BuilderErrorKind;
  readonly message: string;
  readonly problems?: readonly Problem[];
}

export type EntityRef =
  | { kind: typeof EntityKind.Location; id: LocationId }
  | { kind: typeof EntityKind.Exit; id: ExitId }
  | { kind: typeof EntityKind.Item; id: ItemId }
  | { kind: typeof EntityKind.Agent; id: AgentId }
  | { kind: typeof EntityKind.MonsterTemplate; id: MonsterTemplateId }
  | { kind: typeof EntityKind.LocationSpawnTrigger; id: SpawnTriggerId }
  | { kind: typeof EntityKind.TagLore; id: TagLoreId };

export interface SkipReport {
  readonly ref: EntityRef;
  readonly reason: SkipReasonKind;
}

export interface MergePlan {
  readonly inserts: {
    readonly locations: readonly Location[];
    readonly exits: readonly Exit[];
    readonly items: readonly Item[];
    readonly agents: readonly Agent[];
  };
  readonly updates: {
    readonly locations: readonly Location[];
    readonly exits: readonly Exit[];
    readonly items: readonly Item[];
    readonly agents: readonly Agent[];
  };
  readonly deletes: readonly EntityRef[];
  readonly skipped: readonly SkipReport[];
}

export interface PublishResult {
  readonly outcome: PublishOutcomeKind;
  readonly liveWorldId: WorldId;
  readonly applied: {
    readonly inserts: number;
    readonly updates: number;
    readonly deletes: number;
  };
  readonly skipped: readonly SkipReport[];
  readonly initialSpawns: number;
}

export interface CreateDraftInput {
  readonly displayName: string;
  readonly label: string;
}

export interface UpsertLocationInput {
  readonly id: LocationId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly tags: readonly string[];
  /** GM-only secret notes; never surfaced to the player. Default ''. */
  readonly secretDescription: string;
}

export interface UpsertExitInput {
  readonly id: ExitId;
  readonly from: LocationId;
  readonly to: LocationId | null;
  readonly direction: string;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}

export interface UpsertItemInput {
  readonly id: ItemId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly ownerKind: OwnerKind;
  readonly ownerId: string;
  readonly weight: number;
  readonly hidden: boolean;
  readonly tags: readonly string[];
  /**
   * Authored intent. True means this item can be opened / closed and may
   * hold other items inside it. Gates the open/close actions and the
   * perception filter for contents.
   */
  readonly container: boolean;
  /** Runtime state. Meaningful only when `container` is true. */
  readonly opened: boolean;
  /** Runtime state. Meaningful only when `container` is true. */
  readonly locked: boolean;
  /** The item-id whose presence in the actor's inventory auto-unlocks this container. */
  readonly lockedByItem: ItemId | null;
  readonly priceTag: number | null;
}

export interface UpsertAgentInput {
  readonly id: AgentId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly locationId: LocationId;
  readonly hp: number;
  readonly damage: number;
  readonly defense: number;
  readonly capacity: number;
  readonly mood: string | null;
  readonly goal: string | null;
  readonly autonomous: boolean;
  readonly gold: number;
  readonly tags: readonly string[];
  /** GM-only secret notes; never surfaced to the player. Default ''. */
  readonly secretDescription: string;
}

export interface UpsertMonsterTemplateInput {
  readonly id: MonsterTemplateId;
  readonly templateKey: string;
  readonly label: string;
  readonly labelPrefixInstructions: string | null;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hpMin: number;
  readonly hpMax: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly defenseMin: number;
  readonly defenseMax: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
  readonly tags: readonly string[];
}

export interface UpsertLocationSpawnTriggerInput {
  readonly id: SpawnTriggerId;
  readonly locationId: LocationId;
  readonly templateId: MonsterTemplateId;
  readonly params: TriggerParams;
  readonly count: number;
  readonly oneShot: boolean;
  readonly fireOnInitialPublish: boolean;
}

export interface TriggerFireRecord {
  readonly firedAt: number;
}
export interface TriggerFireState {
  readonly byTriggerId: Readonly<Record<string, TriggerFireRecord>>;
}

export interface SnapshotBlob {
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly templates: readonly MonsterTemplate[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly worldLore: { readonly worldOverview: string; readonly storySoFar: string };
  readonly tagLore: ReadonlyArray<{
    readonly id: TagLoreId;
    readonly tag: string;
    readonly title: string;
    readonly description: string;
  }>;
}

export interface WorldExportBundle {
  readonly version: 1;
  readonly format: 'imagined-dungeons-world-export';
  readonly exportedAt: string;
  readonly worldMeta: {
    readonly displayName: string;
    readonly label: string;
    readonly coverImageUrl: string | null;
  };
  readonly draft: SnapshotBlob;
  readonly live: SnapshotBlob | null;
}

export interface ImportWorldOptions {
  readonly mode: ImportMode;
  readonly targetDraftId?: WorldId;
}
