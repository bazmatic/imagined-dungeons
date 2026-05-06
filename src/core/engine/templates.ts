import type { ParseError } from '@core/domain/actions';
import type { Agent, Direction, Item } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { PerceptionView } from './perception';

const list = (items: readonly { label: string }[]): string => items.map((i) => i.label).join(', ');

export function renderLook(view: PerceptionView): string {
  const lines: string[] = [];
  lines.push(view.location.label);
  lines.push(view.location.longDescription);
  if (view.items.length > 0) lines.push(`You see: ${list(view.items)}.`);
  if (view.agents.length > 0) lines.push(`Also here: ${list(view.agents)}.`);
  if (view.exits.length > 0) {
    const parts = view.exits.map((e) => {
      const tag = e.locked ? `${e.label}, locked` : e.label;
      return `${e.direction} (${tag})`;
    });
    lines.push(`Exits: ${parts.join(', ')}.`);
  } else {
    lines.push('There are no obvious exits.');
  }
  return lines.join('\n');
}

export function renderLookTarget(item: Item): string {
  return item.longDescription;
}

export function renderMoveSelf(dir: Direction): string {
  return `You go ${dir}.`;
}

export function renderTakeSelf(item: Item): string {
  return `Taken: ${item.label}.`;
}

export function renderDropSelf(item: Item): string {
  return `Dropped: ${item.label}.`;
}

export function renderInventory(items: readonly Item[]): string {
  if (items.length === 0) return 'You are carrying nothing.';
  return `You are carrying: ${list(items)}.`;
}

export function renderParseError(err: ParseError): string {
  switch (err.kind) {
    case 'empty':
      return 'Please type a command.';
    case 'unknown_verb':
      return `I don't know the verb "${err.verb}".`;
    case 'missing_argument':
      return `The verb "${err.verb}" needs something to act on.`;
    case 'unknown_direction':
      return `"${err.raw}" isn't a direction I understand.`;
    case 'no_such_target':
      return `You don't see any "${err.ref}" here.`;
    case 'ambiguous_target':
      return `Which do you mean — ${err.candidates.join(' or ')}?`;
  }
}

export function renderActionError(reason: string): string {
  return reason;
}

/**
 * Mechanical fallback for a `speak` event from a given observer's perspective.
 * Used when no LLM is available, or when the LLM call fails.
 */
export function renderSpeakMechanical(
  event: Extract<DomainEvent, { kind: 'speak' }>,
  actor: Agent,
  target: Agent,
  observer: Agent,
): string {
  const actorName = observer.id === actor.id ? 'You' : actor.label;
  const verb = observer.id === actor.id ? 'say' : 'says';
  const targetName = observer.id === target.id ? 'you' : target.label;
  return `${actorName} ${verb} to ${targetName}: "${event.utterance}"`;
}

export function renderAttackMechanical(
  event: Extract<DomainEvent, { kind: 'attack' }>,
  actor: Agent,
  target: Agent,
  observer: Agent,
): string {
  const actorName = observer.id === actor.id ? 'You' : actor.label;
  const verb = observer.id === actor.id ? 'attack' : 'attacks';
  const targetName = observer.id === target.id ? 'you' : target.label;
  if (event.outcome === 'hit') {
    const targetSubject = observer.id === target.id ? 'You take' : `${target.label} takes`;
    return `${actorName} ${verb} ${targetName}. Hit! ${targetSubject} ${event.damageDealt} damage.`;
  }
  return `${actorName} ${verb} ${targetName}. Miss.`;
}
