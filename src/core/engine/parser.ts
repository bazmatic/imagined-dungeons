import type { Action, ParseError } from '@core/domain/actions';
import type { Agent, Direction, Item } from '@core/domain/entities';
import type { PerceptionView } from './perception';

const DIRECTION_ALIASES: Readonly<Record<string, Direction>> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
  u: 'up',
  d: 'down',
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
  northeast: 'northeast',
  northwest: 'northwest',
  southeast: 'southeast',
  southwest: 'southwest',
  up: 'up',
  down: 'down',
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
  if (toks.length === 0) return { kind: 'empty' };

  const first = toks[0];
  if (!first) return { kind: 'empty' };

  // Bare direction → move
  const bareDir = resolveDirection(first);
  if (bareDir && toks.length === 1) {
    return { kind: 'move', actorId: actor.id, direction: bareDir };
  }

  switch (first) {
    case 'go':
    case 'move': {
      if (toks.length < 2) return { kind: 'missing_argument', verb: first };
      const raw = toks.slice(1).join(' ');
      const second = toks[1];
      const dir = second ? resolveDirection(second) : null;
      if (!dir) return { kind: 'unknown_direction', raw };
      return { kind: 'move', actorId: actor.id, direction: dir };
    }

    case 'look':
    case 'l': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: 'look', actorId: actor.id, targetItemId: null };
      const ref = rest.join(' ');
      const r = resolveItem(ref, [...view.items, ...inventory]);
      if (!r.ok) return r.error;
      return { kind: 'look', actorId: actor.id, targetItemId: r.item.id };
    }

    case 'take':
    case 'get':
    case 'pick': {
      const rest = stripStopWords(toks.slice(1).filter((t) => t !== 'up'));
      if (rest.length === 0) return { kind: 'missing_argument', verb: 'take' };
      const ref = rest.join(' ');
      const r = resolveItem(ref, view.items);
      if (!r.ok) return r.error;
      return { kind: 'take', actorId: actor.id, itemId: r.item.id };
    }

    case 'drop': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: 'missing_argument', verb: 'drop' };
      const ref = rest.join(' ');
      const r = resolveItem(ref, inventory);
      if (!r.ok) return r.error;
      return { kind: 'drop', actorId: actor.id, itemId: r.item.id };
    }

    case 'inventory':
    case 'i':
    case 'inv':
      return { kind: 'inventory', actorId: actor.id };
  }

  if (bareDir) {
    return { kind: 'unknown_direction', raw: toks.join(' ') };
  }

  return { kind: 'unknown_verb', verb: first };
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
      error: { kind: 'ambiguous_target', ref, candidates: exact.map((c) => c.label) },
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
      error: { kind: 'ambiguous_target', ref, candidates: prefix.map((c) => c.label) },
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
      error: { kind: 'ambiguous_target', ref, candidates: contains.map((c) => c.label) },
    };
  }
  return { ok: false, error: { kind: 'no_such_target', ref } };
}
