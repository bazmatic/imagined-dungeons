import type { MonsterTemplate } from '@core/domain/builder-types';
import type { JsonSchema, LanguageModel } from '@core/engine/language-model';

const NAMES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    names: { type: 'array', items: { type: 'string' } },
  },
  required: ['names'],
  additionalProperties: false,
};

function numberedNames(label: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${label} ${i + 1}`);
}

export async function generateAgentNames(
  template: MonsterTemplate,
  count: number,
  llm: LanguageModel | null,
): Promise<string[]> {
  const fallback = numberedNames(template.label, count);

  if (!template.labelPrefixInstructions || !llm) return fallback;

  try {
    const resp = await llm.complete({
      system:
        'You generate unique names for fantasy NPCs. Return only the JSON object — no commentary.',
      user: JSON.stringify({
        baseLabel: template.label,
        instructions: template.labelPrefixInstructions,
        count,
      }),
      schema: NAMES_SCHEMA,
      schemaName: 'AgentNames',
    });

    const raw = (resp.parsed as { names?: unknown }).names;
    const llmNames = Array.isArray(raw)
      ? raw.filter((n): n is string => typeof n === 'string')
      : [];

    return fallback.map((fb, i) => llmNames[i] ?? fb);
  } catch {
    return fallback;
  }
}
