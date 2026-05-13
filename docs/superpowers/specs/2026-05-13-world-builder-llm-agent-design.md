# World Builder — LLM agent (in-process tools) — Design

Status: draft, awaiting user review.

Parent context: [2026-05-08-campaign-builder-design.md](./2026-05-08-campaign-builder-design.md) (builder core, MCP as adapter, draft vs live).

## Goal

Add a section on the world editor (`/admin/$worldId`) where the user submits a natural-language prompt. A server-side LLM runs a **bounded multi-step loop** using **the same builder operations as the MCP tool surface**, applying changes **immediately** to the **draft** world (same semantics as today’s MCP tools against SQLite).

## Non-goals (v1)

- Driving tools via the **MCP wire protocol** from the browser (stdio/SSE). The agent runs **in-process** in the web backend; MCP remains a separate adapter for external clients.
- Auto-publish after the agent runs; **publish stays the integrity gate** per existing builder rules.
- Undo / rollback of an agent run beyond whatever manual editing or git/DB backup the operator already uses.
- Streaming partial assistant tokens to the UI (optional later); v1 may return a **step log + summary** when the run finishes.

## Decisions (from brainstorming)

1. **Execution model:** In-process tool execution on the server (`BuilderRepository` + shared tool `run` handlers). No MCP transport inside this feature.
2. **Commit semantics:** **Apply as you go** — each successful tool invocation commits like MCP today.
3. **Loop cap:** **Configurable max steps** — default from environment; optional UI control; **hard ceiling** enforced server-side.
4. **Orchestration:** **Native OpenAI chat completions with `tools` / function calling**, in an **admin-only** code path. Does not replace the gameplay `LanguageModel` JSON-schema `complete` path; keep the two concerns separate unless a later refactor clearly benefits both.
5. **World kind:** Panel **enabled only for draft worlds**. Live worlds are not AI-edited in v1 through this panel.

## Architecture

```
Admin route UI  →  server function (draft worldId + prompt + optional maxSteps)
       →  OpenAI loop (messages + tool_calls)
       →  for each tool_call: shared registry[name].run(builderRepo, args)
       →  append tool results to messages; repeat until finish or stop condition
       →  return { stepLog, assistantSummary?, error? }
```

- **Shared tool registry:** One module exports an ordered list (or map) of tool definitions: `name`, `description`, **JSON Schema for arguments** (OpenAI-compatible object schema), and `run(repo, args)`. **`src/mcp/server.ts`** (or `tools.ts`) registers MCP tools from this registry unchanged. The **admin agent** maps the same entries to OpenAI tool definitions and executes the same `run` functions.
- **Drift prevention:** No duplicate tool lists. If a tool is **MCP-only** or **admin-only** later, add an optional visibility flag on the registry entry; default is **both** for all current builder tools.

## UI / UX

- New panel or section on **`/admin/$worldId`**, visually consistent with the existing grimoire admin styling.
- Controls: **prompt** (multiline), **submit**, optional **max steps** (numeric, capped server-side), **disabled** state when `OPENAI_API_KEY` is unset (mirror “null LLM” clarity elsewhere).
- After run: show **step log** (tool name, short args summary, ok / error snippet) and optional **short final summary** from the assistant. Refresh existing **validation / problem** UI if the world editor already has a refresh hook after mutations.

## Errors and validation

- **`ok: false` from a tool:** Stop the loop; record in step log; return error detail to UI. No automatic retry in v1.
- **Transport / API failures:** Stop; user-facing message; DB state reflects only steps that committed before failure.
- **Unknown tool name or invalid arguments** (before `run`): Treat as step error; **stop** (no silent skip/re-prompt loop in v1).
- **`validate_world`:** Available to the model like any other tool; **not** required after every step. Draft may end **invalid**; inline problems + publish gate behave as today.
- **System prompt (advisory):** Encourage `get_world` / `validate_world` before large edits, prefer upserts with stable ids, avoid destructive deletes unless the user asked. **Max steps** remains a hard code constraint.

## Configuration

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Required for feature; if missing, panel disabled. |
| `OPENAI_MODEL` / `OPENAI_BASE_URL` | Reuse existing deployment pattern for OpenAI. |
| `BUILDER_AGENT_MAX_STEPS` | Default max steps when the UI does not override. |
| (optional later) `BUILDER_AGENT_MODEL` | Separate model for authoring without changing gameplay defaults. |

Server enforces **hard ceiling** on steps (suggested default cap **50**); client cannot exceed it.

## Testing

- **Unit:** Parsing / normalization from OpenAI `tool_calls` to internal `{ name, arguments }`, step counting, respect for `maxSteps`.
- **Integration:** Stubbed OpenAI responses (fixed sequences of `tool_calls` + final message) against `MemoryBuilderRepository` (or existing builder test harness): verify call order, **stop on `ok: false`**, **stop at maxSteps**, and correct persistence.
- **E2E:** Not required for v1 unless admin Playwright coverage already exists.

## Security / ops

- **No new auth** in v1: same exposure as `/admin` today. Operators treat API keys and DB as trusted.
- **Rate / cost:** Bounded by `maxSteps` and tool count; no unbounded agent in v1.

## Spec self-review

- **Placeholders:** None intentional; numeric ceiling (50) is a concrete default and can be adjusted in implementation if documented in code.
- **Consistency:** Aligns with campaign builder spec (MCP mirrors builder; drafts may be invalid; publish is gate).
- **Scope:** Single feature slice (UI + server agent + registry refactor); no gameplay LLM refactor.
- **Ambiguity:** “Optional UI max steps” — if omitted, server uses `BUILDER_AGENT_MAX_STEPS` or a built-in default; implementation must define precedence in code comments or env example.
