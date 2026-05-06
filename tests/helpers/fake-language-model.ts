import type {
  LanguageModel,
  LanguageModelRequest,
  LanguageModelResponse,
} from '@core/engine/language-model';

export interface FakeLanguageModelOptions {
  readonly responder: (
    req: LanguageModelRequest,
  ) => LanguageModelResponse | Promise<LanguageModelResponse>;
}

export interface FakeLanguageModel extends LanguageModel {
  readonly calls: readonly LanguageModelRequest[];
}

export function makeFakeLanguageModel(opts: FakeLanguageModelOptions): FakeLanguageModel {
  const calls: LanguageModelRequest[] = [];
  return {
    calls,
    async complete(req) {
      calls.push(req);
      return await opts.responder(req);
    },
  };
}
