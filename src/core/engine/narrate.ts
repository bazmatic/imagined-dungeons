import type { Agent, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { AttackOutcome, EventKind, ExaminableKind } from '@core/domain/kinds';
import { log } from '@core/log';
import type { LanguageModel } from './language-model';
import { recallFor } from './memory';
import type { Repository } from './repository';
import { renderAttackMechanical, renderEmoteMechanical, renderSpeakMechanical } from './templates';

/**
 * The Narrator role (abstract-design §10).
 *
 * Given a single narrated event and one observer, produce observer-specific
 * prose. Mechanical fallback templates are used when the LLM is unavailable
 * or errors. Plain text — the Narrator does not need structured output.
 */

const SYSTEM_PROMPT = `You are the narrator of a fantasy text adventure.
You narrate a single event from one specific observer's point of view.

Person of narration is determined strictly by who the observer is:
- If the observer IS the actor, narrate in second person ("You say...", "You swing at...").
- If the observer IS the target, narrate in second person addressed to them ("Spark says to you...").
- Otherwise, narrate in third person using names ("Paff says to Spark...").

Style:
- One short paragraph, present tense.
- speak events: at most 25 words. emote events: at most 25 words. attack events: at most 40 words.
- Stick to what the observer can plainly perceive: the words spoken, the swing, the hit or miss.
- For speak events specifically: the actor only said the words. They did NOT approach, grin, smile, wave, nod, lean in, gesture, look up, raise a hand, or otherwise move. Don't invent body language. Just narrate the speech.
- For emote events specifically: the body language IS the action. The actor performed exactly the gesture/expression in the supplied description, nothing more, nothing less. Do not invent a verbal utterance, do not invent additional motions. The supplied description is short and physical (e.g. "waves", "grins broadly", "shakes their head") — quote it as the action.
- Do not invent inner thoughts, motivations, heart-rates, blushes, hopes, smiles, or romantic subtext.
- Do not paraphrase or rewrite the spoken utterance — quote it verbatim once, exactly as supplied. The supplied utterance is already the final dialogue; do not prepend "I say" or wrap it further.
- Do not address the reader. Do not give the player advice. Stay in the fiction.
- The observer's mood/goal may colour word choice slightly; it must never contradict the facts.`;

interface NarrateContext {
  readonly event: DomainEvent;
  readonly observer: Agent;
  readonly actor: Agent;
  /** Null only for untargeted emote events. */
  readonly target: Agent | null;
  readonly location: Location;
}

function buildUserPrompt(ctx: NarrateContext, recentMemory: readonly string[]): string {
  const { event, observer, actor, target, location } = ctx;
  const observerIsActor = observer.id === actor.id;
  const observerIsTarget = target !== null && observer.id === target.id;

  const lines: string[] = [];
  if (observerIsActor) {
    lines.push(`POV: second person. The observer IS the actor. Use "you" for the actor.`);
    if (target) lines.push(`Refer to the target ("${target.label}") by name.`);
  } else if (observerIsTarget && target) {
    lines.push(`POV: second person. The observer IS the target. Use "you" for the target.`);
    lines.push(`Refer to the actor ("${actor.label}") by name.`);
  } else {
    if (target) {
      lines.push(
        `POV: third person. Refer to actor ("${actor.label}") and target ("${target.label}") by name.`,
      );
    } else {
      lines.push(`POV: third person. Refer to the actor ("${actor.label}") by name.`);
    }
  }
  lines.push('');
  lines.push(`Observer: ${observer.label}`);
  if (observer.mood) lines.push(`Observer mood: ${observer.mood}`);
  if (observer.goal) lines.push(`Observer goal: ${observer.goal}`);
  lines.push(`Location: ${location.label}`);
  lines.push('');
  if (event.kind === EventKind.Speak) {
    lines.push('Event: speak');
    lines.push('The actor said the following words verbatim — quote them once, do not paraphrase:');
    lines.push(`"${event.utterance}"`);
  } else if (event.kind === EventKind.Emote) {
    lines.push('Event: emote');
    lines.push(`The actor's gesture/expression: "${event.description}"`);
    if (target) {
      lines.push(`The emote is directed at ${target.label}.`);
    } else {
      lines.push('The emote is not directed at anyone in particular.');
    }
  } else if (event.kind === EventKind.Attack && target) {
    lines.push('Event: attack');
    lines.push(`Outcome: ${event.outcome}`);
    lines.push(`Damage dealt: ${event.damageDealt}`);
    lines.push(`Target HP after: ${target.hp}`);
  }
  if (recentMemory.length > 0) {
    lines.push('');
    lines.push('Recent events the observer witnessed (context only, do not narrate these):');
    for (const m of recentMemory) lines.push(`- ${m}`);
  }
  return lines.join('\n');
}

function summariseEvent(event: DomainEvent): string {
  switch (event.kind) {
    case EventKind.Move:
      return `${event.actorId} went ${event.direction}`;
    case EventKind.Take:
      return `${event.actorId} took ${event.itemId}`;
    case EventKind.Drop:
      return `${event.actorId} dropped ${event.itemId}`;
    case EventKind.Give:
      return `${event.actorId} gave ${event.itemId} to ${event.targetAgentId}`;
    case EventKind.Look: {
      const t = event.target;
      if (!t) return `${event.actorId} looked around`;
      switch (t.kind) {
        case ExaminableKind.Room:
          return `${event.actorId} looked around`;
        case ExaminableKind.Item:
          return `${event.actorId} examined ${t.id}`;
        case ExaminableKind.Agent:
          return `${event.actorId} looked at ${t.id}`;
        case ExaminableKind.Exit:
          return `${event.actorId} examined ${t.id}`;
        case ExaminableKind.Location:
          return `${event.actorId} examined ${t.id}`;
      }
      return `${event.actorId} looked around`;
    }
    case EventKind.Inventory:
      return `${event.actorId} checked inventory`;
    case EventKind.Failed:
      return `${event.actorId} attempted: ${event.attempted}`;
    case EventKind.Speak:
      return event.targetAgentId
        ? `${event.actorId} said "${event.utterance}" to ${event.targetAgentId}`
        : `${event.actorId} said "${event.utterance}" (to no one in particular)`;
    case EventKind.Emote:
      return event.targetAgentId
        ? `${event.actorId} ${event.description} at ${event.targetAgentId}`
        : `${event.actorId} ${event.description}`;
    case EventKind.Attack:
      return `${event.actorId} attacked ${event.targetAgentId} (${event.outcome}${event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : ''})`;
    case EventKind.DescriptionUpdated:
      return `${event.actorId} updated description (${event.target.kind})`;
    case EventKind.AgentSpawned:
      return `${event.spawnedAgentId} spawned at ${event.locationId}`;
    case EventKind.Equip:
      return `${event.actorId} ${event.manner} ${event.itemId}`;
    case EventKind.Unequip:
      return `${event.actorId} ${event.manner} ${event.itemId}`;
  }
}

export function narrateMechanical(ctx: NarrateContext): string {
  const { event, observer, actor, target } = ctx;
  if (event.kind === EventKind.Speak) return renderSpeakMechanical(event, actor, target, observer);
  if (event.kind === EventKind.Emote) return renderEmoteMechanical(event, actor, observer, target);
  if (event.kind === EventKind.Attack && target)
    return renderAttackMechanical(event, actor, target, observer);
  // Other event kinds are not narrated; this is a defensive fallthrough.
  return '';
}

export async function narrate(
  event: DomainEvent,
  observer: Agent,
  repo: Repository,
  llm: LanguageModel | null,
): Promise<string> {
  if (
    event.kind !== EventKind.Speak &&
    event.kind !== EventKind.Attack &&
    event.kind !== EventKind.Emote
  )
    return '';
  const actor = await repo.getAgent(event.actorId);
  // Emote events may not have a target. Speak/Attack always do.
  let target: Agent | null = null;
  if (event.kind === EventKind.Attack) {
    target = await repo.getAgent(event.targetAgentId);
  } else if (
    (event.kind === EventKind.Speak || event.kind === EventKind.Emote) &&
    event.targetAgentId !== null
  ) {
    target = await repo.getAgent(event.targetAgentId);
  }
  const location = await repo.getLocation(actor.locationId);
  const ctx: NarrateContext = { event, observer, actor, target, location };

  if (!llm) return narrateMechanical(ctx);

  // Per-agent memory (abstract-design §8): perception-gated, recent slice.
  const recalled = await recallFor(observer.id, repo, 3);
  const memory = recalled.map(summariseEvent);

  try {
    const prose = await llm.completeText({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(ctx, memory),
    });
    const trimmed = prose.trim();
    if (trimmed.length === 0) return narrateMechanical(ctx);
    return trimmed;
  } catch (err) {
    log.warn(`[llm] narrator error for event ${event.id}: ${String(err)}`);
    return narrateMechanical(ctx);
  }
}
