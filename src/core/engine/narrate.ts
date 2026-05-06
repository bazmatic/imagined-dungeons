import type { Agent, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { AttackOutcome, EventKind } from '@core/domain/kinds';
import type { LanguageModel } from './language-model';
import { recallFor } from './memory';
import type { Repository } from './repository';
import { renderAttackMechanical, renderSpeakMechanical } from './templates';

/**
 * The Narrator role (abstract-design §10).
 *
 * Given a single narrated event and one observer, produce observer-specific
 * prose. Mechanical fallback templates are used when the LLM is unavailable
 * or errors. Plain text — the Narrator does not need structured output.
 */

const SYSTEM_PROMPT = `You are the narrator of a fantasy text adventure.
You are narrating a single event from the perspective of one specific observer.
Reply with one short paragraph, no more than 60 words, in present tense.
Do not include meta-commentary, do not address the reader, do not give the player instructions.
Stay in the fiction. Reflect the observer's perspective: the actor and target may be
the observer themselves (use "you"), or other characters (use their names).
Use the observer's mood/goal to colour the description without contradicting the bare facts of the event.`;

interface NarrateContext {
  readonly event: DomainEvent;
  readonly observer: Agent;
  readonly actor: Agent;
  readonly target: Agent;
  readonly location: Location;
}

function buildUserPrompt(ctx: NarrateContext, recentMemory: readonly string[]): string {
  const { event, observer, actor, target, location } = ctx;
  const lines: string[] = [];
  lines.push(`Observer: ${observer.label}${observer.id === actor.id ? ' (the actor)' : ''}`);
  if (observer.mood) lines.push(`Observer mood: ${observer.mood}`);
  if (observer.goal) lines.push(`Observer goal: ${observer.goal}`);
  lines.push(`Location: ${location.label}`);
  lines.push(`Actor: ${actor.label}`);
  lines.push(`Target: ${target.label}`);
  if (event.kind === EventKind.Speak) {
    lines.push('Action: speak');
    lines.push(`Utterance: "${event.utterance}"`);
  } else if (event.kind === EventKind.Attack) {
    lines.push('Action: attack');
    lines.push(`Outcome: ${event.outcome}`);
    lines.push(`Damage dealt: ${event.damageDealt}`);
    lines.push(`Target HP after: ${target.hp}`);
  }
  if (recentMemory.length > 0) {
    lines.push('');
    lines.push('Recent events the observer witnessed:');
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
    case EventKind.Look:
      return `${event.actorId} looked around`;
    case EventKind.Inventory:
      return `${event.actorId} checked inventory`;
    case EventKind.Failed:
      return `${event.actorId} attempted: ${event.attempted}`;
    case EventKind.Speak:
      return `${event.actorId} said "${event.utterance}" to ${event.targetAgentId}`;
    case EventKind.Attack:
      return `${event.actorId} attacked ${event.targetAgentId} (${event.outcome}${event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : ''})`;
  }
}

export function narrateMechanical(ctx: NarrateContext): string {
  const { event, observer, actor, target } = ctx;
  if (event.kind === EventKind.Speak) return renderSpeakMechanical(event, actor, target, observer);
  if (event.kind === EventKind.Attack)
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
  if (event.kind !== EventKind.Speak && event.kind !== EventKind.Attack) return '';
  const actor = await repo.getAgent(event.actorId);
  const target = await repo.getAgent(event.targetAgentId);
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
    console.warn(`[llm] narrator error for event ${event.id}:`, err);
    return narrateMechanical(ctx);
  }
}
