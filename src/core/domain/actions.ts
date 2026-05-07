import type { Direction } from './entities';
import type { ExaminableTarget } from './examinable';
import type { AgentId, ItemId, LocationId } from './ids';

export type DescriptionTarget =
  | { kind: 'location'; id: LocationId }
  | { kind: 'item'; id: ItemId }
  | { kind: 'agent'; id: AgentId };

export type Action =
  | { kind: 'move'; actorId: AgentId; direction: Direction }
  | { kind: 'look'; actorId: AgentId; target: ExaminableTarget }
  | { kind: 'take'; actorId: AgentId; itemId: ItemId }
  | { kind: 'drop'; actorId: AgentId; itemId: ItemId }
  | { kind: 'inventory'; actorId: AgentId }
  | { kind: 'speak'; actorId: AgentId; targetAgentId: AgentId; utterance: string }
  | {
      kind: 'emote';
      actorId: AgentId;
      description: string;
      targetAgentId: AgentId | null;
    }
  | { kind: 'attack'; actorId: AgentId; targetAgentId: AgentId }
  | {
      kind: 'update_description';
      actorId: AgentId;
      target: DescriptionTarget;
      shortDescription: string | null;
      longDescription: string | null;
    };

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'unknown_verb'; verb: string }
  | { kind: 'missing_argument'; verb: string }
  | { kind: 'unknown_direction'; raw: string }
  | { kind: 'no_such_target'; ref: string }
  | { kind: 'ambiguous_target'; ref: string; candidates: string[] };
