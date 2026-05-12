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
  | { kind: 'give'; actorId: AgentId; itemId: ItemId; targetAgentId: AgentId }
  | { kind: 'inventory'; actorId: AgentId }
  | { kind: 'speak'; actorId: AgentId; targetAgentId: AgentId | null; utterance: string }
  | {
      kind: 'emote';
      actorId: AgentId;
      description: string;
      targetAgentId: AgentId | null;
    }
  | { kind: 'attack'; actorId: AgentId; targetAgentId: AgentId }
  | { kind: 'search'; actorId: AgentId; query: string }
  | {
      kind: 'update_description';
      actorId: AgentId;
      target: DescriptionTarget;
      shortDescription: string | null;
      longDescription: string | null;
      /**
       * Agent-only fields. `null` means "leave the field unchanged"; the empty
       * string `""` means "clear the field" (the consequence engine uses this
       * to mark a previously-set short-term intent as fulfilled). When the
       * target is a location or item these are silently ignored by the handler.
       */
      mood: string | null;
      shortTermIntent: string | null;
    };

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'unknown_verb'; verb: string }
  | { kind: 'missing_argument'; verb: string }
  | { kind: 'unknown_direction'; raw: string }
  | { kind: 'no_such_target'; ref: string; verb?: string }
  | { kind: 'ambiguous_target'; ref: string; candidates: string[] }
  | { kind: 'already_carried'; ref: string; label: string };
