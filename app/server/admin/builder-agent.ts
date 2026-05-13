import 'dotenv/config';

import { getWorldTree } from '@core/builder/index';
import { WorldKind } from '@core/domain/builder-kinds';
import { asWorldId } from '@core/domain/ids';
import {
  type BuilderAgentStepLogEntry,
  type BuilderAgentStopReason,
  type ChatCompleter,
  runBuilderAgentLoop,
} from '@infra/builder-agent/openai-agent-loop';
import { createServerFn } from '@tanstack/react-start';
import OpenAI from 'openai';

import { getBuilderRepo } from './repo';

const STEP_CEILING = 50;

const OpenAiChatModelDefault = { Value: 'gpt-4o-mini' } as const;

export const RunBuilderAssistantErrorCode = {
  LlmDisabled: 'llm_disabled',
  Validation: 'validation',
  NotDraft: 'not_draft',
  Openai: 'openai',
} as const;
export type RunBuilderAssistantErrorCode =
  (typeof RunBuilderAssistantErrorCode)[keyof typeof RunBuilderAssistantErrorCode];

export type RunBuilderAssistantResponse =
  | {
      readonly ok: true;
      readonly stopReason: BuilderAgentStopReason;
      readonly steps: readonly BuilderAgentStepLogEntry[];
      readonly assistantSummary: string | null;
      /** Set when the loop stopped with an error path (tool, scope, parse, max steps, OpenAI). */
      readonly errorMessage: string | null;
    }
  | {
      readonly ok: false;
      readonly code: RunBuilderAssistantErrorCode;
      readonly message: string;
    };

function readDefaultMaxSteps(): number {
  const raw = process.env.BUILDER_AGENT_MAX_STEPS;
  if (raw === undefined || raw.length === 0) return 20;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20;
}

function isLlmConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === 'string' && key.length > 0;
}

function validateRunBuilderAssistantInput(d: unknown): {
  readonly worldId: string;
  readonly prompt: string;
  readonly maxSteps?: number;
} {
  if (typeof d !== 'object' || d === null) {
    throw new Error('Expected { worldId: string, prompt: string, maxSteps?: number }');
  }
  const o = d as Record<string, unknown>;
  if (typeof o.worldId !== 'string') {
    throw new Error('Expected worldId: string');
  }
  if (typeof o.prompt !== 'string') {
    throw new Error('Expected prompt: string');
  }
  const prompt = o.prompt.trim();
  if (prompt.length === 0) {
    throw new Error('prompt must not be empty or whitespace-only');
  }
  if (o.maxSteps === undefined) {
    return { worldId: o.worldId, prompt };
  }
  if (typeof o.maxSteps !== 'number' || !Number.isFinite(o.maxSteps)) {
    throw new Error('maxSteps must be a finite number when provided');
  }
  const n = Math.floor(o.maxSteps);
  if (n < 1) {
    throw new Error('maxSteps must be at least 1');
  }
  return { worldId: o.worldId, prompt, maxSteps: n };
}

function buildSystemPrompt(worldId: string): string {
  return [
    'You are the Imagined Dungeons world builder assistant.',
    `You must only read or modify the draft world whose id is exactly: ${worldId}.`,
    'Every tool call must use that same id in the appropriate field: use `id` where tools expect a world id as `id`, and `worldId` where tools expect `worldId`. Never target a different world.',
    'Before large edits, prefer calling get_world and validate_world to understand the current graph and catch issues early.',
    'Do not delete locations, exits, items, agents, templates, triggers, or lore unless the user clearly asked for removal.',
  ].join('\n');
}

export const getBuilderAssistantStatus = createServerFn({ method: 'GET' }).handler(async () => {
  return { llmAvailable: isLlmConfigured() } as const;
});

export const runBuilderAssistant = createServerFn({ method: 'POST' })
  .inputValidator(validateRunBuilderAssistantInput)
  .handler(async ({ data }): Promise<RunBuilderAssistantResponse> => {
    if (!isLlmConfigured()) {
      return {
        ok: false as const,
        code: RunBuilderAssistantErrorCode.LlmDisabled,
        message: 'Set OPENAI_API_KEY to use the builder assistant.',
      };
    }

    const apiKey = process.env.OPENAI_API_KEY as string;
    const model = process.env.OPENAI_MODEL ?? OpenAiChatModelDefault.Value;
    const baseURL = process.env.OPENAI_BASE_URL;
    const client = new OpenAI(
      baseURL !== undefined && baseURL.length > 0 ? { apiKey, baseURL } : { apiKey },
    );

    const repo = await getBuilderRepo();
    const tree = await getWorldTree(repo, asWorldId(data.worldId));
    if (!tree.ok) {
      return {
        ok: false as const,
        code: RunBuilderAssistantErrorCode.Validation,
        message: tree.error.message,
      };
    }
    if (tree.value.summary.kind !== WorldKind.Draft) {
      return {
        ok: false as const,
        code: RunBuilderAssistantErrorCode.NotDraft,
        message: 'The builder assistant can only run on draft worlds.',
      };
    }

    const maxToolSteps = Math.min(STEP_CEILING, data.maxSteps ?? readDefaultMaxSteps());
    const systemPrompt = buildSystemPrompt(data.worldId);

    const callChat: ChatCompleter = async ({ model: m, messages, tools }) =>
      client.chat.completions.create({
        model: m,
        messages,
        tools,
        tool_choice: 'auto',
      });

    try {
      const result = await runBuilderAgentLoop({
        repo,
        pinnedWorldId: data.worldId,
        model,
        maxToolSteps,
        userPrompt: data.prompt,
        systemPrompt,
        callChat,
      });
      return {
        ok: true as const,
        stopReason: result.stopReason,
        steps: result.steps,
        assistantSummary: result.assistantSummary,
        errorMessage: result.errorMessage,
      };
    } catch (err: unknown) {
      return {
        ok: false as const,
        code: RunBuilderAssistantErrorCode.Openai,
        message: String(err),
      };
    }
  });
