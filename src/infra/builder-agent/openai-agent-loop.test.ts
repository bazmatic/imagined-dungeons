import { createWorld } from '@core/builder/index';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import type OpenAI from 'openai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  BuilderAgentStopReason,
  type ChatCompleter,
  runBuilderAgentLoop,
} from './openai-agent-loop';

describe('runBuilderAgentLoop', () => {
  let repo: MemoryBuilderRepository;
  let pinnedWorldId: string;

  beforeEach(async () => {
    repo = new MemoryBuilderRepository();
    const created = await createWorld(repo, {
      displayName: 'Agent test world',
      label: 'agent-test',
    });
    if (!created.ok) {
      throw new Error('createWorld failed in beforeEach');
    }
    pinnedWorldId = created.value;
  });

  it('happy path: one get_world tool call then assistant text', async () => {
    const toolCallId = 'call_get_world_1';
    const first = {
      id: 'cmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-test',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: toolCallId,
                type: 'function' as const,
                function: {
                  name: 'get_world',
                  arguments: JSON.stringify({ id: pinnedWorldId }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls' as const,
        },
      ],
    } as OpenAI.Chat.ChatCompletion;
    const second = {
      id: 'cmpl-2',
      object: 'chat.completion',
      created: 2,
      model: 'gpt-test',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Done.',
            refusal: null,
          },
          finish_reason: 'stop' as const,
        },
      ],
    } as OpenAI.Chat.ChatCompletion;

    const completionQueue: OpenAI.Chat.ChatCompletion[] = [first, second];
    const callChat: ChatCompleter = async () => {
      const next = completionQueue.shift();
      if (!next) {
        throw new Error('callChat: no more stubbed completions');
      }
      return next;
    };

    const out = await runBuilderAgentLoop({
      repo,
      pinnedWorldId,
      model: 'gpt-test',
      maxToolSteps: 10,
      userPrompt: 'Fetch the world',
      systemPrompt: 'You are a test agent.',
      callChat,
    });

    expect(out.stopReason).toBe(BuilderAgentStopReason.Completed);
    expect(out.steps.length).toBe(1);
    expect(out.steps[0]?.ok).toBe(true);
    expect(out.steps[0]?.toolName).toBe('get_world');
    expect(out.assistantSummary).toBe('Done.');
    expect(out.errorMessage).toBeNull();
    expect(out.steps[0]?.resultPreview).toMatch(/"ok"\s*:\s*true/);
    expect(completionQueue).toHaveLength(0);
  });

  it('scope error when get_world targets a different id', async () => {
    const first = {
      id: 'cmpl-scope',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-test',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: 'call_bad',
                type: 'function' as const,
                function: {
                  name: 'get_world',
                  arguments: JSON.stringify({ id: 'wrong-id' }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls' as const,
        },
      ],
    } as OpenAI.Chat.ChatCompletion;

    const callChat: ChatCompleter = async () => first;

    const out = await runBuilderAgentLoop({
      repo,
      pinnedWorldId,
      model: 'gpt-test',
      maxToolSteps: 10,
      userPrompt: 'x',
      systemPrompt: 'y',
      callChat,
    });

    expect(out.stopReason).toBe(BuilderAgentStopReason.ScopeError);
    expect(out.steps.length).toBe(1);
    expect(out.steps[0]?.ok).toBe(false);
  });

  it('maxSteps 1 with two tool_calls: runs first only, then MaxSteps', async () => {
    const first = {
      id: 'cmpl-max',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-test',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: 'call_a',
                type: 'function' as const,
                function: {
                  name: 'get_world',
                  arguments: JSON.stringify({ id: pinnedWorldId }),
                },
              },
              {
                id: 'call_b',
                type: 'function' as const,
                function: {
                  name: 'get_world',
                  arguments: JSON.stringify({ id: pinnedWorldId }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls' as const,
        },
      ],
    } as OpenAI.Chat.ChatCompletion;

    const callChat: ChatCompleter = async () => first;

    const out = await runBuilderAgentLoop({
      repo,
      pinnedWorldId,
      model: 'gpt-test',
      maxToolSteps: 1,
      userPrompt: 'x',
      systemPrompt: 'y',
      callChat,
    });

    expect(out.stopReason).toBe(BuilderAgentStopReason.MaxSteps);
    expect(out.steps.length).toBe(1);
    expect(out.steps[0]?.ok).toBe(true);
  });
});
