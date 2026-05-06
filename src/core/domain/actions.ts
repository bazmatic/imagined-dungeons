import type { Direction } from './entities';
import type { AgentId, ItemId } from './ids';

export type Action =
  | { kind: 'move'; actorId: AgentId; direction: Direction }
  | { kind: 'look'; actorId: AgentId; targetItemId: ItemId | null }
  | { kind: 'take'; actorId: AgentId; itemId: ItemId }
  | { kind: 'drop'; actorId: AgentId; itemId: ItemId }
  | { kind: 'inventory'; actorId: AgentId };

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'unknown_verb'; verb: string }
  | { kind: 'missing_argument'; verb: string }
  | { kind: 'unknown_direction'; raw: string }
  | { kind: 'no_such_target'; ref: string }
  | { kind: 'ambiguous_target'; ref: string; candidates: string[] };
