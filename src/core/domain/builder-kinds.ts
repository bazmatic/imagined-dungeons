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
  MonsterTemplate: 'monster_template',
  LocationSpawnTrigger: 'location_spawn_trigger',
  TagLore: 'tag_lore',
} as const;
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

export const ProblemKind = {
  ExitFromMissing: 'exit_from_missing',
  ExitToMissing: 'exit_to_missing',
  ExitLockedByItemMissing: 'exit_locked_by_item_missing',
  ItemOwnerMissing: 'item_owner_missing',
  AgentLocationMissing: 'agent_location_missing',
  PlayerAgentNotSet: 'player_agent_not_set',
  PlayerAgentMissing: 'player_agent_missing',
  DuplicateId: 'duplicate_id',
  TemplateLabelEmpty: 'template_label_empty',
  TemplateHpInvalid: 'template_hp_invalid',
  TemplateStartingItemMissing: 'template_starting_item_missing',
  LocationSpawnTriggerTemplateMissing: 'location_spawn_trigger_template_missing',
  LocationSpawnTriggerLocationMissing: 'location_spawn_trigger_location_missing',
  LocationSpawnTriggerCountInvalid: 'location_spawn_trigger_count_invalid',
  LocationSpawnTriggerParamsInvalid: 'location_spawn_trigger_params_invalid',
  TagLoreTagEmpty: 'tag_lore_tag_empty',
  TagLoreDuplicate: 'tag_lore_duplicate',
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

export const TriggerEventKind = {
  PlayerEnters: 'player_enters',
  CombatStarts: 'combat_starts',
  ItemTaken: 'item_taken',
  Speech: 'speech',
  LlmJudgement: 'llm_judgement',
} as const;
export type TriggerEventKind = (typeof TriggerEventKind)[keyof typeof TriggerEventKind];

export const StarterPackEntryKind = {
  Inline: 'inline',
} as const;
export type StarterPackEntryKind = (typeof StarterPackEntryKind)[keyof typeof StarterPackEntryKind];

export const DiscoverySubjectKind = {
  Location: 'location',
  Item: 'item',
  Agent: 'agent',
} as const;
export type DiscoverySubjectKind = (typeof DiscoverySubjectKind)[keyof typeof DiscoverySubjectKind];

export const DiscoveryTriggerKind = {
  FailedLook: 'failed_look',
  Search: 'search',
} as const;
export type DiscoveryTriggerKind = (typeof DiscoveryTriggerKind)[keyof typeof DiscoveryTriggerKind];
