import type { ParseError } from '@core/domain/actions';
import type { Agent, Direction, Item } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { AttackOutcome, ParseErrorKind } from '@core/domain/kinds';
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
    case ParseErrorKind.Empty:
      return 'Please type a command.';
    case ParseErrorKind.UnknownVerb:
      return `I don't know the verb "${err.verb}".`;
    case ParseErrorKind.MissingArgument:
      return `The verb "${err.verb}" needs something to act on.`;
    case ParseErrorKind.UnknownDirection:
      return `"${err.raw}" isn't a direction I understand.`;
    case ParseErrorKind.NoSuchTarget:
      return `You don't see any "${err.ref}" here.`;
    case ParseErrorKind.AmbiguousTarget:
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

/**
 * Mechanical templates for an *observer watching another agent* perform a
 * mechanical action. Used when an autonomous NPC takes a turn and we need to
 * tell the player what they saw.
 */
export function renderMoveObserved(actor: Agent, dir: Direction): string {
  return `${actor.label} goes ${dir}.`;
}

export function renderTakeObserved(actor: Agent, item: Item): string {
  return `${actor.label} picks up ${item.label}.`;
}

export function renderDropObserved(actor: Agent, item: Item): string {
  return `${actor.label} drops ${item.label}.`;
}

export function renderLookObserved(actor: Agent): string {
  return `${actor.label} looks around.`;
}

/**
 * Player-perspective surface for a `description_updated` event the player
 * happened to witness. Deliberately subtle — we don't reveal the new prose
 * here; the next `look` will return the freshly stored description (§6.4).
 */
export function renderDescriptionUpdatedObserved(): string {
  return '(The space around you shifts. Things are no longer quite as you remember them.)';
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
  if (event.outcome === AttackOutcome.Hit) {
    const targetSubject = observer.id === target.id ? 'You take' : `${target.label} takes`;
    return `${actorName} ${verb} ${targetName}. Hit! ${targetSubject} ${event.damageDealt} damage.`;
  }
  return `${actorName} ${verb} ${targetName}. Miss.`;
}
