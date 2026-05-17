import type { LoreContext } from '@core/domain/builder-types';
import type { Exit, Location } from '@core/domain/entities';
import { log } from '@core/log';
import type { LanguageModel } from './language-model';

const SYSTEM_PROMPT_LINES: readonly string[] = [
  'You are the narrator of a fantasy text adventure.',
  'The player peers through or past an exit.',
  'In one or two sentences, describe what they can perceive — sights, sounds, atmosphere drifting through.',
  'Present tense. Second person ("You see...", "Through the doorway you glimpse...").',
  "Do not invent people, events, or information not grounded in the location's description.",
  'Be evocative but concise.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_LINES.join('\n');

function buildUserPrompt(exit: Exit, destination: Location, lore: LoreContext | null): string {
  const lines: string[] = [
    `Exit: ${exit.label}, leading ${exit.direction}`,
    `Destination: ${destination.label}`,
  ];
  if (destination.shortDescription) lines.push(`Description: ${destination.shortDescription}`);
  if (destination.longDescription) lines.push(`Detail: ${destination.longDescription}`);
  if (lore) {
    const entries = Object.entries(lore.tagDescriptions);
    if (entries.length > 0) {
      lines.push('', 'Lore context:');
      for (const [tag, desc] of entries) lines.push(`  ${tag}: ${desc}`);
    }
  }
  return lines.join('\n');
}

export async function peekExit(
  exit: Exit,
  destination: Location,
  lore: LoreContext | null,
  llm: LanguageModel,
): Promise<string | null> {
  try {
    const prose = await llm.completeText({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(exit, destination, lore),
    });
    const trimmed = prose.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    log.warn(`[peek-exit] LLM error: ${String(err)}`);
    return null;
  }
}
