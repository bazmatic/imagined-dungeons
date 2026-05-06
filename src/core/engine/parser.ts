import type { Action, ParseError } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import { ActionKind, Direction, ParseErrorKind } from '@core/domain/kinds';
import type { PerceptionView } from './perception';

const DIRECTION_ALIASES: Readonly<Record<string, Direction>> = {
  n: Direction.North,
  s: Direction.South,
  e: Direction.East,
  w: Direction.West,
  ne: Direction.Northeast,
  nw: Direction.Northwest,
  se: Direction.Southeast,
  sw: Direction.Southwest,
  u: Direction.Up,
  d: Direction.Down,
  north: Direction.North,
  south: Direction.South,
  east: Direction.East,
  west: Direction.West,
  northeast: Direction.Northeast,
  northwest: Direction.Northwest,
  southeast: Direction.Southeast,
  southwest: Direction.Southwest,
  up: Direction.Up,
  down: Direction.Down,
};

const STOP_WORDS = new Set(['the', 'a', 'an', 'at', 'to', 'on']);

export type ParseResult = Action | ParseError;

const tokens = (s: string): string[] => s.trim().toLowerCase().split(/\s+/).filter(Boolean);

const stripStopWords = (toks: string[]): string[] => toks.filter((t) => !STOP_WORDS.has(t));

const resolveDirection = (raw: string): Direction | null => DIRECTION_ALIASES[raw] ?? null;

export function parse(
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
): ParseResult {
  const toks = tokens(text);
  if (toks.length === 0) return { kind: ParseErrorKind.Empty };

  const first = toks[0];
  if (!first) return { kind: ParseErrorKind.Empty };

  // Bare direction → move
  const bareDir = resolveDirection(first);
  if (bareDir && toks.length === 1) {
    return { kind: ActionKind.Move, actorId: actor.id, direction: bareDir };
  }

  switch (first) {
    case 'go':
    case 'move': {
      if (toks.length < 2) return { kind: ParseErrorKind.MissingArgument, verb: first };
      const raw = toks.slice(1).join(' ');
      const second = toks[1];
      const dir = second ? resolveDirection(second) : null;
      if (!dir) return { kind: ParseErrorKind.UnknownDirection, raw };
      return { kind: ActionKind.Move, actorId: actor.id, direction: dir };
    }

    case 'look':
    case 'l': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0)
        return { kind: ActionKind.Look, actorId: actor.id, targetItemId: null };
      const ref = rest.join(' ');
      const r = resolveItem(ref, [...view.items, ...inventory]);
      if (!r.ok) return r.error;
      return { kind: ActionKind.Look, actorId: actor.id, targetItemId: r.item.id };
    }

    case 'take':
    case 'get':
    case 'pick': {
      const rest = stripStopWords(toks.slice(1).filter((t) => t !== 'up'));
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: 'take' };
      const ref = rest.join(' ');
      const r = resolveItem(ref, view.items);
      if (!r.ok) return r.error;
      return { kind: ActionKind.Take, actorId: actor.id, itemId: r.item.id };
    }

    case 'drop': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: 'drop' };
      const ref = rest.join(' ');
      const r = resolveItem(ref, inventory);
      if (!r.ok) return r.error;
      return { kind: ActionKind.Drop, actorId: actor.id, itemId: r.item.id };
    }

    case 'inventory':
    case 'i':
    case 'inv':
      return { kind: ActionKind.Inventory, actorId: actor.id };

    case 'say': {
      // "say <utterance>" — utterance is everything after "say".
      // Optional implicit target: only one other agent in the room.
      const rest = toks.slice(1).join(' ').trim();
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: 'say' };
      // No comma form: target is the (sole) other agent in the room, if exactly one.
      if (view.agents.length === 0) {
        return { kind: ParseErrorKind.NoSuchTarget, ref: '' };
      }
      if (view.agents.length > 1) {
        return {
          kind: ParseErrorKind.AmbiguousTarget,
          ref: '',
          candidates: view.agents.map((a) => a.label),
        };
      }
      const target = view.agents[0];
      if (!target) return { kind: ParseErrorKind.NoSuchTarget, ref: '' };
      return {
        kind: ActionKind.Speak,
        actorId: actor.id,
        targetAgentId: target.id,
        utterance: text.trim().replace(/^say\s+/i, ''),
      };
    }

    case 'tell':
    case 'speak':
    case 'talk': {
      // "tell <agent>, <utterance>"  or  "tell <agent> <utterance>"
      // "speak to <agent>, <utterance>"  or  "talk to <agent>, <utterance>"
      // Strip leading "to" after the verb (it's a stop-word but we keep it
      // explicit here to also strip when prefixed e.g. "speak to spark, hi").
      const original = text.trim();
      // Find the original-cased remainder after the first whitespace.
      const afterVerb = original.replace(/^\S+\s*/, '').replace(/^to\s+/i, '');
      if (afterVerb.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };

      // Split on the first comma; everything before is target ref, after is utterance.
      const commaIdx = afterVerb.indexOf(',');
      let targetRef: string;
      let utterance: string;
      if (commaIdx >= 0) {
        targetRef = afterVerb.slice(0, commaIdx).trim();
        utterance = afterVerb.slice(commaIdx + 1).trim();
      } else {
        // No comma: try to consume the longest agent-name prefix from the
        // remainder, then treat the rest as the utterance. Fall back to first
        // word as target if nothing matches.
        const lower = afterVerb.toLowerCase();
        const matched = [...view.agents]
          .map((a) => a.label.toLowerCase())
          .filter((label) => lower.startsWith(label))
          .sort((a, b) => b.length - a.length)[0];
        if (matched) {
          targetRef = afterVerb.slice(0, matched.length).trim();
          utterance = afterVerb.slice(matched.length).trim();
        } else {
          const parts = afterVerb.split(/\s+/);
          targetRef = parts[0] ?? '';
          utterance = parts.slice(1).join(' ').trim();
        }
      }

      if (targetRef.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };
      const r = resolveAgent(targetRef, view.agents);
      if (!r.ok) return r.error;
      if (utterance.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };
      return {
        kind: ActionKind.Speak,
        actorId: actor.id,
        targetAgentId: r.agent.id,
        utterance,
      };
    }

    case 'attack':
    case 'kill':
    case 'fight': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };
      const ref = rest.join(' ');
      const r = resolveAgent(ref, view.agents);
      if (!r.ok) return r.error;
      return { kind: ActionKind.Attack, actorId: actor.id, targetAgentId: r.agent.id };
    }
  }

  if (bareDir) {
    return { kind: ParseErrorKind.UnknownDirection, raw: toks.join(' ') };
  }

  return { kind: ParseErrorKind.UnknownVerb, verb: first };
}

/**
 * Resolve a noun reference against a candidate set.
 * Exact label match wins; otherwise prefix; otherwise substring.
 * Ambiguous → ambiguous_target.
 */
export function resolveItem(
  ref: string,
  candidates: readonly Item[],
): { ok: true; item: Item } | { ok: false; error: ParseError } {
  const needle = ref.toLowerCase();
  const exact = candidates.filter((c) => c.label.toLowerCase() === needle);
  if (exact.length === 1) {
    const item = exact[0];
    if (item) return { ok: true, item };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: exact.map((c) => c.label),
      },
    };
  }
  const prefix = candidates.filter((c) => c.label.toLowerCase().startsWith(needle));
  if (prefix.length === 1) {
    const item = prefix[0];
    if (item) return { ok: true, item };
  }
  if (prefix.length > 1) {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: prefix.map((c) => c.label),
      },
    };
  }
  const contains = candidates.filter((c) => c.label.toLowerCase().includes(needle));
  if (contains.length === 1) {
    const item = contains[0];
    if (item) return { ok: true, item };
  }
  if (contains.length > 1) {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: contains.map((c) => c.label),
      },
    };
  }
  return { ok: false, error: { kind: ParseErrorKind.NoSuchTarget, ref } };
}

/**
 * Resolve a noun reference against a candidate set of agents.
 * Same exact-then-prefix-then-substring strategy as resolveItem.
 */
export function resolveAgent(
  ref: string,
  candidates: readonly Agent[],
): { ok: true; agent: Agent } | { ok: false; error: ParseError } {
  const needle = ref.toLowerCase();
  const exact = candidates.filter((c) => c.label.toLowerCase() === needle);
  if (exact.length === 1) {
    const agent = exact[0];
    if (agent) return { ok: true, agent };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: exact.map((c) => c.label),
      },
    };
  }
  const prefix = candidates.filter((c) => c.label.toLowerCase().startsWith(needle));
  if (prefix.length === 1) {
    const agent = prefix[0];
    if (agent) return { ok: true, agent };
  }
  if (prefix.length > 1) {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: prefix.map((c) => c.label),
      },
    };
  }
  const contains = candidates.filter((c) => c.label.toLowerCase().includes(needle));
  if (contains.length === 1) {
    const agent = contains[0];
    if (agent) return { ok: true, agent };
  }
  if (contains.length > 1) {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: contains.map((c) => c.label),
      },
    };
  }
  return { ok: false, error: { kind: ParseErrorKind.NoSuchTarget, ref } };
}
