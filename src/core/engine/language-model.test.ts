import { describe, expect, it } from 'vitest';
import type {
  JsonSchema,
  LanguageModel,
  LanguageModelRequest,
  LanguageModelResponse,
} from './language-model';

describe('LanguageModel port', () => {
  it('is implementable as a plain object satisfying the interface', async () => {
    const schema: JsonSchema = { type: 'object', additionalProperties: false };
    const fake: LanguageModel = {
      async complete(req: LanguageModelRequest): Promise<LanguageModelResponse> {
        expect(req.system).toBeTypeOf('string');
        expect(req.user).toBeTypeOf('string');
        expect(req.schemaName).toBeTypeOf('string');
        expect(req.schema).toBeDefined();
        return { raw: '{}', parsed: {} };
      },
      async completeText(req) {
        expect(req.system).toBeTypeOf('string');
        expect(req.user).toBeTypeOf('string');
        return '';
      },
    };
    const r = await fake.complete({
      system: 's',
      user: 'u',
      schema,
      schemaName: 'X',
    });
    expect(r.raw).toBe('{}');
    expect(r.parsed).toEqual({});
  });
});
