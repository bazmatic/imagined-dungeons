import type { AgentId, ExitId, ItemId, LocationId } from './ids';
import type { ExaminableKind } from './kinds';

/**
 * What a `look` action can be pointed at (abstract-design §6.1: looking at
 * any entity is mechanical — the system serves the stored description).
 *
 * `Room` is the actor's current location and carries no id (a bare `look`).
 * `Location` is reserved for examining a non-current location — the parser
 * does not currently produce it; see the look handler.
 */
export type ExaminableTarget =
  | { kind: typeof ExaminableKind.Room }
  | { kind: typeof ExaminableKind.Item; id: ItemId }
  | { kind: typeof ExaminableKind.Agent; id: AgentId }
  | { kind: typeof ExaminableKind.Exit; id: ExitId }
  | { kind: typeof ExaminableKind.Location; id: LocationId };
