import type { Direction } from '@core/domain/entities';
import { ALL_DIRECTIONS, ActionKind } from '@core/domain/kinds';
import type { JsonSchema } from './language-model';

const DIRECTIONS: readonly Direction[] = ALL_DIRECTIONS;

/**
 * Kinds the LLM can emit. ActionKind plus an extra `unknown` for inputs the
 * LLM cannot map. (`invalid` is internal to the validator and not part of the
 * wire schema.)
 */
const UnknownKind = 'unknown' as const;
const InvalidKind = 'invalid' as const;
/**
 * Kinds the player/NPC interpreter is allowed to produce. The
 * `update_description` action exists in the closed action vocabulary but is
 * issued by "the world" (the consequence engine) and is therefore deliberately
 * absent here — players and NPCs cannot rewrite stored descriptions.
 */
const INTERPRETER_KINDS = [
  ActionKind.Move,
  ActionKind.Look,
  ActionKind.Take,
  ActionKind.Drop,
  ActionKind.Inventory,
  ActionKind.Speak,
  ActionKind.Attack,
] as const;
const KINDS = [...INTERPRETER_KINDS, UnknownKind] as const;
type Kind = (typeof KINDS)[number];

/**
 * OpenAI strict structured-outputs mode forbids `oneOf` / `anyOf` and
 * requires every property listed in `properties` to also be listed in
 * `required`. So the schema is a single flat object with a `kind`
 * discriminator and union-typed payload fields. Fields irrelevant to a
 * given `kind` are sent as `null`; the validator ignores them.
 */
export const PLAYER_ACTION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'direction', 'targetRef', 'itemRef', 'targetAgentRef', 'utterance', 'reason'],
  properties: {
    kind: { enum: [...KINDS] },
    direction: { type: ['string', 'null'], enum: [...DIRECTIONS, null] },
    targetRef: { type: ['string', 'null'] },
    itemRef: { type: ['string', 'null'] },
    targetAgentRef: { type: ['string', 'null'] },
    utterance: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
  },
};

export const PLAYER_ACTION_SCHEMA_NAME = 'PlayerActionResponse';

/**
 * The validator's output. NOT an Action — that requires an actorId, which
 * the LLM never sees. The interpreter assembles the Action.
 */
export type ValidatedPlayerAction =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'look'; readonly targetRef: string | null }
  | { readonly kind: 'take'; readonly itemRef: string }
  | { readonly kind: 'drop'; readonly itemRef: string }
  | { readonly kind: 'inventory' }
  | { readonly kind: 'speak'; readonly targetAgentRef: string; readonly utterance: string }
  | { readonly kind: 'attack'; readonly targetAgentRef: string }
  | { readonly kind: 'unknown'; readonly reason: string }
  | { readonly kind: 'invalid' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isDirection = (v: unknown): v is Direction =>
  typeof v === 'string' && (DIRECTIONS as readonly string[]).includes(v);

const isKind = (v: unknown): v is Kind =>
  typeof v === 'string' && (KINDS as readonly string[]).includes(v);

export function validatePlayerAction(input: unknown): ValidatedPlayerAction {
  if (!isRecord(input)) return { kind: InvalidKind };
  const { kind } = input;
  if (!isKind(kind)) return { kind: InvalidKind };

  switch (kind) {
    case ActionKind.Move: {
      const direction = input.direction;
      if (!isDirection(direction)) return { kind: InvalidKind };
      return { kind: ActionKind.Move, direction };
    }
    case ActionKind.Look: {
      const targetRef = input.targetRef;
      if (targetRef !== null && typeof targetRef !== 'string') {
        return { kind: InvalidKind };
      }
      return { kind: ActionKind.Look, targetRef };
    }
    case ActionKind.Take: {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: InvalidKind };
      return { kind: ActionKind.Take, itemRef };
    }
    case ActionKind.Drop: {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: InvalidKind };
      return { kind: ActionKind.Drop, itemRef };
    }
    case ActionKind.Inventory:
      return { kind: ActionKind.Inventory };
    case ActionKind.Speak: {
      const targetAgentRef = input.targetAgentRef;
      const utterance = input.utterance;
      if (typeof targetAgentRef !== 'string' || targetAgentRef.length === 0) {
        return { kind: InvalidKind };
      }
      if (typeof utterance !== 'string' || utterance.length === 0) {
        return { kind: InvalidKind };
      }
      return { kind: ActionKind.Speak, targetAgentRef, utterance };
    }
    case ActionKind.Attack: {
      const targetAgentRef = input.targetAgentRef;
      if (typeof targetAgentRef !== 'string' || targetAgentRef.length === 0) {
        return { kind: InvalidKind };
      }
      return { kind: ActionKind.Attack, targetAgentRef };
    }
    case UnknownKind: {
      const reason = input.reason;
      if (typeof reason !== 'string') return { kind: InvalidKind };
      return { kind: UnknownKind, reason };
    }
  }
}
