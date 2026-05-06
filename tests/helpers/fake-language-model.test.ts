import type { LanguageModelRequest, LanguageModelResponse } from '@core/engine/language-model';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from './fake-language-model';

describe('makeFakeLanguageModel', () => {
  it('records every call and forwards the responder result', async () => {
    const responder = (_req: LanguageModelRequest): LanguageModelResponse => ({
      raw: '{"kind":"inventory"}',
      parsed: { kind: 'inventory' },
    });
    const llm = makeFakeLanguageModel({ responder });
    const r = await llm.complete({
      system: 's',
      user: 'u',
      schema: { type: 'object' },
      schemaName: 'X',
    });
    expect(r.parsed).toEqual({ kind: 'inventory' });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.user).toBe('u');
  });

  it('supports an async responder and propagates thrown errors', async () => {
    const llm = makeFakeLanguageModel({
      responder: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      llm.complete({ system: '', user: '', schema: { type: 'object' }, schemaName: 'X' }),
    ).rejects.toThrow('boom');
    expect(llm.calls).toHaveLength(1);
  });
});
