import type {
  LanguageModel,
  LanguageModelRequest,
  LanguageModelResponse,
  LanguageModelTextRequest,
} from '@core/engine/language-model';

export interface FakeLanguageModelOptions {
  readonly responder?: (
    req: LanguageModelRequest,
  ) => LanguageModelResponse | Promise<LanguageModelResponse>;
  readonly textResponder?: (req: LanguageModelTextRequest) => string | Promise<string>;
}

export interface FakeLanguageModel extends LanguageModel {
  readonly calls: readonly LanguageModelRequest[];
  readonly textCalls: readonly LanguageModelTextRequest[];
}

export function makeFakeLanguageModel(opts: FakeLanguageModelOptions = {}): FakeLanguageModel {
  const calls: LanguageModelRequest[] = [];
  const textCalls: LanguageModelTextRequest[] = [];
  return {
    calls,
    textCalls,
    async complete(req) {
      calls.push(req);
      if (!opts.responder) throw new Error('FakeLanguageModel: no responder configured');
      return await opts.responder(req);
    },
    async completeText(req) {
      textCalls.push(req);
      if (!opts.textResponder) throw new Error('FakeLanguageModel: no textResponder configured');
      return await opts.textResponder(req);
    },
  };
}
