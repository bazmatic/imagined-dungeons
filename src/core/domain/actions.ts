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
  | {
      kind: 'creative_attack';
      actorId: AgentId;
      targetAgentId: AgentId;
      toHit: { readonly sides: number; readonly threshold: number };
      damage: { readonly count: number; readonly sides: number; readonly bonus: number };
      narrative: string;
    }
  | { kind: 'search'; actorId: AgentId; query: string }
  | { kind: 'equip'; actorId: AgentId; itemId: ItemId; manner: string }
  | { kind: 'unequip'; actorId: AgentId; itemId: ItemId; manner: string }
  | { kind: 'open'; actorId: AgentId; itemId: ItemId }
  | { kind: 'close'; actorId: AgentId; itemId: ItemId }
  | { kind: 'buy'; actorId: AgentId; sellerId: AgentId; itemId: ItemId }
  | { kind: 'sell'; actorId: AgentId; buyerId: AgentId; itemId: ItemId }
  | { kind: 'offer'; actorId: AgentId; itemId: ItemId; price: number }
  | { kind: 'reveal_item'; actorId: AgentId; itemId: ItemId }
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
  | { kind: 'already_carried'; ref: string; label: string }
  | { kind: 'impossible_action'; reason: string };
