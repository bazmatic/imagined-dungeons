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

export const PLAYER_ACTION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'direction'],
      properties: {
        kind: { const: 'move' },
        direction: { enum: DIRECTIONS },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'targetRef'],
      properties: {
        kind: { const: 'look' },
        targetRef: { type: ['string', 'null'] as const },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'itemRef'],
      properties: {
        kind: { const: 'take' },
        itemRef: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'itemRef'],
      properties: {
        kind: { const: 'drop' },
        itemRef: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { const: 'inventory' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'reason'],
      properties: {
        kind: { const: 'unknown' },
        reason: { type: 'string' },
      },
    },
  ],
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
  | { readonly kind: 'unknown'; readonly reason: string }
  | { readonly kind: 'invalid' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isDirection = (v: unknown): v is Direction =>
  typeof v === 'string' && (DIRECTIONS as readonly string[]).includes(v);

export function validatePlayerAction(input: unknown): ValidatedPlayerAction {
  if (!isRecord(input)) return { kind: 'invalid' };
  const { kind } = input;
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
    case 'unknown': {
      const reason = input.reason;
      if (typeof reason !== 'string') return { kind: 'invalid' };
      return { kind: 'unknown', reason };
    }
    default:
      return { kind: 'invalid' };
  }
}
