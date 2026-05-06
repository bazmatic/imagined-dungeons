import type { Direction } from '@core/domain/entities';
import type { JsonSchema } from './language-model';

const DIRECTIONS: readonly Direction[] = [
  'north',
  'south',
  'east',
  'west',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
  'up',
  'down',
];

const KINDS = ['move', 'look', 'take', 'drop', 'inventory', 'speak', 'attack', 'unknown'] as const;
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
  if (!isRecord(input)) return { kind: 'invalid' };
  const { kind } = input;
  if (!isKind(kind)) return { kind: 'invalid' };

  switch (kind) {
    case 'move': {
      const direction = input.direction;
      if (!isDirection(direction)) return { kind: 'invalid' };
      return { kind: 'move', direction };
    }
    case 'look': {
      const targetRef = input.targetRef;
      if (targetRef !== null && typeof targetRef !== 'string') {
        return { kind: 'invalid' };
      }
      return { kind: 'look', targetRef };
    }
    case 'take': {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: 'invalid' };
      return { kind: 'take', itemRef };
    }
    case 'drop': {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: 'invalid' };
      return { kind: 'drop', itemRef };
    }
    case 'inventory':
      return { kind: 'inventory' };
    case 'speak': {
      const targetAgentRef = input.targetAgentRef;
      const utterance = input.utterance;
      if (typeof targetAgentRef !== 'string' || targetAgentRef.length === 0) {
        return { kind: 'invalid' };
      }
      if (typeof utterance !== 'string' || utterance.length === 0) {
        return { kind: 'invalid' };
      }
      return { kind: 'speak', targetAgentRef, utterance };
    }
    case 'attack': {
      const targetAgentRef = input.targetAgentRef;
      if (typeof targetAgentRef !== 'string' || targetAgentRef.length === 0) {
        return { kind: 'invalid' };
      }
      return { kind: 'attack', targetAgentRef };
    }
    case 'unknown': {
      const reason = input.reason;
      if (typeof reason !== 'string') return { kind: 'invalid' };
      return { kind: 'unknown', reason };
    }
  }
}
