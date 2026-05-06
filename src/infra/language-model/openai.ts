import type {
  LanguageModel,
  LanguageModelRequest,
  LanguageModelResponse,
} from '@core/engine/language-model';
import OpenAI from 'openai';

export interface OpenAIConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

function readConfig(): OpenAIConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.length === 0) return null;
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL;
  return baseUrl && baseUrl.length > 0 ? { apiKey, model, baseUrl } : { apiKey, model };
}

async function attemptText(
  client: OpenAI,
  model: string,
  req: { system: string; user: string },
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
  });
  return completion.choices[0]?.message?.content ?? '';
}

async function attempt(
  client: OpenAI,
  model: string,
  req: LanguageModelRequest,
): Promise<LanguageModelResponse> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: req.schemaName,
        schema: req.schema as Record<string, unknown>,
        strict: true,
      },
    },
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed: unknown = JSON.parse(raw);
  return { raw, parsed };
}

export function makeOpenAILanguageModel(): LanguageModel | null {
  const cfg = readConfig();
  if (!cfg) {
    console.info('[llm] OPENAI_API_KEY not set — LLM fallback disabled (rule-based parser only).');
    return null;
  }
  const where = cfg.baseUrl ? ` via ${cfg.baseUrl}` : '';
  console.info(`[llm] enabled: model=${cfg.model}${where}`);
  const client = new OpenAI(
    cfg.baseUrl ? { apiKey: cfg.apiKey, baseURL: cfg.baseUrl } : { apiKey: cfg.apiKey },
  );
  return {
    async complete(req) {
      try {
        return await attempt(client, cfg.model, req);
      } catch (firstError) {
        try {
          return await attempt(client, cfg.model, req);
        } catch {
          throw firstError;
        }
      }
    },
    async completeText(req) {
      try {
        return await attemptText(client, cfg.model, req);
      } catch (firstError) {
        try {
          return await attemptText(client, cfg.model, req);
        } catch {
          throw firstError;
        }
      }
    },
  };
}
