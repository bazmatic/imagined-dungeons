import type { BuilderRepository } from '@core/builder/repository';
import type OpenAI from 'openai';

import { TOOL_BY_NAME, toolsForAdminAgent } from '../../mcp/tools';
import { validatePinnedDraftToolArgs } from './world-scope';

export const BuilderAgentStopReason = {
  Completed: 'completed',
  MaxSteps: 'max_steps',
  ToolError: 'tool_error',
  ScopeError: 'scope_error',
  OpenAiError: 'openai_error',
} as const;
export type BuilderAgentStopReason =
  (typeof BuilderAgentStopReason)[keyof typeof BuilderAgentStopReason];

export type BuilderAgentStepLogEntry = {
  readonly stepIndex: number;
  readonly toolName: string;
  readonly argumentsJson: string;
  readonly resultPreview: string;
  readonly ok: boolean;
};

export type ChatCompleter = (input: {
  readonly model: string;
  readonly messages: OpenAI.Chat.ChatCompletionMessageParam[];
  readonly tools: OpenAI.Chat.ChatCompletionTool[];
}) => Promise<OpenAI.Chat.ChatCompletion>;

const DEFAULT_STEP_CEILING = 50;
const RESULT_PREVIEW_MAX_CHARS = 2000;

function truncatePreview(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resultHasOkFalse(value: unknown): boolean {
  return isRecord(value) && value.ok === false;
}

function toolFailureMessage(result: unknown): string {
  if (!isRecord(result) || result.ok !== false) {
    return 'tool returned ok: false';
  }
  const err = result.error;
  if (isRecord(err) && typeof err.message === 'string') {
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return 'tool returned ok: false';
  }
}

function buildOpenAiTools(): OpenAI.Chat.ChatCompletionTool[] {
  return toolsForAdminAgent().map(
    (t): OpenAI.Chat.ChatCompletionTool => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }),
  );
}

export async function runBuilderAgentLoop(args: {
  readonly repo: BuilderRepository;
  readonly pinnedWorldId: string;
  readonly model: string;
  readonly maxToolSteps: number;
  readonly userPrompt: string;
  readonly systemPrompt: string;
  readonly callChat: ChatCompleter;
}): Promise<{
  readonly stopReason: BuilderAgentStopReason;
  readonly steps: readonly BuilderAgentStepLogEntry[];
  readonly assistantSummary: string | null;
  readonly errorMessage: string | null;
}> {
  const maxToolSteps = Math.min(
    Math.max(1, args.maxToolSteps),
    DEFAULT_STEP_CEILING,
  );
  const openAiTools = buildOpenAiTools();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: args.userPrompt },
  ];
  const steps: BuilderAgentStepLogEntry[] = [];

  const finish = (out: {
    readonly stopReason: BuilderAgentStopReason;
    readonly assistantSummary: string | null;
    readonly errorMessage: string | null;
  }) =>
    ({
      stopReason: out.stopReason,
      steps,
      assistantSummary: out.assistantSummary,
      errorMessage: out.errorMessage,
    }) as const;

  for (;;) {
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await args.callChat({
        model: args.model,
        messages,
        tools: openAiTools,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return finish({
        stopReason: BuilderAgentStopReason.OpenAiError,
        assistantSummary: null,
        errorMessage,
      });
    }

    const choice = completion.choices[0];
    const message = choice?.message;
    if (!message) {
      return finish({
        stopReason: BuilderAgentStopReason.OpenAiError,
        assistantSummary: null,
        errorMessage: 'missing assistant message in completion',
      });
    }

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return finish({
        stopReason: BuilderAgentStopReason.Completed,
        assistantSummary: message.content ?? null,
        errorMessage: null,
      });
    }

    messages.push({
      role: 'assistant',
      content: message.content,
      refusal: message.refusal,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      if (steps.length >= maxToolSteps) {
        return finish({
          stopReason: BuilderAgentStopReason.MaxSteps,
          assistantSummary: null,
          errorMessage: null,
        });
      }

      const toolName = toolCall.function.name;
      const argumentsJson = toolCall.function.arguments ?? '';
      const stepIndex = steps.length + 1;

      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(argumentsJson) as Record<string, unknown>;
      } catch (e: unknown) {
        const errMsg = e instanceof SyntaxError ? e.message : String(e);
        steps.push({
          stepIndex,
          toolName,
          argumentsJson,
          resultPreview: '',
          ok: false,
        });
        return finish({
          stopReason: BuilderAgentStopReason.ToolError,
          assistantSummary: null,
          errorMessage: errMsg,
        });
      }

      const scope = validatePinnedDraftToolArgs(
        toolName,
        parsedArgs,
        args.pinnedWorldId,
      );
      if (!scope.ok) {
        steps.push({
          stepIndex,
          toolName,
          argumentsJson,
          resultPreview: '',
          ok: false,
        });
        return finish({
          stopReason: BuilderAgentStopReason.ScopeError,
          assistantSummary: null,
          errorMessage: scope.error,
        });
      }

      const tool = TOOL_BY_NAME[toolName];
      if (!tool) {
        steps.push({
          stepIndex,
          toolName,
          argumentsJson,
          resultPreview: '',
          ok: false,
        });
        return finish({
          stopReason: BuilderAgentStopReason.ToolError,
          assistantSummary: null,
          errorMessage: `unknown tool: ${toolName}`,
        });
      }

      const result = await tool.run(args.repo, parsedArgs);
      const contentJson = JSON.stringify(result);
      const resultPreview = truncatePreview(contentJson, RESULT_PREVIEW_MAX_CHARS);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: contentJson,
      });

      if (resultHasOkFalse(result)) {
        steps.push({
          stepIndex,
          toolName,
          argumentsJson,
          resultPreview,
          ok: false,
        });
        return finish({
          stopReason: BuilderAgentStopReason.ToolError,
          assistantSummary: null,
          errorMessage: toolFailureMessage(result),
        });
      }

      steps.push({
        stepIndex,
        toolName,
        argumentsJson,
        resultPreview,
        ok: true,
      });
    }
  }
}
