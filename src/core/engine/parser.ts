import type { Action, ParseError } from '@core/domain/actions';
import type { Agent, Exit, Item } from '@core/domain/entities';
import type { AgentId } from '@core/domain/ids';
import { ActionKind, Direction, ExaminableKind, ParseErrorKind } from '@core/domain/kinds';
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
  let toks = tokens(text);
  if (toks.length === 0) return { kind: ParseErrorKind.Empty };

  // First-person leading "I" — NPCs phrase intents like `I say "..." to Paff`.
  // Drop it when there's a real verb behind it. A bare "i" stays = inventory.
  if (toks.length > 1 && toks[0] === 'i') {
    toks = toks.slice(1);
  }

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
      if (rest.length === 0) {
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Room },
        };
      }
      const ref = rest.join(' ');
      // Try item, then agent, then exit. Items are by far the most common
      // look target, so try them first to minimise resolver work.
      const itemR = resolveItem(ref, [...view.items, ...inventory]);
      if (itemR.ok) {
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Item, id: itemR.item.id },
        };
      }
      const agentR = resolveAgent(ref, view.agents);
      if (agentR.ok) {
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Agent, id: agentR.agent.id },
        };
      }
      const exitR = resolveExit(ref, view.exits);
      if (exitR.ok) {
        return {
          kind: ActionKind.Look,
          actorId: actor.id,
          target: { kind: ExaminableKind.Exit, id: exitR.exit.id },
        };
      }
      // None matched — return the standard no_such_target error
      // (the item resolver's error preserves the player's ref verbatim).
      return itemR.error;
    }

    case 'take':
    case 'get':
    case 'pick': {
      const rest = stripStopWords(toks.slice(1).filter((t) => t !== 'up'));
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: 'take' };
      const ref = rest.join(' ');
      const r = resolveItem(ref, view.items);
      if (r.ok) return { kind: ActionKind.Take, actorId: actor.id, itemId: r.item.id };
      // Not in the room — but if it's something the actor is already
      // carrying, give a more useful error than "you don't see one here".
      const carried = resolveItem(ref, inventory);
      if (carried.ok) {
        return { kind: ParseErrorKind.AlreadyCarried, ref, label: carried.item.label };
      }
      return r.error;
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
      // Recover the original-cased remainder after "say" from `text` (the
      // tokens array has been lowercased). Honour the leading-"I" strip that
      // happens at the top of `parse` — drop a leading "I " from `text` too
      // so utterances like `I say "hi" to Paff` don't keep the "I say" prefix.
      const detoked = text.replace(/^\s*i\s+/i, '');
      // Match "say" with optional trailing whitespace+rest, so a bare "say"
      // produces an empty afterSay (→ missing_argument), not the literal "say".
      const afterSay = detoked.replace(/^say\b\s*/i, '').trim();
      if (afterSay.length === 0) {
        return { kind: ParseErrorKind.MissingArgument, verb: 'say' };
      }

      // Try to detect a trailing "to <agent>" clause first. The utterance is
      // everything before it; the target is whatever follows.
      let utterance = afterSay;
      let explicitTargetRef: string | null = null;
      const toMatch = afterSay.match(/^(.*?)\s+to\s+([^,]+?)\.?\s*$/i);
      if (toMatch?.[1] && toMatch[2]) {
        utterance = toMatch[1].trim();
        explicitTargetRef = toMatch[2].trim();
      }

      // Strip surrounding quotes from the utterance if the speaker quoted it.
      utterance = utterance.replace(/^["'](.*)["']\.?$/s, '$1').trim();
      if (utterance.length === 0) {
        return { kind: ParseErrorKind.MissingArgument, verb: 'say' };
      }

      // Resolve the target: explicit "to <agent>" wins; otherwise implicit
      // (only one other agent in the room) wins; otherwise ambiguous.
      if (explicitTargetRef) {
        const r = resolveAgent(explicitTargetRef, view.agents);
        if (!r.ok) return r.error;
        return {
          kind: ActionKind.Speak,
          actorId: actor.id,
          targetAgentId: r.agent.id,
          utterance,
        };
      }
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
        utterance,
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

    case 'emote':
    case 'gesture': {
      // "emote <description>" or "emote at <agent> <description>" or
      // "emote <agent>, <description>". Description is short free-text — we
      // recover the original-cased remainder so casing is preserved.
      const original = text.trim();
      // Honour the leading-"I" strip already applied to `toks`. Mirror it on
      // the original-cased text so `I emote wave` -> remainder `wave`.
      const detoked = original.replace(/^\s*i\s+/i, '');
      const afterVerb = detoked.replace(/^(emote|gesture)\b\s*/i, '').trim();
      if (afterVerb.length === 0) {
        return { kind: ParseErrorKind.MissingArgument, verb: first };
      }
      // "emote at <agent> <description>" — strip leading "at " and try to
      // consume the longest agent-name prefix.
      let remainder = afterVerb;
      let hadExplicitAt = false;
      if (/^at\s+/i.test(remainder)) {
        remainder = remainder.replace(/^at\s+/i, '');
        hadExplicitAt = true;
      }

      let targetAgentId: AgentId | null = null;
      let description = remainder;

      // Trailing "at <agent>" clause: "emote wave at spark" → desc="wave", target=spark.
      // Only when there's no leading "at " (already handled above) and no comma.
      const commaIdxEarly = remainder.indexOf(',');
      if (!hadExplicitAt && commaIdxEarly < 0) {
        const lower = remainder.toLowerCase();
        // Find the longest agent-name suffix preceded by " at ".
        const matched = [...view.agents]
          .map((a) => a.label.toLowerCase())
          .filter((label) => lower.endsWith(` at ${label}`))
          .sort((a, b) => b.length - a.length)[0];
        if (matched) {
          const cutoff = remainder.length - matched.length - ' at '.length;
          const desc = remainder.slice(0, cutoff).trim();
          const targetRef = remainder.slice(cutoff + ' at '.length).trim();
          const r = resolveAgent(targetRef, view.agents);
          if (!r.ok) return r.error;
          targetAgentId = r.agent.id;
          description = desc;
          // Skip the comma/at-prefix branches below.
          description = description.replace(/^["'](.*)["']\.?$/s, '$1').trim();
          description = description.replace(/\.$/, '').trim();
          if (description.length === 0) {
            return { kind: ParseErrorKind.MissingArgument, verb: first };
          }
          return {
            kind: ActionKind.Emote,
            actorId: actor.id,
            description,
            targetAgentId,
          };
        }
      }

      const commaIdx = remainder.indexOf(',');
      if (commaIdx >= 0) {
        // "emote <agent>, <description>"
        const targetRef = remainder.slice(0, commaIdx).trim();
        const desc = remainder.slice(commaIdx + 1).trim();
        if (targetRef.length > 0) {
          const r = resolveAgent(targetRef, view.agents);
          if (!r.ok) return r.error;
          targetAgentId = r.agent.id;
          description = desc;
        }
      } else if (hadExplicitAt) {
        // "emote at <agent> <description>" — consume the longest agent-name
        // prefix from the remainder.
        const lower = remainder.toLowerCase();
        const matched = [...view.agents]
          .map((a) => a.label.toLowerCase())
          .filter((label) => lower.startsWith(label))
          .sort((a, b) => b.length - a.length)[0];
        if (matched) {
          const targetRef = remainder.slice(0, matched.length).trim();
          const r = resolveAgent(targetRef, view.agents);
          if (!r.ok) return r.error;
          targetAgentId = r.agent.id;
          description = remainder.slice(matched.length).trim();
        } else {
          // "at" was given but no agent matched: try first word as ref.
          const parts = remainder.split(/\s+/);
          const targetRef = parts[0] ?? '';
          if (targetRef.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };
          const r = resolveAgent(targetRef, view.agents);
          if (!r.ok) return r.error;
          targetAgentId = r.agent.id;
          description = parts.slice(1).join(' ').trim();
        }
      }

      // Strip surrounding quotes from the description if present.
      description = description.replace(/^["'](.*)["']\.?$/s, '$1').trim();
      // Trim a trailing period for cleaner storage.
      description = description.replace(/\.$/, '').trim();
      if (description.length === 0) {
        return { kind: ParseErrorKind.MissingArgument, verb: first };
      }
      return {
        kind: ActionKind.Emote,
        actorId: actor.id,
        description,
        targetAgentId,
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
 * Resolve a noun reference against a candidate set of exits.
 *
 * Matches against the exit's `label` first, then its `direction` (so
 * "look at north" works just as "look at the back door" does). Same
 * exact-then-prefix-then-substring strategy as the other resolvers.
 */
export function resolveExit(
  ref: string,
  candidates: readonly Exit[],
): { ok: true; exit: Exit } | { ok: false; error: ParseError } {
  const needle = ref.toLowerCase();
  // Try by label first, then by direction. Each pass uses the same
  // exact -> prefix -> substring escalation as resolveItem/resolveAgent.
  const tryWith = (key: (e: Exit) => string): Exit | 'ambiguous' | null => {
    const exact = candidates.filter((c) => key(c).toLowerCase() === needle);
    if (exact.length === 1) return exact[0] ?? null;
    if (exact.length > 1) return 'ambiguous';
    const prefix = candidates.filter((c) => key(c).toLowerCase().startsWith(needle));
    if (prefix.length === 1) return prefix[0] ?? null;
    if (prefix.length > 1) return 'ambiguous';
    const contains = candidates.filter((c) => key(c).toLowerCase().includes(needle));
    if (contains.length === 1) return contains[0] ?? null;
    if (contains.length > 1) return 'ambiguous';
    return null;
  };

  const byLabel = tryWith((e) => e.label);
  if (byLabel === 'ambiguous') {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: candidates
          .filter((c) => c.label.toLowerCase().includes(needle))
          .map((c) => c.label),
      },
    };
  }
  if (byLabel) return { ok: true, exit: byLabel };

  const byDir = tryWith((e) => e.direction);
  if (byDir === 'ambiguous') {
    return {
      ok: false,
      error: {
        kind: ParseErrorKind.AmbiguousTarget,
        ref,
        candidates: candidates
          .filter((c) => c.direction.toLowerCase().includes(needle))
          .map((c) => c.direction),
      },
    };
  }
  if (byDir) return { ok: true, exit: byDir };

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
