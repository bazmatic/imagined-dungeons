/**
 * Discriminator values for the campaign builder. Following the no-string-
 * literals rule, every code path that branches on these values goes through
 * the const objects rather than a raw string.
 */

export const WorldKind = {
  Draft: 'draft',
  Live: 'live',
} as const;
export type WorldKind = (typeof WorldKind)[keyof typeof WorldKind];

export const EntityKind = {
  Location: 'location',
  Exit: 'exit',
  Item: 'item',
  Agent: 'agent',
} as const;
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

export const ProblemKind = {
  ExitFromMissing: 'exit_from_missing',
  ExitToMissing: 'exit_to_missing',
  ExitLockedByItemMissing: 'exit_locked_by_item_missing',
  ItemOwnerMissing: 'item_owner_missing',
  ItemOwnerKindMismatch: 'item_owner_kind_mismatch',
  AgentLocationMissing: 'agent_location_missing',
  PlayerAgentNotSet: 'player_agent_not_set',
  PlayerAgentMissing: 'player_agent_missing',
  DuplicateId: 'duplicate_id',
} as const;
export type ProblemKind = (typeof ProblemKind)[keyof typeof ProblemKind];

export const BuilderErrorKind = {
  WorldNotFound: 'world_not_found',
  WorldKindMismatch: 'world_kind_mismatch',
  EntityNotFound: 'entity_not_found',
  ValidationFailed: 'validation_failed',
  SnapshotConflict: 'snapshot_conflict',
  NoLiveWorldForDraft: 'no_live_world_for_draft',
  IdAlreadyExists: 'id_already_exists',
} as const;
export type BuilderErrorKind = (typeof BuilderErrorKind)[keyof typeof BuilderErrorKind];

export const PublishOutcomeKind = {
  Created: 'created',
  Merged: 'merged',
} as const;
export type PublishOutcomeKind = (typeof PublishOutcomeKind)[keyof typeof PublishOutcomeKind];

export const SkipReasonKind = {
  LiveDivergedFromSnapshot: 'live_diverged_from_snapshot',
  LiveDeletedRow: 'live_deleted_row',
} as const;
export type SkipReasonKind = (typeof SkipReasonKind)[keyof typeof SkipReasonKind];
