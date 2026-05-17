import type { Agent } from '@core/domain/entities';
import { log } from '@core/log';
import type { LanguageModel } from './language-model';
import type { PerceptionView } from './perception';

const SYSTEM_PROMPT = `You are a player-character in a fantasy text adventure.
Generate a single brief opening line of dialogue that the player's character says to start a conversation.
The line should be natural and context-appropriate — a greeting, question, or observation relevant to the setting and the character being addressed.
Present tense. First person ("I" or just the words spoken).
Reply with ONLY the spoken words — no quotes, no action tags, no explanation.
Keep it short: at most 15 words.`;

function buildUserPrompt(actor: Agent, target: Agent, view: PerceptionView): string {
  const lines: string[] = [
    `Setting: ${view.location.label}`,
    `Player character: ${actor.label}`,
    `Speaking to: ${target.label}`,
  ];
  if (target.shortDescription) lines.push(`About them: ${target.shortDescription}`);
  if (target.mood) lines.push(`Their mood: ${target.mood}`);
  return lines.join('\n');
}

export async function generateOpening(
  actor: Agent,
  target: Agent,
  view: PerceptionView,
  llm: LanguageModel,
): Promise<string> {
  try {
    const result = await llm.completeText({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(actor, target, view),
    });
    const trimmed = result.trim().replace(/^["']|["']$/g, '');
    if (trimmed.length > 0) return trimmed;
  } catch (err) {
    log.warn(`[generate-opening] LLM error: ${String(err)}`);
  }
  return 'Hello.';
}
