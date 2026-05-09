import type {
  BuilderErrorKind,
  EntityKind,
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
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hp: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
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

export interface WorldTree {
  readonly summary: WorldSummary;
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly templates: readonly MonsterTemplate[];
  readonly triggers: readonly LocationSpawnTrigger[];
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
  | { kind: typeof EntityKind.LocationSpawnTrigger; id: SpawnTriggerId };

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
}

export interface UpsertExitInput {
  readonly id: ExitId;
  readonly from: LocationId;
  readonly to: LocationId;
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
}

export interface UpsertMonsterTemplateInput {
  readonly id: MonsterTemplateId;
  readonly templateKey: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hp: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
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
