# World Builder LLM Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draft-only “builder assistant” panel on `/admin/$worldId` that sends a user prompt to the server, runs a bounded OpenAI **tools** loop, executes the same handlers as MCP (`src/mcp/tools.ts`), and returns a step log plus optional assistant summary.

**Architecture:** Keep MCP and the admin agent on one tool registry (`ToolDef[]` + `TOOL_BY_NAME`). Exclude `list_worlds` and `create_world` from the agent surface so every call stays scoped to the pinned draft id. Add `src/infra/builder-agent/` with (1) world-scope validation helpers, (2) OpenAI chat loop with `tool_calls`, (3) vitest coverage via injectable `chatCompletion` stub. Expose a `createServerFn` POST in `app/server/admin/` that loads the tree, verifies `WorldKind.Draft`, reads env max steps + request override (capped), then runs the loop. UI: new React panel calling the server fn and `refresh()` on success like other saves.

**Tech Stack:** TypeScript strict, TanStack Start `createServerFn`, OpenAI SDK `openai` (already in `package.json`), Vitest, existing `SqliteBuilderRepository` via `getBuilderRepo()`, const objects per `CLAUDE.md` (no raw string literals in logic for new code).

**Spec:** [docs/superpowers/specs/2026-05-13-world-builder-llm-agent-design.md](../specs/2026-05-13-world-builder-llm-agent-design.md)

---

## File map (new / touched)

| Path | Role |
|------|------|
| `src/mcp/tools.ts` | Export helpers next to `TOOLS` / `TOOL_BY_NAME` (or re-export from a tiny `src/mcp/tool-registry.ts` if you split to avoid circular imports — prefer **stay in `tools.ts`** unless file size forces split). |
| `src/infra/builder-agent/world-scope.ts` | Pure: which tools use `id` vs `worldId`; `validatePinnedDraftToolArgs`. |
| `src/infra/builder-agent/world-scope.test.ts` | Unit tests for scope validation. |
| `src/mcp/agent-excluded-tools.ts` | `as const` set of MCP tool names excluded from the admin agent (`list_worlds`, `create_world`). Lives under `mcp/` so `tools.ts` does not depend on `infra/`. |
| `src/infra/builder-agent/openai-agent-loop.ts` | Core loop: messages + OpenAI tools + execute `TOOL_BY_NAME[name].run`. |
| `src/infra/builder-agent/openai-agent-loop.test.ts` | Stubbed OpenAI responses → assert `run` order and max steps. |
| `app/server/admin/builder-agent.ts` | `createServerFn` POST: validate draft, build tool list, call loop, return DTO. |
| `app/routes/admin/-components/BuilderAssistantPanel.tsx` | Prompt textarea, optional max-steps number, submit, step log, disabled when no API key (server returns structured “disabled” or client checks env — **prefer server tells** `available: boolean` from a tiny GET or from POST error). |
| `app/routes/admin/$worldId.tsx` | Render panel when `isDraft`; pass `worldId`, `onApplied: refresh`. |

---

### Task 1: Agent-excluded tool names + filtered tool list

**Files:**

- Modify: `src/mcp/tools.ts` (append exports after `TOOL_BY_NAME`)
- Create: `src/mcp/agent-excluded-tools.ts`

**Design:** MCP keeps **all** tools. The admin agent uses `TOOLS.filter((t) => !AGENT_EXCLUDED_TOOL_NAMES.has(t.name))` where `AGENT_EXCLUDED_TOOL_NAMES` is derived from a const object so names are not scattered string literals.

- [ ] **Step 1: Add `src/mcp/agent-excluded-tools.ts`**

```typescript
export const AgentExcludedTool = {
  ListWorlds: 'list_worlds',
  CreateWorld: 'create_world',
} as const;

export type AgentExcludedTool = (typeof AgentExcludedTool)[keyof typeof AgentExcludedTool];

export const AGENT_EXCLUDED_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(AgentExcludedTool),
);
```

- [ ] **Step 2: In `src/mcp/tools.ts`, import and export filtered list**

Add:

```typescript
import { AGENT_EXCLUDED_TOOL_NAMES } from './agent-excluded-tools';

export function toolsForAdminAgent(): readonly ToolDef[] {
  return TOOLS.filter((t) => !AGENT_EXCLUDED_TOOL_NAMES.has(t.name));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/agent-excluded-tools.ts src/mcp/tools.ts
git commit -m "feat(builder-agent): exclude list_worlds and create_world from admin tool surface"
```

---

### Task 2: Pinned-draft world scope validation (pure)

**Files:**

- Create: `src/infra/builder-agent/world-scope.ts`
- Create: `src/infra/builder-agent/world-scope.test.ts`

- [ ] **Step 1: Write failing tests in `world-scope.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { AgentExcludedTool } from '../../mcp/agent-excluded-tools';
import { validatePinnedDraftToolArgs } from './world-scope';

const PINNED = 'world-draft-1';

describe('validatePinnedDraftToolArgs', () => {
  it('accepts get_world when id matches', () => {
    expect(validatePinnedDraftToolArgs('get_world', { id: PINNED }, PINNED)).toEqual({ ok: true });
  });
  it('rejects get_world when id differs', () => {
    const r = validatePinnedDraftToolArgs('get_world', { id: 'other' }, PINNED);
    expect(r.ok).toBe(false);
  });
  it('accepts upsert_location when worldId matches', () => {
    expect(
      validatePinnedDraftToolArgs('upsert_location', { worldId: PINNED, id: 'loc1' }, PINNED),
    ).toEqual({ ok: true });
  });
  it('rejects upsert_location when worldId differs', () => {
    const r = validatePinnedDraftToolArgs(
      'upsert_location',
      { worldId: 'other', id: 'loc1' },
      PINNED,
    );
    expect(r.ok).toBe(false);
  });
  it('rejects excluded MCP tools by name', () => {
    expect(validatePinnedDraftToolArgs(AgentExcludedTool.CreateWorld, {}, PINNED).ok).toBe(false);
  });
});
```

Run: `pnpm exec vitest run src/infra/builder-agent/world-scope.test.ts -v`  
Expected: **FAIL** (module / function missing).

- [ ] **Step 2: Implement `world-scope.ts`**

```typescript
import { AgentExcludedTool } from '../../mcp/agent-excluded-tools';

export const WorldIdFieldTool = {
  GetWorld: 'get_world',
  ValidateWorld: 'validate_world',
  GetWorldLore: 'get_world_lore',
  UpdateWorldLore: 'update_world_lore',
} as const;
export type WorldIdFieldTool = (typeof WorldIdFieldTool)[keyof typeof WorldIdFieldTool];

const WORLD_ID_IN_ID: ReadonlySet<string> = new Set<string>(Object.values(WorldIdFieldTool));

export type ScopeOk = { readonly ok: true };
export type ScopeErr = { readonly ok: false; readonly error: string };
export type ScopeResult = ScopeOk | ScopeErr;

export function validatePinnedDraftToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  pinnedWorldId: string,
): ScopeResult {
  if (toolName === AgentExcludedTool.ListWorlds || toolName === AgentExcludedTool.CreateWorld) {
    return { ok: false, error: `tool not allowed in admin agent: ${toolName}` };
  }
  if (WORLD_ID_IN_ID.has(toolName)) {
    const id = args.id;
    if (typeof id !== 'string' || id !== pinnedWorldId) {
      return { ok: false, error: `tool ${toolName} requires id to equal the open draft` };
    }
    return { ok: true };
  }
  const worldId = args.worldId;
  if (typeof worldId === 'string') {
    if (worldId !== pinnedWorldId) {
      return { ok: false, error: 'worldId does not match the open draft' };
    }
    return { ok: true };
  }
  return { ok: false, error: `tool ${toolName} missing worldId (or unsupported shape)` };
}
```

Run: `pnpm exec vitest run src/infra/builder-agent/world-scope.test.ts -v`  
Expected: **PASS**

- [ ] **Step 3: Commit**

```bash
git add src/infra/builder-agent/world-scope.ts src/infra/builder-agent/world-scope.test.ts
git commit -m "feat(builder-agent): validate tool args against pinned draft world id"
```

---

### Task 3: OpenAI agent loop (injectable for tests)

**Files:**

- Create: `src/infra/builder-agent/openai-agent-loop.ts`
- Create: `src/infra/builder-agent/openai-agent-loop.test.ts`
- Modify: `src/mcp/tools.ts` (already has `toolsForAdminAgent`, `TOOL_BY_NAME`)

Define shared DTO types in `openai-agent-loop.ts`:

```typescript
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
```

- [ ] **Step 1: Write failing integration-style test `openai-agent-loop.test.ts`**

Use `MemoryBuilderRepository`, `TOOL_BY_NAME`, `toolsForAdminAgent`. Inject `callChat` that returns a sequence:

1. First response: `assistant` message with **one** `tool_calls` entry → `get_world` with correct `{ id: pinned }` (use repo’s world id from a fixture — create draft via core `createWorld` or seed helper; simplest: call `MemoryBuilderRepository` patterns from `src/mcp/server.test.ts` — copy minimal “create world” via `TOOL_BY_NAME.create_world` in **beforeEach** only in test file, then run agent with pinned id = created draft id).

Actually **agent excludes `create_world`** — in the test file use `createWorld` from `@core/builder/index` with `MemoryBuilderRepository` to seed a draft id, then agent may call `get_world`.

Stub sequence:

- Response A: `tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_world', arguments: JSON.stringify({ id: pinned }) } }]`
- Response B: assistant message **no** `tool_calls`, `content: 'Done.'`

Assert: `steps.length === 1`, `stopReason === BuilderAgentStopReason.Completed`, `get_world` returned `ok` in preview.

Also add test: second response requests `get_world` with **wrong** id → `BuilderAgentStopReason.ScopeError`, loop stops, no second tool run.

Run: `pnpm exec vitest run src/infra/builder-agent/openai-agent-loop.test.ts -v`  
Expected: **FAIL** until implementation exists.

- [ ] **Step 2: Implement `runBuilderAgentLoop` in `openai-agent-loop.ts`**

Signature (explicit types):

```typescript
import type OpenAI from 'openai';
import type { BuilderRepository } from '@core/builder/repository';
import { TOOL_BY_NAME, toolsForAdminAgent } from '../../mcp/tools';
import { validatePinnedDraftToolArgs } from './world-scope';

export type ChatCompleter = (input: {
  readonly model: string;
  readonly messages: OpenAI.Chat.ChatCompletionMessageParam[];
  readonly tools: OpenAI.Chat.ChatCompletionTool[];
}) => Promise<OpenAI.Chat.ChatCompletion>;

const DEFAULT_STEP_CEILING = 50;

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
  const maxToolSteps = Math.min(Math.max(1, args.maxToolSteps), DEFAULT_STEP_CEILING);
  const openAiTools: OpenAI.Chat.ChatCompletionTool[] = toolsForAdminAgent().map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
  // ... standard loop: append assistant with tool_calls; for each call parse JSON args;
  // validatePinnedDraftToolArgs; TOOL_BY_NAME[name].run; append tool message; increment step counter; break on error
  // When assistant has no tool_calls, return Completed with assistantSummary = content ?? null
}
```

Implementation details:

- Parse `tc.function.arguments` with `JSON.parse`; on `SyntaxError` return `ToolError` with message.
- `maxToolSteps` counts **each executed tool call** (including failed scope checks if you count them — **count only attempted executions**; if scope fails before `run`, still log as one step with `ok: false`).

- [ ] **Step 3: Run tests**

```bash
pnpm exec vitest run src/infra/builder-agent/openai-agent-loop.test.ts -v
```

Expected: **PASS**

- [ ] **Step 4: Commit**

```bash
git add src/infra/builder-agent/openai-agent-loop.ts src/infra/builder-agent/openai-agent-loop.test.ts
git commit -m "feat(builder-agent): OpenAI tool loop with pinned draft validation"
```

---

### Task 4: Server function + real OpenAI wiring

**Files:**

- Create: `app/server/admin/builder-agent.ts`
- Modify: `app/routes/admin/-components/BuilderAssistantPanel.tsx` (stub import path after creation)

- [ ] **Step 1: Read config helper in `builder-agent.ts`**

```typescript
import 'dotenv/config';
import OpenAI from 'openai';
import { getWorldTree } from '@core/builder/index';
import { WorldKind } from '@core/domain/builder-kinds';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { runBuilderAgentLoop } from '@infra/builder-agent/openai-agent-loop';
import { getBuilderRepo } from './repo';

const STEP_CEILING = 50;

function readDefaultMaxSteps(): number {
  const raw = process.env.BUILDER_AGENT_MAX_STEPS;
  if (raw === undefined || raw.length === 0) return 20;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20;
}

function readModel(): string | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.length === 0) return null;
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}
```

- [ ] **Step 2: `runBuilderAssistant` POST server fn**

Input: `{ worldId: string; prompt: string; maxSteps?: number }`

Handler:

1. `const model = readModel();` if null return `{ ok: false as const, code: 'llm_disabled', message: '...' }`.
2. `getBuilderRepo()`, `getWorldTree(repo, asWorldId(worldId))` — if not ok return error DTO.
3. If `tree.value.summary.kind !== WorldKind.Draft` return `{ ok: false, code: 'not_draft', ... }`.
4. `const maxToolSteps = Math.min(STEP_CEILING, requested ?? readDefaultMaxSteps())`.
5. Build `OpenAI` client like `src/infra/language-model/openai.ts` (respect `OPENAI_BASE_URL`).
6. `callChat` wraps `client.chat.completions.create({ model, messages, tools, tool_choice: 'auto' })`.
7. System prompt text (single const template in same file or `builder-agent-prompt.ts`) stating: only edit the draft with given id; prefer get_world/validate_world; do not delete unless asked; tools must use that id for `worldId` / `id` as applicable.

Return DTO:

```typescript
export type RunBuilderAssistantResponse =
  | { readonly ok: true; readonly stopReason: string; readonly steps: readonly unknown[]; readonly assistantSummary: string | null }
  | { readonly ok: false; readonly code: 'llm_disabled' | 'not_draft' | 'openai' | 'validation'; readonly message: string };
```

Use the real `BuilderAgentStopReason` values as strings in JSON (import const and map).

- [ ] **Step 3: Manual smoke (optional in CI)**

With `OPENAI_API_KEY` set locally: open draft admin, run one trivial prompt (“list locations” phrased naturally). Confirm DB unchanged if model only reads — or accept one harmless read.

- [ ] **Step 4: Commit**

```bash
git add app/server/admin/builder-agent.ts
git commit -m "feat(admin): server fn to run builder LLM agent on drafts"
```

---

### Task 5: UI — `BuilderAssistantPanel` + wire `$worldId`

**Files:**

- Create: `app/routes/admin/-components/BuilderAssistantPanel.tsx`
- Modify: `app/routes/admin/$worldId.tsx`

- [ ] **Step 1: Implement panel**

Props:

```typescript
export type BuilderAssistantPanelProps = {
  readonly worldId: string;
  readonly onApplied: () => Promise<void>;
};
```

- Local state: `prompt`, `maxStepsInput` (string), `busy`, `log`, `error`, `lastSummary`.
- On submit: `import { runBuilderAssistant } from '~/server/admin/builder-agent'` then `await runBuilderAssistant({ data: { worldId, prompt, maxSteps: parsed } })`.
- If `ok` false and `code === 'llm_disabled'`, show muted help text pointing at `OPENAI_API_KEY`.
- On success: render steps (definition list or table); call `onApplied()`.

- [ ] **Step 2: Wire in `$worldId.tsx`**

Inside the main layout (e.g. near `ProblemsRail` or bottom of workspace), `{isDraft ? <BuilderAssistantPanel worldId={...} onApplied={refresh} /> : null}`.

- [ ] **Step 3: Run checks**

```bash
pnpm typecheck && pnpm test && pnpm lint
```

Expected: all **PASS** (fix any Biome / tsc issues).

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/BuilderAssistantPanel.tsx app/routes/admin/$worldId.tsx
git commit -m "feat(admin): builder assistant panel for draft worlds"
```

---

## Spec coverage (self-review)

| Spec section | Tasks |
|----------------|-------|
| In-process shared registry | Task 1–3 use `TOOL_BY_NAME` / `toolsForAdminAgent` |
| Native OpenAI tools loop | Task 3–4 |
| Apply-as-you-go | `tool.run` immediately on repo |
| Max steps env + UI + ceiling | Task 4 (`readDefaultMaxSteps`, `STEP_CEILING`), Task 5 (optional input) |
| Draft-only | Task 4 `WorldKind.Draft` gate; Task 5 `isDraft` |
| Exclude cross-world tools | Task 1 + scope tests |
| Step log + summary | `BuilderAgentStepLogEntry` + DTO; UI Task 5 |
| Errors stop loop | Implemented in loop + server mapping |

**Placeholder scan:** None.

**Type consistency:** `BuilderAgentStopReason` is the single source for stop reason strings returned to the client; align server DTO with that type. Imports from `src/infra/builder-agent/` to MCP use **relative** paths (`../../mcp/tools`); there is no `@mcp` alias in `tsconfig.json`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-world-builder-llm-agent.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach do you want?
