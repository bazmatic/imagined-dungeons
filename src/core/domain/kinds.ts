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
  Inventory: 'inventory',
  Speak: 'speak',
  Attack: 'attack',
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export const ParseErrorKind = {
  Empty: 'empty',
  UnknownVerb: 'unknown_verb',
  MissingArgument: 'missing_argument',
  UnknownDirection: 'unknown_direction',
  NoSuchTarget: 'no_such_target',
  AmbiguousTarget: 'ambiguous_target',
} as const;
export type ParseErrorKind = (typeof ParseErrorKind)[keyof typeof ParseErrorKind];

export const EventKind = {
  Move: 'move',
  Take: 'take',
  Drop: 'drop',
  Look: 'look',
  Inventory: 'inventory',
  Failed: 'failed',
  Speak: 'speak',
  Attack: 'attack',
} as const;
export type EventKind = (typeof EventKind)[keyof typeof EventKind];

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
