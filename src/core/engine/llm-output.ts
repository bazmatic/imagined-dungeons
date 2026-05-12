import type { Direction } from '@core/domain/entities';
import { ALL_DIRECTIONS, ActionKind, ExaminableKind } from '@core/domain/kinds';
import type { JsonSchema } from './language-model';

const DIRECTIONS: readonly Direction[] = ALL_DIRECTIONS;

/**
 * Kinds the LLM can emit. ActionKind plus an extra `unknown` for inputs the
 * LLM cannot map. (`invalid` is internal to the validator and not part of the
 * wire schema.)
 */
const UnknownKind = 'unknown' as const;
const ImpossibleKind = 'impossible' as const;
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
  ActionKind.Give,
  ActionKind.Inventory,
  ActionKind.Speak,
  ActionKind.Emote,
  ActionKind.Attack,
  ActionKind.Search,
  ActionKind.Equip,
  ActionKind.Unequip,
] as const;
const KINDS = [...INTERPRETER_KINDS, UnknownKind, ImpossibleKind] as const;
type Kind = (typeof KINDS)[number];

/**
 * The four kinds of thing the player can `look` at. `Room` means the actor's
 * current location (a bare "look around"). The interpreter resolves the other
 * three by ref against the perception view (see llm-interpret.ts).
 */
const LOOK_TARGET_KINDS = [
  ExaminableKind.Item,
  ExaminableKind.Agent,
  ExaminableKind.Exit,
  ExaminableKind.Room,
] as const;
type LookTargetKind = (typeof LOOK_TARGET_KINDS)[number];

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
  required: [
    'kind',
    'direction',
    'targetKind',
    'targetRef',
    'itemRef',
    'targetAgentRef',
    'utterance',
    'emoteDescription',
    'reason',
  ],
  properties: {
    kind: { enum: [...KINDS] },
    direction: { type: ['string', 'null'], enum: [...DIRECTIONS, null] },
    // `targetKind` discriminates what `look` is pointed at. Null is treated
    // as "the room" (a bare look). Strict-mode enums must include null when
    // the type permits null; we list it explicitly.
    targetKind: { type: ['string', 'null'], enum: [...LOOK_TARGET_KINDS, null] },
    targetRef: { type: ['string', 'null'] },
    itemRef: { type: ['string', 'null'] },
    targetAgentRef: { type: ['string', 'null'] },
    utterance: { type: ['string', 'null'] },
    emoteDescription: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
  },
};

export const PLAYER_ACTION_SCHEMA_NAME = 'PlayerActionResponse';

/**
 * The validator's output. NOT an Action — that requires an actorId, which
 * the LLM never sees. The interpreter assembles the Action.
 */
/**
 * The intermediate `look` shape the validator returns: the LLM emits both a
 * `targetKind` (what flavour of thing) and a `targetRef` (a natural-language
 * reference). `llmInterpret` resolves the ref to a domain id afterwards.
 *
 * `targetKind === 'room'` (or null) collapses to a bare look at the actor's
 * current location and ignores `targetRef`.
 */
export type ValidatedLookTarget =
  | { readonly kind: typeof ExaminableKind.Room }
  | {
      readonly kind:
        | typeof ExaminableKind.Item
        | typeof ExaminableKind.Agent
        | typeof ExaminableKind.Exit;
      readonly ref: string;
    };

export type ValidatedPlayerAction =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'look'; readonly target: ValidatedLookTarget }
  | { readonly kind: 'take'; readonly itemRef: string }
  | { readonly kind: 'drop'; readonly itemRef: string }
  | { readonly kind: 'give'; readonly itemRef: string; readonly targetAgentRef: string }
  | { readonly kind: 'inventory' }
  | {
      readonly kind: 'speak';
      readonly targetAgentRef: string | null;
      readonly utterance: string;
    }
  | {
      readonly kind: 'emote';
      readonly emoteDescription: string;
      readonly targetAgentRef: string | null;
    }
  | { readonly kind: 'attack'; readonly targetAgentRef: string }
  | { readonly kind: 'search'; readonly query: string }
  | { readonly kind: 'equip'; readonly itemRef: string; readonly manner: string }
  | { readonly kind: 'unequip'; readonly itemRef: string; readonly manner: string }
  | { readonly kind: 'unknown'; readonly reason: string }
  | { readonly kind: 'impossible'; readonly reason: string }
  | { readonly kind: 'invalid' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isDirection = (v: unknown): v is Direction =>
  typeof v === 'string' && (DIRECTIONS as readonly string[]).includes(v);

const isKind = (v: unknown): v is Kind =>
  typeof v === 'string' && (KINDS as readonly string[]).includes(v);

const isLookTargetKind = (v: unknown): v is LookTargetKind =>
  typeof v === 'string' && (LOOK_TARGET_KINDS as readonly string[]).includes(v);

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
      const targetKind = input.targetKind;
      const targetRef = input.targetRef;
      if (targetRef !== null && typeof targetRef !== 'string') {
        return { kind: InvalidKind };
      }
      // Null targetKind or explicit "room" both mean "look at the room".
      // targetRef is ignored in that case.
      if (targetKind === null || targetKind === ExaminableKind.Room) {
        return {
          kind: ActionKind.Look,
          target: { kind: ExaminableKind.Room },
        };
      }
      if (!isLookTargetKind(targetKind)) return { kind: InvalidKind };
      // For non-room targets the ref is required.
      if (typeof targetRef !== 'string' || targetRef.length === 0) {
        return { kind: InvalidKind };
      }
      return {
        kind: ActionKind.Look,
        target: { kind: targetKind, ref: targetRef },
      };
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
    case ActionKind.Give: {
      const itemRef = input.itemRef;
      const targetAgentRef = input.targetAgentRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: InvalidKind };
      if (typeof targetAgentRef !== 'string' || targetAgentRef.length === 0) {
        return { kind: InvalidKind };
      }
      return { kind: ActionKind.Give, itemRef, targetAgentRef };
    }
    case ActionKind.Inventory:
      return { kind: ActionKind.Inventory };
    case ActionKind.Speak: {
      const rawTargetAgentRef = input.targetAgentRef;
      const utterance = input.utterance;
      if (typeof utterance !== 'string' || utterance.length === 0) {
        return { kind: InvalidKind };
      }
      const targetAgentRef =
        typeof rawTargetAgentRef === 'string' && rawTargetAgentRef.length > 0
          ? rawTargetAgentRef
          : null;
      return { kind: ActionKind.Speak, targetAgentRef, utterance };
    }
    case ActionKind.Attack: {
      const targetAgentRef = input.targetAgentRef;
      if (typeof targetAgentRef !== 'string' || targetAgentRef.length === 0) {
        return { kind: InvalidKind };
      }
      return { kind: ActionKind.Attack, targetAgentRef };
    }
    case ActionKind.Emote: {
      const emoteDescription = input.emoteDescription;
      if (typeof emoteDescription !== 'string' || emoteDescription.length === 0) {
        return { kind: InvalidKind };
      }
      const rawTargetAgentRef = input.targetAgentRef;
      const targetAgentRef =
        typeof rawTargetAgentRef === 'string' && rawTargetAgentRef.length > 0
          ? rawTargetAgentRef
          : null;
      return { kind: ActionKind.Emote, emoteDescription, targetAgentRef };
    }
    case ActionKind.Search: {
      const rawQuery = input.targetRef;
      const query = typeof rawQuery === 'string' ? rawQuery : '';
      return { kind: ActionKind.Search, query };
    }
    case ActionKind.Equip:
    case ActionKind.Unequip: {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: InvalidKind };
      const rawManner = input.emoteDescription;
      const manner =
        typeof rawManner === 'string' && rawManner.length > 0
          ? rawManner
          : kind === ActionKind.Equip
            ? 'put on'
            : 'take off';
      return kind === ActionKind.Equip
        ? { kind: ActionKind.Equip, itemRef, manner }
        : { kind: ActionKind.Unequip, itemRef, manner };
    }
    case UnknownKind: {
      const reason = input.reason;
      if (typeof reason !== 'string') return { kind: InvalidKind };
      return { kind: UnknownKind, reason };
    }
    case ImpossibleKind: {
      const reason = input.reason;
      if (typeof reason !== 'string' || reason.length === 0) return { kind: InvalidKind };
      return { kind: ImpossibleKind, reason };
    }
  }
}
