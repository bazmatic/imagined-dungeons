import {
  PLAYER_ACTION_SCHEMA,
  PLAYER_ACTION_SCHEMA_NAME,
  validatePlayerAction,
} from '@core/engine/llm-output';
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import { describe, expect, it } from 'vitest';

const hasKey =
  typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0;

describe.skipIf(!hasKey)('OpenAI smoke (live, gated on OPENAI_API_KEY)', () => {
  it('maps "head south" to a valid move action', async () => {
    const llm = makeOpenAILanguageModel();
    if (!llm) throw new Error('expected non-null LLM');
    const r = await llm.complete({
      system:
        'You map player input to one of: move, look, take, drop, inventory, unknown. Return JSON matching the schema. Use unknown if uncertain.',
      user: 'Player input: "head south"\nVisible items: none\nExits: south\nInventory: empty',
      schema: PLAYER_ACTION_SCHEMA,
      schemaName: PLAYER_ACTION_SCHEMA_NAME,
    });
    const validated = validatePlayerAction(r.parsed);
    expect(['move', 'unknown']).toContain(validated.kind);
    if (validated.kind === 'move') {
      expect(validated.direction).toBe('south');
    }
  }, 30_000);

  it('maps "what am I carrying?" to an inventory action', async () => {
    const llm = makeOpenAILanguageModel();
    if (!llm) throw new Error('expected non-null LLM');
    const r = await llm.complete({
      system:
        'You map player input to one of: move, look, take, drop, inventory, unknown. Return JSON matching the schema.',
      user: 'Player input: "what am I carrying?"\nVisible items: none\nExits: none\nInventory: empty',
      schema: PLAYER_ACTION_SCHEMA,
      schemaName: PLAYER_ACTION_SCHEMA_NAME,
    });
    const validated = validatePlayerAction(r.parsed);
    expect(validated.kind).toBe('inventory');
  }, 30_000);
});
