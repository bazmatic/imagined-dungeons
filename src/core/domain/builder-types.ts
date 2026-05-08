import type {
  BuilderErrorKind,
  EntityKind,
  ProblemKind,
  PublishOutcomeKind,
  SkipReasonKind,
  WorldKind,
} from './builder-kinds';
import type { Agent, Exit, Item, Location } from './entities';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from './ids';
import type { OwnerKind } from './kinds';

export interface WorldSummary {
  readonly id: WorldId;
  readonly kind: WorldKind;
  readonly label: string;
  readonly displayName: string;
  readonly parentDraftId: WorldId | null;
  readonly playerAgentId: AgentId | null;
}

export interface WorldTree {
  readonly summary: WorldSummary;
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
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
  | { kind: typeof EntityKind.Agent; id: AgentId };

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
