/**
 * Central registry of discriminator values used across the domain.
 *
 * Each `as const` object exports both:
 *   - the const-object reference (use in code instead of raw string literals);
 *   - a same-named type alias preserving the existing string-literal union.
 *
 * Rationale: a typo like `kind: 'mvoe'` would otherwise compile silently when
 * a value flows through `string`-typed call sites. Routing code through these
 * constants gives the type checker a single source of truth.
 */

export const ActionKind = {
  Move: 'move',
  Look: 'look',
  Take: 'take',
  Drop: 'drop',
  Give: 'give',
  Inventory: 'inventory',
  Speak: 'speak',
  Emote: 'emote',
  Attack: 'attack',
  UpdateDescription: 'update_description',
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export const ParseErrorKind = {
  Empty: 'empty',
  UnknownVerb: 'unknown_verb',
  MissingArgument: 'missing_argument',
  UnknownDirection: 'unknown_direction',
  NoSuchTarget: 'no_such_target',
  AmbiguousTarget: 'ambiguous_target',
  AlreadyCarried: 'already_carried',
} as const;
export type ParseErrorKind = (typeof ParseErrorKind)[keyof typeof ParseErrorKind];

export const EventKind = {
  Move: 'move',
  Take: 'take',
  Drop: 'drop',
  Give: 'give',
  Look: 'look',
  Inventory: 'inventory',
  Failed: 'failed',
  Speak: 'speak',
  Emote: 'emote',
  Attack: 'attack',
  DescriptionUpdated: 'description_updated',
  AgentSpawned: 'agent_spawned',
} as const;
export type EventKind = (typeof EventKind)[keyof typeof EventKind];

/**
 * Discriminator values for `ExaminableTarget` — what the `look` action can be
 * pointed at. Notes:
 *   - `Item` and `Location` collide string-wise with `OwnerKind` values; they
 *     live in distinct namespaces and are never compared cross-kind.
 *   - `Location` is reserved for examining a non-current location (future
 *     work); the parser does not currently produce it.
 */
export const ExaminableKind = {
  Room: 'room',
  Item: 'item',
  Agent: 'agent',
  Exit: 'exit',
  Location: 'location',
} as const;
export type ExaminableKind = (typeof ExaminableKind)[keyof typeof ExaminableKind];

export const OwnerKind = {
  Location: 'location',
  Agent: 'agent',
  Item: 'item',
} as const;
export type OwnerKind = (typeof OwnerKind)[keyof typeof OwnerKind];

export const AttackOutcome = {
  Hit: 'hit',
  Miss: 'miss',
} as const;
export type AttackOutcome = (typeof AttackOutcome)[keyof typeof AttackOutcome];

/**
 * Reasons why the NPC mind fell back to a deterministic intent rather than
 * calling the language model. Centralised here so log lines and any future
 * structured fallback metadata share a single source of truth.
 */
export const NpcMindFallback = {
  NoLlm: 'no_llm',
  LlmError: 'llm_error',
  EmptyResponse: 'empty_response',
} as const;
export type NpcMindFallback = (typeof NpcMindFallback)[keyof typeof NpcMindFallback];

/**
 * The deterministic intent string an NPC produces when the LLM is unavailable
 * or errors. Kept as a constant so any code path that has to recognise the
 * fallback (tests, future scheduling heuristics) avoids string literals.
 */
export const NpcFallbackIntent = 'wait';

export const Direction = {
  North: 'north',
  South: 'south',
  East: 'east',
  West: 'west',
  Northeast: 'northeast',
  Northwest: 'northwest',
  Southeast: 'southeast',
  Southwest: 'southwest',
  Up: 'up',
  Down: 'down',
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];
export const ALL_DIRECTIONS: readonly Direction[] = Object.values(Direction);
