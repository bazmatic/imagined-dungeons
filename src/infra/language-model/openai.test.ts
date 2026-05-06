import type { LanguageModel } from '@core/engine/language-model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { makeOpenAILanguageModel } from './openai';

function requireLLM(): LanguageModel {
  const llm = makeOpenAILanguageModel();
  if (!llm) throw new Error('expected non-null LLM');
  return llm;
}

beforeEach(() => {
  create.mockReset();
});

afterEach(() => {
  // Reflect.deleteProperty avoids both the `delete` operator (biome
  // performance/noDelete) and the string-coercion that
  // `process.env.X = undefined` performs.
  Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
  Reflect.deleteProperty(process.env, 'OPENAI_MODEL');
  Reflect.deleteProperty(process.env, 'OPENAI_BASE_URL');
});

describe('makeOpenAILanguageModel', () => {
  it('returns null when OPENAI_API_KEY is unset', () => {
    expect(makeOpenAILanguageModel()).toBeNull();
  });

  it('builds a request with the provided system, user, and json_schema', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '{"kind":"inventory"}' } }],
    });
    const llm = requireLLM();
    const r = await llm.complete({
      system: 'sys',
      user: 'usr',
      schema: { type: 'object', additionalProperties: false, required: ['kind'] },
      schemaName: 'X',
    });
    expect(r.parsed).toEqual({ kind: 'inventory' });
    expect(r.raw).toBe('{"kind":"inventory"}');
    const call = create.mock.calls[0]?.[0];
    expect(call.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(call.messages[1]).toEqual({ role: 'user', content: 'usr' });
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.json_schema.name).toBe('X');
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.model).toBe('gpt-4o-mini');
  });

  it('honours OPENAI_MODEL', async () => {
    process.env.OPENAI_API_KEY = 'k';
    process.env.OPENAI_MODEL = 'llama3.1';
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '{"kind":"inventory"}' } }],
    });
    await requireLLM().complete({
      system: 's',
      user: 'u',
      schema: { type: 'object' },
      schemaName: 'X',
    });
    expect(create.mock.calls[0]?.[0].model).toBe('llama3.1');
  });

  it('retries once on transport failure and succeeds on the second attempt', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"kind":"inventory"}' } }] });
    const r = await requireLLM().complete({
      system: 's',
      user: 'u',
      schema: { type: 'object' },
      schemaName: 'X',
    });
    expect(r.parsed).toEqual({ kind: 'inventory' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws when both attempts fail', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create.mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      requireLLM().complete({
        system: 's',
        user: 'u',
        schema: { type: 'object' },
        schemaName: 'X',
      }),
    ).rejects.toThrow('ECONNRESET');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws when the response message content is not parseable JSON (after retry)', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    await expect(
      requireLLM().complete({
        system: 's',
        user: 'u',
        schema: { type: 'object' },
        schemaName: 'X',
      }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
