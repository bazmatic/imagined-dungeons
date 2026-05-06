import type { Direction } from './entities';
import type { AgentId } from './ids';

export type Action =
  | { kind: 'move'; actorId: AgentId; direction: Direction }
  | { kind: 'look'; actorId: AgentId; targetRef: string | null }
  | { kind: 'take'; actorId: AgentId; itemRef: string }
  | { kind: 'drop'; actorId: AgentId; itemRef: string }
  | { kind: 'inventory'; actorId: AgentId };

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'unknown_verb'; verb: string }
  | { kind: 'missing_argument'; verb: string }
  | { kind: 'unknown_direction'; raw: string }
  | { kind: 'no_such_target'; ref: string }
  | { kind: 'ambiguous_target'; ref: string; candidates: string[] };
