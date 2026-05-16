import type { ParseError } from '@core/domain/actions';
import type { Agent, Direction, Exit, Item } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { AttackOutcome, ParseErrorKind } from '@core/domain/kinds';
import { type Segment, SegmentKind } from '@core/domain/segments';
import type { PerceptionView } from './perception';

const list = (items: readonly { label: string }[]): string => items.map((i) => i.label).join(', ');

const labelWithPrice = (i: Item): string =>
  i.priceTag === null ? i.label : `${i.label} (${i.priceTag}gp)`;

const listInventory = (items: readonly Item[]): string => items.map(labelWithPrice).join(', ');

export function renderLook(view: PerceptionView): readonly Segment[] {
  const segs: Segment[] = [
    { kind: SegmentKind.LocationName, text: view.location.label },
    { kind: SegmentKind.LocationDescription, text: view.location.longDescription },
  ];
  if (view.items.length > 0)
    segs.push({ kind: SegmentKind.ItemList, text: `You see: ${list(view.items)}.` });
  if (view.agents.length > 0)
    segs.push({ kind: SegmentKind.CharacterList, text: `Also here: ${list(view.agents)}.` });
  if (view.exits.length > 0) {
    const parts = view.exits.map((e) => {
      const tag = e.locked ? `${e.label}, locked` : e.label;
      return `${e.direction} (${tag})`;
    });
    segs.push({ kind: SegmentKind.ExitList, text: `Exits: ${parts.join(', ')}.` });
  } else {
    segs.push({ kind: SegmentKind.NoExits, text: 'There are no obvious exits.' });
  }
  return segs;
}

export function renderLookTarget(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Narration, text: item.longDescription }];
}

/**
 * Render an agent the player has chosen to examine. Falls back from long
 * description -> short description -> a bare label sentence so the player
 * never gets an empty string back.
 *
 * Mood is intentionally surfaced ("They seem energetic"); the agent's
 * `shortTermIntent` is intentionally NOT surfaced — it is the NPC's private
 * internal plan and only informs their own next-tick prompt.
 */
export function renderLookAgent(agent: Agent): readonly Segment[] {
  const parts: string[] = [];
  const desc =
    agent.longDescription && agent.longDescription.length > 0
      ? agent.longDescription
      : agent.shortDescription && agent.shortDescription.length > 0
        ? agent.shortDescription
        : '';
  parts.push(desc.length > 0 ? desc : `You see ${agent.label}.`);
  if (agent.mood) parts.push(`They seem ${agent.mood.toLowerCase()}.`);
  if (agent.hp <= 0) parts.push('They are unconscious.');
  return [{ kind: SegmentKind.Narration, text: parts.join(' ') }];
}

/**
 * Render an exit the player has chosen to examine. Combines the exit's
 * label, the direction it leads, and its locked status into one short line.
 * Exits don't have a separate longDescription column today (see
 * burning-district-data.md), so this is the canonical examination prose.
 */
export function renderLookExit(exit: Exit): readonly Segment[] {
  const status = exit.locked ? 'It is locked.' : 'It is unobstructed.';
  return [{ kind: SegmentKind.Narration, text: `The ${exit.label} leads ${exit.direction}. ${status}` }];
}

export function renderMoveSelf(dir: Direction): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You go ${dir}.` }];
}

export function renderTakeSelf(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `Taken: ${item.label}.` }];
}

export function renderDropSelf(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `Dropped: ${item.label}.` }];
}

export function renderGiveSelf(item: Item, recipient: Agent): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You give ${item.label} to ${recipient.label}.` }];
}

export function renderGiveByActor(actor: Agent, item: Item): string {
  return `${actor.label} hands you ${item.label}.`;
}

export function renderGiveObserved(actor: Agent, item: Item, recipient: Agent): string {
  return `${actor.label} gives ${item.label} to ${recipient.label}.`;
}

export function renderEquipSelf(item: Item, manner: string): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You ${manner} the ${item.label}.` }];
}

export function renderEquipObserved(actor: Agent, item: Item, manner: string): string {
  return `${actor.label} ${manner}s the ${item.label}.`;
}

export function renderUnequipSelf(item: Item, manner: string): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You ${manner} the ${item.label}.` }];
}

export function renderUnequipObserved(actor: Agent, item: Item, manner: string): string {
  return `${actor.label} ${manner}s the ${item.label}.`;
}

export function renderOpenSelf(item: Item, contents: readonly Item[], unlocked: boolean): readonly Segment[] {
  const lead = unlocked
    ? `You unlock the ${item.label} and open it.`
    : `You open the ${item.label}.`;
  if (contents.length === 0) return [{ kind: SegmentKind.Feedback, text: `${lead} It is empty.` }];
  const names = contents.map((c) => c.label).join(', ');
  return [{ kind: SegmentKind.Feedback, text: `${lead} Inside: ${names}.` }];
}

export function renderOpenObserved(actor: Agent, item: Item): string {
  return `${actor.label} opens the ${item.label}.`;
}

export function renderCloseSelf(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You close the ${item.label}.` }];
}

export function renderCloseObserved(actor: Agent, item: Item): string {
  return `${actor.label} closes the ${item.label}.`;
}

export function renderTradeSelf(
  _buyer: Agent,
  seller: Agent,
  item: Item,
  price: number,
  accepted: boolean,
  narration: string,
): readonly Segment[] {
  // The LLM-supplied narration is the seller's voice. Surface it directly;
  // the structural fact ("you paid Ngp") is implicit in the gold update.
  if (narration.length > 0) return [{ kind: SegmentKind.Narration, text: narration }];
  return [{
    kind: SegmentKind.Narration,
    text: accepted
      ? `${seller.label} accepts ${price} gold for the ${item.label}.`
      : `${seller.label} refuses ${price} gold for the ${item.label}.`,
  }];
}

export function renderTradeObserved(
  buyer: Agent,
  seller: Agent,
  item: Item,
  price: number,
  accepted: boolean,
): string {
  return accepted
    ? `${buyer.label} buys the ${item.label} from ${seller.label} for ${price} gold.`
    : `${seller.label} refuses ${price} gold from ${buyer.label} for the ${item.label}.`;
}

export function renderOfferSelf(item: Item, price: number): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You set the price of the ${item.label} at ${price} gold.` }];
}

export function renderRevealObserved(item: Item): string {
  return `You spot ${item.label} you hadn't noticed before.`;
}

export function renderInventory(items: readonly Item[]): readonly Segment[] {
  if (items.length === 0) return [{ kind: SegmentKind.Inventory, text: 'You are carrying nothing.' }];
  const equipped = items.filter((i) => i.equipped);
  const carried = items.filter((i) => !i.equipped);
  const parts: string[] = [];
  if (carried.length > 0) parts.push(`You are carrying: ${listInventory(carried)}.`);
  if (equipped.length > 0) parts.push(`Equipped: ${listInventory(equipped)}.`);
  return [{ kind: SegmentKind.Inventory, text: parts.join(' ') }];
}

export function renderParseError(err: ParseError): readonly Segment[] {
  const text = (() => {
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
      case ParseErrorKind.AlreadyCarried:
        return `You are already carrying the ${err.label}.`;
      case ParseErrorKind.ImpossibleAction:
        return err.reason;
    }
  })();
  return [{ kind: SegmentKind.Error, text }];
}

export function renderActionError(reason: string): readonly Segment[] {
  return [{ kind: SegmentKind.Error, text: reason }];
}

/**
 * Mechanical fallback for a `speak` event from a given observer's perspective.
 * Used when no LLM is available, or when the LLM call fails.
 */
export function renderSpeakMechanical(
  event: Extract<DomainEvent, { kind: 'speak' }>,
  actor: Agent,
  target: Agent | null,
  observer: Agent,
): string {
  const actorName = observer.id === actor.id ? 'You' : actor.label;
  const verb = observer.id === actor.id ? 'say' : 'says';
  if (target === null) {
    return `${actorName} ${verb}: "${event.utterance}"`;
  }
  const targetName = observer.id === target.id ? 'you' : target.label;
  return `${actorName} ${verb} to ${targetName}: "${event.utterance}"`;
}

/**
 * Conjugate the leading verb of an emote description into its third-person
 * form for rendering by an outside observer. Stored descriptions are the base
 * verb form ("wave", "shake their head"); the helper adds an "s" to the
 * leading verb so "Spark waves" / "Spark shakes their head" reads naturally.
 *
 * Idempotent: if the leading verb already ends in "s" (e.g. "waves",
 * "kisses", "fusses", "splashes"), it is left alone. This keeps things
 * grammatically permissive — the description is short free text and the
 * helper does no full conjugation.
 */
export function thirdPersonVerb(description: string): string {
  const parts = description.split(' ');
  const verb = parts[0] ?? '';
  if (verb.length === 0 || verb.endsWith('s')) return description;
  parts[0] = `${verb}s`;
  return parts.join(' ');
}

/**
 * Mechanical fallback for an `emote` event from a given observer's perspective.
 * Used when no LLM is available, or when the LLM call fails. The description
 * is short free-text (e.g. "wave", "grin broadly", "shake their head"); we
 * render it second-person as-is for the actor and conjugate for third-person.
 */
export function renderEmoteMechanical(
  event: Extract<DomainEvent, { kind: 'emote' }>,
  actor: Agent,
  observer: Agent,
  target: Agent | null,
): string {
  if (observer.id === actor.id) {
    return `You ${event.description}.`;
  }
  const verb = thirdPersonVerb(event.description);
  if (target && observer.id === target.id) {
    return `${actor.label} ${verb} at you.`;
  }
  if (target) {
    return `${actor.label} ${verb} at ${target.label}.`;
  }
  return `${actor.label} ${verb}.`;
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
 * Player-perspective surface for an agent-targeted `description_updated`
 * event where only the agent's mood changed (no description, no intent).
 *
 * Intent-only changes are NOT witnessable; this function is not called for
 * them and the witness branching in `tick.ts` returns null instead.
 */
export function renderAgentStateUpdatedObserved(actor: Agent, moodAfter: string | null): string {
  if (moodAfter) {
    return `(${actor.label} looks ${moodAfter.toLowerCase()}.)`;
  }
  return `(${actor.label}'s expression relaxes.)`;
}

/**
 * "A goblin appears here." — third-person, observer-side narration for a
 * spawn event. The actor of the event is the synthetic system agent, so
 * the line is keyed off the spawned agent's label rather than the actor.
 */
export function renderAgentSpawnedObserved(label: string): string {
  if (label.length === 0) return 'Something appears here.';
  // Capitalise the first letter without mutating the rest (preserves
  // already-capitalised proper nouns like "Spark").
  const first = label[0];
  if (first === undefined) return 'Something appears here.';
  const rest = label.slice(1);
  const upper = first.toUpperCase();
  return `${upper}${rest} appears here.`;
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
