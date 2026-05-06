# Imagined Dungeons — LLM Interpreter (Slice 2)

**Status:** Design approved (in conversation), ready for implementation plan.
**Scope:** Step 4 of `abstract-design.md` §14: free-text → action calls, via a language model. Architectural shape: composite parser — rule-based first, LLM only on `ParseError` fallback.
**Stack:** Slice 1 stack plus `openai` SDK (compatible with Ollama via `OPENAI_BASE_URL`). No other runtime additions.
**World:** Unchanged. The Burning District, same seed.

---

## 1. Goal

Let the player phrase commands naturally — `"head south"`, `"grab the fire map off the table"`, `"what's in my pack?"` — and have them resolve to the same closed `Action` set the deterministic engine already understands. The action vocabulary, action handlers, templates, and event log are unchanged. Only the *interpret* step gains a fallback path.

The composite shape is the load-bearing decision: **the existing rule-based parser stays as the fast path; the LLM is invoked only when the rules return a `ParseError`.** Most turns (`n`, `take map`, `look`, `i`) never touch the model. The model earns its keep on phrasings the rules can't match — and only then.

This slice keeps the interpretation seam stable for slice 3 (narrated actions), slice 4 (autonomous NPCs, which re-enter the same interpret step), and slice 5 (consequences). The `LanguageModel` port introduced here is the same one those slices will consume.

## 2. Non-Goals (explicitly deferred)

- **Narrated action types** (`speak`, `attack`). Slice 3.
- **Autonomous NPCs.** The interpreter built here will be reused, but no NPC takes a turn yet. Slice 4.
- **Consequences and `update_description`.** Slice 5.
- **Conversation memory / chat history.** The interpreter is *stateless per turn*. Each call gets only the player's current text and the actor's immediate perception. No prior turns are passed.
- **Streaming responses.** One non-streaming call, one parsed response.
- **Multi-action commands** (`take the map and go south`). The LLM returns exactly one `Action`. Compound utterances are out of scope.
- **Tool-calling / function-calling style API.** We use OpenAI structured outputs with a JSON schema. The action variant is encoded in the response, not in tool selection.
- **New verbs.** The closed `Action` union from slice 1 is the contract. The LLM cannot introduce verbs the engine doesn't implement.
- **Cost telemetry, token accounting, retries beyond a single attempt.** Cap retries at 1, no observability beyond logs.
- **Replacing the rule-based parser.** It stays as-is, with its current signature, module path, and tests.

## 3. Architecture — Composite Parser, LLM Behind a Port

Slice 1's hexagonal layout is preserved. One new port (`LanguageModel`), one new engine module (the composite parser), one new infra adapter (the OpenAI implementation).

```
┌──────────────────────────────────────────────────────────┐
│  app/  — TanStack Start                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  infra/  — Drizzle, repo, OpenAI LanguageModel     │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  core/engine                                 │  │  │
│  │  │   - parser.ts          (unchanged)           │  │  │
│  │  │   - parser/composite.ts   (NEW)              │  │  │
│  │  │   - language-model.ts     (NEW, interface)   │  │  │
│  │  │   - llm-interpret.ts      (NEW, prompt+parse)│  │  │
│  │  │   - turn.ts            (1-line import swap)  │  │  │
│  │  │  ┌────────────────────────────────────────┐  │  │  │
│  │  │  │  core/domain — Action, ParseError      │  │  │  │
│  │  │  └────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 3.1 The `LanguageModel` port — `src/core/engine/language-model.ts`

A pure interface. **No SDK imports anywhere in `core/`.** The shape is deliberately minimal so future model roles (consequences, narrator, NPC mind) can extend it or sit alongside it without coupling slice 2 to SDK details.

```ts
export interface LanguageModelRequest {
  readonly system: string;
  readonly user: string;
  readonly schema: JsonSchema;        // structured-output schema
  readonly schemaName: string;        // e.g. "PlayerActionResponse"
}

export interface LanguageModelResponse {
  readonly raw: string;               // the model's stringified JSON
  readonly parsed: unknown;           // JSON.parse(raw); validation is the caller's job
}

export interface LanguageModel {
  complete(req: LanguageModelRequest): Promise<LanguageModelResponse>;
}
```

The port returns `unknown` for `parsed`. The interpreter — not the port — owns validating the JSON against the closed `Action` union. This keeps the port reusable across roles with different output schemas.

`JsonSchema` is a narrow local type alias for the subset of JSON Schema we use (object with discriminated `kind` plus per-variant fields). We do not adopt a runtime schema library yet; a hand-written validator in `llm-interpret.ts` is sufficient and keeps the dependency surface small.

### 3.2 The composite parser — `src/core/engine/parser/composite.ts`

Same input/output contract as `parser.parse`, so `turn.ts` only needs an import-path swap (and the construction site supplies the `LanguageModel`).

```ts
export interface CompositeParserDeps {
  readonly llm: LanguageModel | null;   // null disables fallback (CI / no-key)
}

export function makeCompositeParser(deps: CompositeParserDeps) {
  return async function parse(
    text: string,
    actor: Agent,
    view: PerceptionView,
    inventory: readonly Item[],
  ): Promise<ParseResult> {
    const ruleBased = ruleParse(text, actor, view, inventory);
    if ('actorId' in ruleBased) return ruleBased;            // success
    if (!shouldFallback(ruleBased)) return ruleBased;        // not worth bothering the model
    if (!deps.llm) return ruleBased;                         // no fallback configured
    try {
      return await llmInterpret(text, actor, view, inventory, deps.llm) ?? ruleBased;
    } catch {
      return ruleBased;                                      // any failure → original ParseError
    }
  };
}
```

Two notes:

- The signature becomes `Promise<ParseResult>` (the rule-based parser is currently synchronous). `turn.ts` already `await`s the return value because dispatch is async; widening the parser to `Promise` is one keystroke at the call site.
- `shouldFallback` is a tiny predicate: fall back on `unknown_verb` and `no_such_target`. Don't fall back on `empty` (the player typed nothing) or `ambiguous_target` (the rules already understood; asking the model to pick is the wrong answer — re-prompting the user is, but that's slice 3 territory). `unknown_direction` and `missing_argument` are judgment calls; default to falling back, since "head out the south door" is exactly the kind of phrasing this slice exists to catch.

### 3.3 The interpreter — `src/core/engine/llm-interpret.ts`

Pure logic. Builds the prompt, calls the port, validates the response, returns `Action | null`. Returns `null` when the model says "I don't understand" via its escape hatch (see §5). The composite parser then falls back to the original `ParseError`.

This module imports nothing from `infra/` and nothing from `openai`. It's a pure function from `(text, actor, view, inventory, LanguageModel)` to `Promise<Action | null>`.

### 3.4 The OpenAI adapter — `src/infra/language-model/openai.ts`

The only place `import OpenAI from 'openai'` appears.

```ts
export interface OpenAIConfig {
  readonly apiKey: string;
  readonly model: string;          // default "gpt-4o-mini"
  readonly baseUrl?: string;       // for Ollama
}

export function makeOpenAILanguageModel(cfg: OpenAIConfig): LanguageModel { ... }
```

Reads `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), and `OPENAI_BASE_URL` (optional) from `.env`. Issues one non-streaming `chat.completions.create` call with `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`. One retry on transport failure or schema-parse failure; otherwise throws.

`gpt-4o-mini` is the default specifically because it (a) supports structured outputs in strict mode and (b) is cheap enough to make the fallback essentially free for routine play. Override via `OPENAI_MODEL`.

The factory function returns `LanguageModel | null`: if `OPENAI_API_KEY` is absent, it returns `null`, and the composition root passes `null` through to the composite parser. **Behavior with no key is identical to slice 1.** This is what keeps CI and the test suite deterministic without secrets.

### 3.5 Composition root — `app/server/world.ts`

Where the wiring happens. The engine knows nothing about which parser is in use; the server-side composition root assembles the composite parser and passes it (or its `parse` function) into `runTurn`.

`turn.ts` is updated to take the `parse` function as a dependency rather than importing it directly. This is the smallest change that keeps the engine pure while letting the composition root inject the LLM-aware parser. The signature becomes:

```ts
export async function runTurn(
  actorId: AgentId,
  text: string,
  repo: Repository,
  parse: ParseFn,                    // injected
): Promise<TurnResult>
```

`ParseFn` is the same shape as today's `parse` widened to `Promise<ParseResult>`. The slice-1 rule-based parser still satisfies it (a sync function that returns a value satisfies a `Promise`-returning shape via implicit wrapping at the call site, or we add a trivial async wrapper — pick during plan).

## 4. Data Flow — One Turn

```
[user types "head out the south door"]
        │
        ▼  (server fn submit, with composite parser injected)
runTurn(actorId, text, repo, parse)
        │
        ▼
parse(text, actor, view, inventory)
        │
        ├─ ruleParse → ParseError { kind: 'unknown_verb', verb: 'head' }
        │
        ├─ shouldFallback? yes. llm present? yes.
        │
        ▼
llmInterpret(text, actor, view, inventory, llm)
        ├─ buildSystemPrompt() + buildUserPrompt(text, view, inventory)
        ├─ llm.complete({ system, user, schema, schemaName })
        ├─ validate parsed against PlayerActionResponse schema
        │   ├─ { ok: true, action: { kind: 'move', direction: 'south' } } → return Action
        │   └─ { ok: true, unknown: true } → return null
        │
        ▼
returns Action { kind: 'move', actorId, direction: 'south' }
        │
        ▼  (rest of the turn is unchanged from slice 1)
dispatch → validate → mutate → emit event → render
```

When the LLM call throws, when the schema validation fails after one retry, or when the response says `{ unknown: true }`, the composite returns the *original* `ParseError`. The user sees the same message they'd have seen in slice 1. No degradation, no surprise.

## 5. Prompt Design

The interpreter prompt has three jobs: explain the closed action vocabulary, ground the model in what the actor can currently see, and define the response shape unambiguously. Prompt construction is pure code in `llm-interpret.ts` — no template files, no externalised prompt registry. (We can extract one if we end up with three or more model roles wanting it.)

### 5.1 System prompt

A single static block, generated at module load. It contains:

- A one-paragraph framing: the model is the interpreter for a text adventure; its only job is to map the player's natural-language input to one of the listed actions; it must never invent verbs.
- The action vocabulary, listed verbatim from the `Action` union, with each variant's required fields and a one-line description and one example phrasing.
- The escape hatch (see §5.3): if the input doesn't map to any action, return `{ unknown: true, reason: "..." }`. Do not guess.
- A short "things to ignore" list: don't try to be clever with combat, dialogue, or NPC behaviour — those aren't supported yet; if the player tries them, return `unknown` with a brief reason.

### 5.2 User prompt

Built per turn from `(text, actor, view, inventory)`. Concise structured English, not JSON. The shape:

```
Player input: "<verbatim text>"

Actor: <actor.label>
Location: <location.label>
Visible items: <comma-separated item.label list, or "none">
Other agents here: <comma-separated agent.label list, or "none">
Exits: <comma-separated direction list with optional exit labels, or "none">
Inventory: <comma-separated item.label list, or "empty">
```

Item and exit *ids* are deliberately not in the prompt. The LLM returns natural-language references (`itemRef: "fire map"`, `direction: "south"`), exactly like the rule-based parser produces. The same downstream resolver (`resolveItem` in `parser.ts`, dispatched action handlers for directions) does the matching. This keeps a single source of truth for noun resolution.

### 5.3 The escape hatch

The model must have a way to say "I don't know what they mean" without hallucinating an action. The response schema (see §6) admits two shapes: a successful action variant, or an `unknown` variant. The system prompt explicitly instructs the model to choose `unknown` over guessing.

When the interpreter returns `unknown`, the composite parser falls back to the rule-based parser's original `ParseError` — *not* a synthesised "the LLM didn't understand" message. This keeps the user-facing error surface identical to slice 1.

## 6. Output Contract / JSON Schema

The interpreter response is a discriminated union with five action variants plus an unknown variant. Encoded as JSON Schema in OpenAI's structured-outputs strict mode (every field required, `additionalProperties: false`, discriminator on `kind`).

```jsonc
{
  "name": "PlayerActionResponse",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["kind"],
    "oneOf": [
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "direction"],
        "properties": {
          "kind": { "const": "move" },
          "direction": {
            "enum": ["north","south","east","west","northeast","northwest","southeast","southwest","up","down"]
          }
        }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "targetRef"],
        "properties": {
          "kind": { "const": "look" },
          "targetRef": { "type": ["string", "null"] }
        }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "itemRef"],
        "properties": {
          "kind": { "const": "take" },
          "itemRef": { "type": "string" }
        }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "itemRef"],
        "properties": {
          "kind": { "const": "drop" },
          "itemRef": { "type": "string" }
        }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind"],
        "properties": { "kind": { "const": "inventory" } }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "reason"],
        "properties": {
          "kind": { "const": "unknown" },
          "reason": { "type": "string" }
        }
      }
    ]
  },
  "strict": true
}
```

Server-side, the response is parsed once more in `llm-interpret.ts` against this same shape (a hand-written validator — eight discriminated branches, ~50 lines). Strict-mode structured outputs make this validator nearly always a no-op, but we don't trust the wire format unconditionally. If the validator rejects, we treat the response as `unknown` and the composite parser falls back to the rule-based `ParseError`.

The successful variants are then assembled into the engine's `Action` type by adding the actor id (which the LLM never sees and never produces).

### Why hand-written validation rather than zod / valibot

This slice adds one network dependency (the SDK). Adding a runtime-schema library at the same time multiplies surface area. The shape is small and stable; eight `switch`-arm checks with type guards is fine and testable. We can introduce zod in a later slice if the schema set grows.

## 7. Error / Fallback Strategy

The whole point of the composite shape is graceful degradation. Failure modes, in order from the player's perspective:

| Failure | What happens |
|---|---|
| Rule-based parser succeeds | LLM never called. Identical to slice 1. |
| `OPENAI_API_KEY` missing | Composition root passes `llm: null`. Composite returns the rule-based `ParseError`. Identical to slice 1. |
| LLM call throws (network, 5xx, timeout) | One retry. On second failure, return the original `ParseError`. |
| LLM returns malformed JSON | Caught at `JSON.parse`. Treat as `unknown`. Original `ParseError`. |
| LLM returns valid JSON failing schema validation | Treat as `unknown`. Original `ParseError`. |
| LLM returns `{ kind: 'unknown', reason }` | Original `ParseError`. (`reason` is logged for diagnostics, not shown to the user.) |
| LLM returns a valid `Action` for an item that doesn't exist | The action is dispatched. The action handler's existing validation produces the slice-1 "no such item" template. The LLM doesn't get to bypass game rules. |
| LLM is slow | One call, no streaming, default OpenAI timeout. Slow turns are slow turns. We address latency only if it becomes a complaint. |

There is **no in-engine retry loop** beyond the single retry inside the OpenAI adapter. There is **no exponential backoff**. There is **no caching** of LLM responses across turns. Cost is bounded by the rule-based parser handling the common case for free.

The LLM never sees the result of its own work. There's no second turn, no self-correction loop, no reflection step. One call, one validation, dispatch or fall back.

## 8. Testing Strategy

The same three-tier shape as slice 1.

### 8.1 Unit (vitest)

- **Composite parser** (`tests/unit/composite-parser.test.ts`): inject a fake `LanguageModel`. Assert:
  - Successful rule-based parses bypass the LLM entirely (the fake records call count = 0).
  - Rule-based `ParseError`s in the fall-through set trigger an LLM call.
  - `empty` and `ambiguous_target` errors do *not* trigger an LLM call.
  - LLM returning a valid action produces the corresponding `Action` with the correct actor id.
  - LLM returning `{ unknown: true, reason }` returns the original `ParseError`.
  - LLM throwing returns the original `ParseError`.
  - `llm: null` returns the original `ParseError` and never calls the (absent) port.

- **LLM interpreter** (`tests/unit/llm-interpret.test.ts`): unit-test the prompt builder and the response validator independently of any SDK.
  - Prompt builder: snapshot-test the assembled user prompt for a representative `(text, actor, view, inventory)` tuple.
  - Validator: feed every variant of valid response, every malformed response shape we can think of, and assert the validator returns the right `{ ok, value | reason }`.

- **Rule-based parser** (`tests/unit/parser.test.ts`): unchanged. The 47 existing tests still pass.

### 8.2 Integration (vitest)

- **Composite + real engine, fake LLM** (`tests/integration/composite-turn.test.ts`): wire the composite parser into `runTurn` against the in-memory repo, with a fake `LanguageModel` whose responses are scripted per test. Assert the full pipeline (parse → dispatch → render → emit event) works through the LLM path. The DB is `:memory:` SQLite via the existing integration harness.

- **Smoke** (manual / optional): one test against the real OpenAI API, gated on `OPENAI_API_KEY` being present in the environment. Skipped in CI. Lives in `tests/integration/openai-smoke.test.ts` and is excluded from the default test command — invoked via `pnpm test:llm` or similar.

### 8.3 No SDK in the test graph

`tests/` files never `import 'openai'`. The fake `LanguageModel` is a few lines of TypeScript implementing the interface. This is what keeps the test suite deterministic, offline, and free.

### 8.4 The fake `LanguageModel`

Reused across tests. Likely shape:

```ts
export interface FakeLanguageModelOptions {
  readonly responder: (req: LanguageModelRequest) => LanguageModelResponse | Promise<LanguageModelResponse>;
}
export function makeFakeLanguageModel(opts: FakeLanguageModelOptions): LanguageModel & {
  readonly calls: readonly LanguageModelRequest[];
};
```

Tests construct it with a responder that returns canned JSON for the inputs they care about, then assert on `calls` to verify whether the model was invoked.

## 9. Repository Layout — New / Modified

```
imagined-dungeons/
├── docs/superpowers/specs/
│   └── 2026-05-06-llm-interpreter-design.md     -- this file (NEW)
├── src/
│   ├── core/
│   │   └── engine/
│   │       ├── language-model.ts                 -- LanguageModel port (NEW)
│   │       ├── llm-interpret.ts                  -- prompt + validate (NEW)
│   │       ├── parser/
│   │       │   └── composite.ts                  -- composite parser (NEW)
│   │       ├── parser.ts                         -- unchanged
│   │       └── turn.ts                           -- inject parse fn (MODIFIED)
│   └── infra/
│       └── language-model/
│           └── openai.ts                         -- OpenAI adapter (NEW)
├── app/
│   └── server/
│       └── world.ts                              -- composition root: build composite (MODIFIED or NEW)
├── tests/
│   ├── unit/
│   │   ├── composite-parser.test.ts              -- NEW
│   │   └── llm-interpret.test.ts                 -- NEW
│   └── integration/
│       ├── composite-turn.test.ts                -- NEW
│       └── openai-smoke.test.ts                  -- NEW, skipped without key
├── .env.example                                   -- document OPENAI_* vars (NEW or MODIFIED)
└── package.json                                   -- add `openai` dependency (MODIFIED)
```

No changes to: `core/domain/`, the rule-based `parser.ts`, the action handlers, templates, perception, repository interface, Drizzle schema, seed, or any of the existing routes / server fns / components.

## 10. Acceptance Criteria

The slice is done when:

1. With `OPENAI_API_KEY` set, typing `"head south"` (or any phrasing the rule-based parser rejects but a competent reader would understand) at the Flaming Goblet moves Paff. Movement events still appear in the events table.
2. With `OPENAI_API_KEY` set, typing `"grab the fire map"` succeeds and the fire map enters Paff's inventory.
3. With `OPENAI_API_KEY` set, typing `"do a backflip"` produces the same error message a slice-1 player would see for an unknown verb (no synthesised LLM-quoted message reaches the user).
4. With `OPENAI_API_KEY` *unset*, typing `"head south"` produces the slice-1 unknown-verb error. No network call is attempted. The 47 existing tests pass unchanged.
5. The rule-based parser's tests are unchanged in count and content. `pnpm test` passes — including the new composite, interpreter, and integration tests, all using the fake `LanguageModel`.
6. The OpenAI smoke test, if invoked with a real key, succeeds against `gpt-4o-mini`. Default `pnpm test` does not run it.
7. Pointing at Ollama via `OPENAI_BASE_URL=http://localhost:11434/v1` and `OPENAI_MODEL=<some-local-model>` works end-to-end (manual verification, not a CI test).
8. `pnpm typecheck` passes with TypeScript strict. No `any` introduced. The `LanguageModel` port and its consumers are fully typed.
9. `pnpm lint` passes (biome).
10. `core/engine` and `core/domain` contain zero imports of `openai`. (Greppable acceptance criterion.)

## 11. Open Questions for the Plan

These are decisions to make during plan-writing, not now:

- **Async parser shape.** Do we widen the rule-based `parse` to `async`, or wrap it at the composition site? The latter is one fewer file change but slightly less honest about the I/O shape. Lean: wrap.
- **Where exactly the composition root lives.** Slice 1 wires repos in `app/server/submit.ts` (or similar). Adding the parser there is fine; alternatively, introduce `app/server/world.ts` as a single composition module that returns `{ repo, parse }`. The latter scales better as slice 4 adds an NPC interpreter sharing the same `LanguageModel`.
- **Which `ParseError` kinds trigger fallback.** Spec'd as `unknown_verb` and `no_such_target` (and probably `unknown_direction` and `missing_argument`). Confirm the exact set during planning by walking through the rule-based parser's error paths.
- **Hand-written validator vs. zod.** Spec recommends hand-written; revisit only if the schema set grows in slice 3.
- **Logging.** Do we log LLM `unknown` reasons? Failed validations? Where? (Recommendation: a single `console.warn` with a tag, no structured logger yet. Slice 5+ will likely want telemetry; not now.)
- **Timeout.** OpenAI SDK default is generous. Do we override with something tighter (say 10s) so slow turns fail fast and fall back? Default to 10s during planning unless someone objects.
- **Smoke-test runner glue.** `pnpm test:llm`? A vitest tag? An env-gated `describe.skip`? Pick during plan.

## 12. Out of Scope, On the Roadmap

The next slices (each its own spec):

- **Slice 3** — Narrated action types: `speak`, `attack`. The Narrator role joins the `LanguageModel` port (new `narrate` method or a sibling port). The action vocabulary grows; the interpreter learns the new variants by extending the JSON schema.
- **Slice 4** — One autonomous NPC. The same `LanguageModel` port serves the NPC mind. The composite-parser shape from this slice is what the NPC re-enters with its model-generated intent text.
- **Slice 5** — Consequence pass and `update_description`. A third use of the port.
- **Slice 6+** — Combat, containers, search, locks-with-keys, hidden things. Each adds verbs to the closed set, which the interpreter picks up via schema extension.
