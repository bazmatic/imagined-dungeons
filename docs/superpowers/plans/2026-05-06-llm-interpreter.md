# LLM Interpreter Implementation Plan (Slice 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an OpenAI-backed natural-language interpreter that runs **only when** the existing rule-based parser returns a `ParseError`. The rule-based parser keeps its current file location, public exports, and behaviour. The LLM is additive, behind a port (`LanguageModel`). The composite parser composes the two. Slice 1's 47 existing tests must pass unchanged.

**Architecture:** Layered hexagonal (unchanged from slice 1). One new engine port (`LanguageModel`), one new pure interpreter module (`llm-interpret.ts`), one new composite parser (`parser/composite.ts`), one new infra adapter (`infra/language-model/openai.ts`). `runTurn` gains an injected `parse` function. `app/server/world.ts` becomes the composition root that decides whether the LLM is wired in (based on `OPENAI_API_KEY`). `core/` never imports `openai`.

**Tech Stack:** TanStack Start, TypeScript strict (`verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`), vitest, biome. New: `openai` SDK (compatible with Ollama via `OPENAI_BASE_URL`).

**Source-of-truth refs:**
- Spec: [docs/superpowers/specs/2026-05-06-llm-interpreter-design.md](../specs/2026-05-06-llm-interpreter-design.md)
- Slice 1 plan: [2026-05-06-mechanical-text-adventure.md](./2026-05-06-mechanical-text-adventure.md)
- Existing rule-based parser: `src/core/engine/parser.ts` (do not modify)
- Existing turn orchestrator: `src/core/engine/turn.ts` (gains injected `parse`)
- Existing composition root: `app/server/world.ts`
- Integration test that must remain green: `tests/integration/full-flow.test.ts`

---

## Task 1: `LanguageModel` port and request/response types

**Goal:** Pure interface for "send messages and a JSON schema, get back parsed JSON". Lives in `core/engine/`. No SDK imports anywhere. This is the seam the rest of the slice builds against.

**Files:**
- Create: `src/core/engine/language-model.ts`
- Test: `src/core/engine/language-model.test.ts`

- [ ] **Step 1: Failing test (type-only)**

Create `src/core/engine/language-model.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- language-model`
Expected: FAIL — `Cannot find module './language-model'`.

- [ ] **Step 3: Implement the port**

Create `src/core/engine/language-model.ts`:

```ts
/**
 * The minimal subset of JSON Schema we use for structured outputs.
 * Hand-written; matches what OpenAI's strict mode accepts.
 */
export type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly string[];
  readonly const?: string | number | boolean | null;
  readonly oneOf?: readonly JsonSchema[];
  readonly items?: JsonSchema;
};

export interface LanguageModelRequest {
  readonly system: string;
  readonly user: string;
  readonly schema: JsonSchema;
  readonly schemaName: string;
}

export interface LanguageModelResponse {
  readonly raw: string;
  readonly parsed: unknown;
}

export interface LanguageModel {
  complete(req: LanguageModelRequest): Promise<LanguageModelResponse>;
}
```

- [ ] **Step 4: Run — verify pass + typecheck**

Run: `pnpm test -- language-model && pnpm typecheck`
Expected: PASS, 1 test; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 1: LanguageModel port + JsonSchema types"
```

---

## Task 2: Output schema constant + response validator

**Goal:** A pure validator that takes `unknown` (the JSON parsed by the SDK) and returns either an interpreter result we can act on or a recognised "invalid"/"unknown" outcome. The action variants encoded here mirror exactly the closed `Action` union from slice 1 (`move | look | take | drop | inventory`) plus an `unknown` escape hatch.

**Files:**
- Create: `src/core/engine/llm-output.ts`
- Test: `src/core/engine/llm-output.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/llm-output.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PLAYER_ACTION_SCHEMA, validatePlayerAction } from './llm-output';

describe('PLAYER_ACTION_SCHEMA', () => {
  it('is an object schema with strict additionalProperties', () => {
    expect(PLAYER_ACTION_SCHEMA.type).toBe('object');
    expect(PLAYER_ACTION_SCHEMA.additionalProperties).toBe(false);
    expect(PLAYER_ACTION_SCHEMA.oneOf?.length).toBe(6);
  });
});

describe('validatePlayerAction', () => {
  it('accepts a valid move with a canonical direction', () => {
    const r = validatePlayerAction({ kind: 'move', direction: 'south' });
    expect(r).toEqual({ kind: 'move', direction: 'south' });
  });

  it('accepts move for every cardinal/ordinal/vertical direction', () => {
    for (const d of [
      'north', 'south', 'east', 'west',
      'northeast', 'northwest', 'southeast', 'southwest',
      'up', 'down',
    ]) {
      expect(validatePlayerAction({ kind: 'move', direction: d })).toEqual({
        kind: 'move',
        direction: d,
      });
    }
  });

  it('rejects move with a non-canonical direction', () => {
    expect(validatePlayerAction({ kind: 'move', direction: 'sideways' })).toEqual({
      kind: 'invalid',
    });
  });

  it('accepts look with targetRef = null and with a string targetRef', () => {
    expect(validatePlayerAction({ kind: 'look', targetRef: null })).toEqual({
      kind: 'look',
      targetRef: null,
    });
    expect(validatePlayerAction({ kind: 'look', targetRef: 'fire map' })).toEqual({
      kind: 'look',
      targetRef: 'fire map',
    });
  });

  it('accepts take and drop with non-empty itemRef', () => {
    expect(validatePlayerAction({ kind: 'take', itemRef: 'fire map' })).toEqual({
      kind: 'take',
      itemRef: 'fire map',
    });
    expect(validatePlayerAction({ kind: 'drop', itemRef: 'fire map' })).toEqual({
      kind: 'drop',
      itemRef: 'fire map',
    });
  });

  it('rejects take/drop with empty or non-string itemRef', () => {
    expect(validatePlayerAction({ kind: 'take', itemRef: '' })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'take', itemRef: 42 })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'drop' })).toEqual({ kind: 'invalid' });
  });

  it('accepts inventory with no other fields', () => {
    expect(validatePlayerAction({ kind: 'inventory' })).toEqual({ kind: 'inventory' });
  });

  it('returns the unknown variant verbatim with the reason string', () => {
    expect(validatePlayerAction({ kind: 'unknown', reason: 'not a verb i know' })).toEqual({
      kind: 'unknown',
      reason: 'not a verb i know',
    });
  });

  it('rejects malformed inputs', () => {
    expect(validatePlayerAction(null)).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction('move south')).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({})).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'attack', target: 'spark' })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'move' })).toEqual({ kind: 'invalid' });
    expect(validatePlayerAction({ kind: 'unknown' })).toEqual({ kind: 'invalid' });
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- llm-output`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema and validator**

Create `src/core/engine/llm-output.ts`:

```ts
import type { Direction } from '@core/domain/entities';
import type { JsonSchema } from './language-model';

const DIRECTIONS: readonly Direction[] = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'up', 'down',
];

export const PLAYER_ACTION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'direction'],
      properties: {
        kind: { const: 'move' },
        direction: { enum: DIRECTIONS },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'targetRef'],
      properties: {
        kind: { const: 'look' },
        targetRef: { type: ['string', 'null'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'itemRef'],
      properties: {
        kind: { const: 'take' },
        itemRef: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'itemRef'],
      properties: {
        kind: { const: 'drop' },
        itemRef: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { const: 'inventory' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'reason'],
      properties: {
        kind: { const: 'unknown' },
        reason: { type: 'string' },
      },
    },
  ],
};

export const PLAYER_ACTION_SCHEMA_NAME = 'PlayerActionResponse';

/**
 * The validator's output. NOT an Action — that requires an actorId, which
 * the LLM never sees. The interpreter assembles the Action.
 */
export type ValidatedPlayerAction =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'look'; readonly targetRef: string | null }
  | { readonly kind: 'take'; readonly itemRef: string }
  | { readonly kind: 'drop'; readonly itemRef: string }
  | { readonly kind: 'inventory' }
  | { readonly kind: 'unknown'; readonly reason: string }
  | { readonly kind: 'invalid' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isDirection = (v: unknown): v is Direction =>
  typeof v === 'string' && (DIRECTIONS as readonly string[]).includes(v);

export function validatePlayerAction(input: unknown): ValidatedPlayerAction {
  if (!isRecord(input)) return { kind: 'invalid' };
  const { kind } = input;
  switch (kind) {
    case 'move': {
      const direction = input.direction;
      if (!isDirection(direction)) return { kind: 'invalid' };
      return { kind: 'move', direction };
    }
    case 'look': {
      const targetRef = input.targetRef;
      if (targetRef !== null && typeof targetRef !== 'string') {
        return { kind: 'invalid' };
      }
      return { kind: 'look', targetRef };
    }
    case 'take': {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: 'invalid' };
      return { kind: 'take', itemRef };
    }
    case 'drop': {
      const itemRef = input.itemRef;
      if (typeof itemRef !== 'string' || itemRef.length === 0) return { kind: 'invalid' };
      return { kind: 'drop', itemRef };
    }
    case 'inventory':
      return { kind: 'inventory' };
    case 'unknown': {
      const reason = input.reason;
      if (typeof reason !== 'string') return { kind: 'invalid' };
      return { kind: 'unknown', reason };
    }
    default:
      return { kind: 'invalid' };
  }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- llm-output`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 2: PLAYER_ACTION_SCHEMA + validatePlayerAction"
```

---

## Task 3: Prompt builder

**Goal:** Pure functions that build the system and user prompts. Snapshot-tested for stability. No I/O. Lives in `core/engine/`.

**Files:**
- Create: `src/core/engine/llm-prompt.ts`
- Test: `src/core/engine/llm-prompt.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/llm-prompt.test.ts`:

```ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const tavern: Location = {
  id: A,
  worldId: W,
  label: 'The Flaming Goblet',
  shortDescription: '',
  longDescription: 'A warm tavern.',
};
const paff: Agent = {
  id: asAgentId('char_p'),
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 0,
  defense: 0,
  capacity: 10,
  mood: null,
  goal: null,
  autonomous: false,
};
const spark: Agent = {
  ...paff,
  id: asAgentId('char_s'),
  label: 'Spark',
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
};
const exitSouth: Exit = {
  id: asExitId('e_s'),
  worldId: W,
  from: A,
  to: asLocationId('loc_b'),
  direction: 'south',
  label: 'south door',
  locked: false,
  lockedByItem: null,
};

describe('buildSystemPrompt', () => {
  it('mentions every action variant by name', () => {
    const s = buildSystemPrompt();
    for (const verb of ['move', 'look', 'take', 'drop', 'inventory', 'unknown']) {
      expect(s).toContain(verb);
    }
  });

  it('instructs the model to choose unknown over guessing', () => {
    expect(buildSystemPrompt().toLowerCase()).toContain('unknown');
  });
});

describe('buildUserPrompt', () => {
  it('includes the verbatim player input, location, items, agents, exits, inventory', () => {
    const u = buildUserPrompt('head out the south door', paff, {
      actor: paff,
      location: tavern,
      items: [map],
      agents: [spark],
      exits: [exitSouth],
    }, []);
    expect(u).toContain('head out the south door');
    expect(u).toContain('Paff');
    expect(u).toContain('The Flaming Goblet');
    expect(u).toContain('fire map');
    expect(u).toContain('Spark');
    expect(u).toContain('south');
    expect(u.toLowerCase()).toContain('inventory');
  });

  it('uses "none" / "empty" placeholders when sections are empty', () => {
    const u = buildUserPrompt('look', paff, {
      actor: paff,
      location: tavern,
      items: [],
      agents: [],
      exits: [],
    }, []);
    expect(u.toLowerCase()).toContain('none');
    expect(u.toLowerCase()).toContain('empty');
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- llm-prompt`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt builders**

Create `src/core/engine/llm-prompt.ts`:

```ts
import type { Agent, Item } from '@core/domain/entities';
import type { PerceptionView } from './perception';

const SYSTEM_PROMPT = `You are the interpreter for a turn-based text adventure.
Your only job is to map the player's natural-language input to exactly one of the actions listed below.
You must never invent verbs, items, exits, or directions that are not present.
If the input does not unambiguously map to a listed action, return { "kind": "unknown", "reason": "<short>" }.

Available actions:
- move: travel in a compass/vertical direction. Required: { kind: "move", direction: <one of north|south|east|west|northeast|northwest|southeast|southwest|up|down> }. Example: "head south" -> { kind: "move", direction: "south" }.
- look: examine the surroundings or a specific thing. Required: { kind: "look", targetRef: <string | null> }. Use null to look at the room. Example: "examine the fire map" -> { kind: "look", targetRef: "fire map" }.
- take: pick up an item visible in the location. Required: { kind: "take", itemRef: <string> }. Example: "grab the map" -> { kind: "take", itemRef: "map" }.
- drop: drop an item the player is carrying. Required: { kind: "drop", itemRef: <string> }. Example: "drop the map" -> { kind: "drop", itemRef: "map" }.
- inventory: list what the player is carrying. Required: { kind: "inventory" }. Example: "what am I carrying?" -> { kind: "inventory" }.
- unknown: the input is a request you cannot map. Required: { kind: "unknown", reason: <string> }. Use this for combat, dialogue, NPC commands, or anything outside the listed actions. Do not guess.

Rules:
- Return exactly one JSON object matching the schema. Never wrap it in prose.
- itemRef and targetRef should be a short natural-language reference to the visible object, not an id.
- If the player names an exit by its label, return move with the matching compass/vertical direction.
- Combat, conversation, and other complex behaviour are not yet supported. Return unknown for those.
`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

const join = (xs: readonly string[]): string => (xs.length === 0 ? '' : xs.join(', '));

export function buildUserPrompt(
  text: string,
  _actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
): string {
  const items = view.items.map((i) => i.label);
  const agents = view.agents.map((a) => a.label);
  const exits = view.exits.map((e) =>
    e.label && e.label !== e.direction ? `${e.direction} (${e.label})` : e.direction,
  );
  const inv = inventory.map((i) => i.label);
  return [
    `Player input: "${text}"`,
    '',
    `Actor: ${view.actor.label}`,
    `Location: ${view.location.label}`,
    `Visible items: ${items.length ? join(items) : 'none'}`,
    `Other agents here: ${agents.length ? join(agents) : 'none'}`,
    `Exits: ${exits.length ? join(exits) : 'none'}`,
    `Inventory: ${inv.length ? join(inv) : 'empty'}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- llm-prompt`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 3: buildSystemPrompt + buildUserPrompt"
```

---

## Task 4: Fake `LanguageModel` test helper

**Goal:** A tiny test helper that implements the `LanguageModel` interface with a scriptable responder and a recorded `calls` array. Used by Tasks 5 and 6. Lives under `tests/` because no production code consumes it.

**Files:**
- Create: `tests/helpers/fake-language-model.ts`
- Test: `tests/helpers/fake-language-model.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/helpers/fake-language-model.test.ts`:

```ts
import type { LanguageModelRequest, LanguageModelResponse } from '@core/engine/language-model';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from './fake-language-model';

describe('makeFakeLanguageModel', () => {
  it('records every call and forwards the responder result', async () => {
    const responder = (req: LanguageModelRequest): LanguageModelResponse => ({
      raw: '{"kind":"inventory"}',
      parsed: { kind: 'inventory' },
    });
    const llm = makeFakeLanguageModel({ responder });
    const r = await llm.complete({
      system: 's',
      user: 'u',
      schema: { type: 'object' },
      schemaName: 'X',
    });
    expect(r.parsed).toEqual({ kind: 'inventory' });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.user).toBe('u');
  });

  it('supports an async responder and propagates thrown errors', async () => {
    const llm = makeFakeLanguageModel({
      responder: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      llm.complete({ system: '', user: '', schema: { type: 'object' }, schemaName: 'X' }),
    ).rejects.toThrow('boom');
    expect(llm.calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- fake-language-model`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the fake**

Create `tests/helpers/fake-language-model.ts`:

```ts
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
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- fake-language-model`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 4: fake LanguageModel test helper"
```

---

## Task 5: LLM interpreter (`llmInterpret`)

**Goal:** A pure async function: `(text, actor, view, inventory, llm) => Promise<Action | null>`. Builds the prompt, invokes the port, validates the response, assembles the engine `Action` (adding `actorId`). Returns `null` for the `unknown`/`invalid` cases.

**Files:**
- Create: `src/core/engine/llm-interpret.ts`
- Test: `src/core/engine/llm-interpret.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/llm-interpret.test.ts`:

```ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { LanguageModelResponse } from '@core/engine/language-model';
import { makeFakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { describe, expect, it } from 'vitest';
import { llmInterpret } from './llm-interpret';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const tavern: Location = {
  id: A,
  worldId: W,
  label: 'Tavern',
  shortDescription: '',
  longDescription: '',
};
const paff: Agent = {
  id: asAgentId('char_p'),
  worldId: W,
  label: 'Paff',
  shortDescription: '',
  longDescription: '',
  locationId: A,
  hp: 10,
  damage: 0,
  defense: 0,
  capacity: 10,
  mood: null,
  goal: null,
  autonomous: false,
};
const map: Item = {
  id: asItemId('item_map'),
  worldId: W,
  label: 'fire map',
  shortDescription: '',
  longDescription: '',
  owner: { kind: 'location', id: A },
  weight: 1,
  hidden: false,
};
const view = { actor: paff, location: tavern, items: [map], agents: [], exits: [] };

const respond = (parsed: unknown): LanguageModelResponse => ({
  raw: JSON.stringify(parsed),
  parsed,
});

describe('llmInterpret', () => {
  it('returns a move Action with the actor id when the model returns a valid move', async () => {
    const llm = makeFakeLanguageModel({ responder: () => respond({ kind: 'move', direction: 'south' }) });
    const r = await llmInterpret('head south', paff, view, [], llm);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
  });

  it('returns a take Action carrying the model itemRef verbatim', async () => {
    const llm = makeFakeLanguageModel({ responder: () => respond({ kind: 'take', itemRef: 'fire map' }) });
    const r = await llmInterpret('grab the fire map', paff, view, [], llm);
    expect(r).toEqual({ kind: 'take', actorId: paff.id, itemRef: 'fire map' });
  });

  it('returns null on the unknown variant', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'unknown', reason: "can't do combat" }),
    });
    const r = await llmInterpret('attack spark', paff, view, [], llm);
    expect(r).toBeNull();
  });

  it('returns null when the response fails schema validation', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => respond({ kind: 'attack', target: 'spark' }),
    });
    const r = await llmInterpret('attack spark', paff, view, [], llm);
    expect(r).toBeNull();
  });

  it('passes the schema and a non-empty system+user prompt to the port', async () => {
    const llm = makeFakeLanguageModel({ responder: () => respond({ kind: 'inventory' }) });
    await llmInterpret('what am i carrying', paff, view, [], llm);
    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    expect(call?.schemaName).toBe('PlayerActionResponse');
    expect(call?.system.length ?? 0).toBeGreaterThan(0);
    expect(call?.user).toContain('what am i carrying');
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- llm-interpret`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interpreter**

Create `src/core/engine/llm-interpret.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import type { LanguageModel } from './language-model';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';
import {
  PLAYER_ACTION_SCHEMA,
  PLAYER_ACTION_SCHEMA_NAME,
  validatePlayerAction,
} from './llm-output';
import type { PerceptionView } from './perception';

export async function llmInterpret(
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
  llm: LanguageModel,
): Promise<Action | null> {
  const response = await llm.complete({
    system: buildSystemPrompt(),
    user: buildUserPrompt(text, actor, view, inventory),
    schema: PLAYER_ACTION_SCHEMA,
    schemaName: PLAYER_ACTION_SCHEMA_NAME,
  });
  const validated = validatePlayerAction(response.parsed);
  switch (validated.kind) {
    case 'move':
      return { kind: 'move', actorId: actor.id, direction: validated.direction };
    case 'look':
      return { kind: 'look', actorId: actor.id, targetRef: validated.targetRef };
    case 'take':
      return { kind: 'take', actorId: actor.id, itemRef: validated.itemRef };
    case 'drop':
      return { kind: 'drop', actorId: actor.id, itemRef: validated.itemRef };
    case 'inventory':
      return { kind: 'inventory', actorId: actor.id };
    case 'unknown':
    case 'invalid':
      return null;
  }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- llm-interpret`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 5: llmInterpret — prompt + validate + assemble Action"
```

---

## Task 6: Composite parser

**Goal:** The `parser/composite.ts` module that wraps the rule-based parser and the optional LLM. Same input shape as `parse`, but `Promise<ParseResult>`. Five paths: rule-success, rule-fail-llm-success, rule-fail-llm-unknown, rule-fail-llm-throws, rule-fail-no-llm. Falls back on `unknown_verb`, `no_such_target`, `unknown_direction`, `missing_argument`. Does **not** fall back on `empty` or `ambiguous_target`.

**Files:**
- Create: `src/core/engine/parser/composite.ts`
- Test: `src/core/engine/parser/composite.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/parser/composite.test.ts`:

```ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { makeFakeLanguageModel } from '../../../../tests/helpers/fake-language-model';
import { describe, expect, it } from 'vitest';
import { makeCompositeParser } from './composite';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const tavern: Location = {
  id: A, worldId: W, label: 'Tavern', shortDescription: '', longDescription: '',
};
const paff: Agent = {
  id: asAgentId('char_p'), worldId: W, label: 'Paff',
  shortDescription: '', longDescription: '',
  locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10,
  mood: null, goal: null, autonomous: false,
};
const map: Item = {
  id: asItemId('item_map'), worldId: W, label: 'fire map',
  shortDescription: '', longDescription: '',
  owner: { kind: 'location', id: A }, weight: 1, hidden: false,
};
const view = { actor: paff, location: tavern, items: [map], agents: [], exits: [] };

describe('makeCompositeParser', () => {
  it('returns the rule-based result and never calls the LLM on rule success', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '{}', parsed: {} }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('south', paff, view, []);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
    expect(llm.calls).toHaveLength(0);
  });

  it('falls back to the LLM on unknown_verb and returns the assembled Action', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"move","direction":"south"}',
        parsed: { kind: 'move', direction: 'south' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('head south', paff, view, []);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
    expect(llm.calls).toHaveLength(1);
  });

  it('returns the original rule-based ParseError when the LLM returns unknown', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"unknown","reason":"x"}',
        parsed: { kind: 'unknown', reason: 'x' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('frobnicate', paff, view, []);
    expect(r).toEqual({ kind: 'unknown_verb', verb: 'frobnicate' });
  });

  it('returns the original rule-based ParseError when the LLM throws', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => {
        throw new Error('network down');
      },
    });
    const parse = makeCompositeParser({ llm });
    const r = await parse('frobnicate', paff, view, []);
    expect(r).toEqual({ kind: 'unknown_verb', verb: 'frobnicate' });
  });

  it('returns the original rule-based ParseError when no LLM is configured', async () => {
    const parse = makeCompositeParser({ llm: null });
    const r = await parse('frobnicate', paff, view, []);
    expect(r).toEqual({ kind: 'unknown_verb', verb: 'frobnicate' });
  });

  it('does not call the LLM on empty input', async () => {
    const llm = makeFakeLanguageModel({ responder: () => ({ raw: '{}', parsed: {} }) });
    const parse = makeCompositeParser({ llm });
    const r = await parse('   ', paff, view, []);
    expect(r).toEqual({ kind: 'empty' });
    expect(llm.calls).toHaveLength(0);
  });

  it('does not call the LLM on ambiguous_target (rules already understood)', async () => {
    const llm = makeFakeLanguageModel({ responder: () => ({ raw: '{}', parsed: {} }) });
    const parse = makeCompositeParser({ llm });
    // Force an ambiguous_target by injecting a stub rule parser via the deps overload.
    const ambiguous = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'ambiguous_target', ref: 'map', candidates: ['fire map', 'star map'] }),
    });
    const r = await ambiguous('map', paff, view, []);
    expect(r.kind).toBe('ambiguous_target');
    expect(llm.calls).toHaveLength(0);
  });

  it('falls back on no_such_target', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"take","itemRef":"fire map"}',
        parsed: { kind: 'take', itemRef: 'fire map' },
      }),
    });
    const parse = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'no_such_target', ref: 'fire map' }),
    });
    const r = await parse('grab fire map', paff, view, []);
    expect(r).toEqual({ kind: 'take', actorId: paff.id, itemRef: 'fire map' });
  });

  it('falls back on unknown_direction', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"move","direction":"south"}',
        parsed: { kind: 'move', direction: 'south' },
      }),
    });
    const parse = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'unknown_direction', raw: 'out the south door' }),
    });
    const r = await parse('go out the south door', paff, view, []);
    expect(r).toEqual({ kind: 'move', actorId: paff.id, direction: 'south' });
  });

  it('falls back on missing_argument', async () => {
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"inventory"}',
        parsed: { kind: 'inventory' },
      }),
    });
    const parse = makeCompositeParser({
      llm,
      ruleParse: () => ({ kind: 'missing_argument', verb: 'take' }),
    });
    const r = await parse('take', paff, view, []);
    expect(r).toEqual({ kind: 'inventory', actorId: paff.id });
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- composite`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composite parser**

Create `src/core/engine/parser/composite.ts`:

```ts
import type { ParseError } from '@core/domain/actions';
import type { Agent, Item } from '@core/domain/entities';
import type { LanguageModel } from '../language-model';
import { llmInterpret } from '../llm-interpret';
import { type ParseResult, parse as ruleParseDefault } from '../parser';
import type { PerceptionView } from '../perception';

export type RuleParse = (
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
) => ParseResult;

export type ParseFn = (
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
) => Promise<ParseResult>;

export interface CompositeParserDeps {
  readonly llm: LanguageModel | null;
  readonly ruleParse?: RuleParse;
}

const FALLBACK_KINDS: ReadonlySet<ParseError['kind']> = new Set([
  'unknown_verb',
  'no_such_target',
  'unknown_direction',
  'missing_argument',
]);

const shouldFallback = (e: ParseError): boolean => FALLBACK_KINDS.has(e.kind);

export function makeCompositeParser(deps: CompositeParserDeps): ParseFn {
  const ruleParse = deps.ruleParse ?? ruleParseDefault;
  return async function parse(text, actor, view, inventory) {
    const ruleResult = ruleParse(text, actor, view, inventory);
    if ('actorId' in ruleResult) return ruleResult;
    if (!shouldFallback(ruleResult)) return ruleResult;
    if (!deps.llm) return ruleResult;
    try {
      const action = await llmInterpret(text, actor, view, inventory, deps.llm);
      return action ?? ruleResult;
    } catch {
      return ruleResult;
    }
  };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- composite`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 6: composite parser (rule-first, LLM on ParseError fallback)"
```

---

## Task 7: Inject `parse` into `runTurn`

**Goal:** `runTurn` accepts an optional `parse` function. When omitted, it falls back to the slice-1 rule-based `parse` wrapped to return a `Promise`. This keeps the existing `turn.test.ts` (3 tests, calling `runTurn(actor, text, repo)`) green.

**Files:**
- Modify: `src/core/engine/turn.ts`
- Test: `src/core/engine/turn.test.ts` (add new test, do not modify the 3 existing ones)

- [ ] **Step 1: Failing test for the injected parse path**

Append to `src/core/engine/turn.test.ts` (do not touch the existing 3 `it` blocks):

```ts
import type { ParseFn } from './parser/composite';
// (other imports already present)

describe('runTurn with injected parse', () => {
  it('uses the injected parse function instead of the default rule-based parser', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA],
      exits: [],
      items: [],
      agents: [paff],
    });
    // The injected parser is what determines the action — text is irrelevant here.
    const fakeParse: ParseFn = async () => ({ kind: 'inventory', actorId: paff.id });
    const r = await runTurn(paff.id, 'literal-garbage', repo, fakeParse);
    expect(r.render.toLowerCase()).toContain('carrying');
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- turn`
Expected: FAIL — `runTurn` does not accept a 4th argument.

- [ ] **Step 3: Modify `runTurn` to accept an optional `parse`**

Modify `src/core/engine/turn.ts`:

```ts
import type { DomainEvent } from '@core/domain/events';
import type { AgentId } from '@core/domain/ids';
import { dispatch } from './actions/registry';
import { parse as ruleParse } from './parser';
import { perceive } from './perception';
import type { ParseFn } from './parser/composite';
import type { Repository } from './repository';
import { renderActionError, renderParseError } from './templates';

export interface TurnResult {
  readonly render: string;
  readonly events: readonly DomainEvent[];
}

const defaultParse: ParseFn = async (text, actor, view, inventory) =>
  ruleParse(text, actor, view, inventory);

export async function runTurn(
  actorId: AgentId,
  text: string,
  repo: Repository,
  parse: ParseFn = defaultParse,
): Promise<TurnResult> {
  const actor = await repo.getAgent(actorId);
  const view = await perceive(actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: actorId });

  const parsed = await parse(text, actor, view, inventory);
  if (!('actorId' in parsed)) {
    return { render: renderParseError(parsed), events: [] };
  }

  const r = await dispatch(parsed, repo);
  if (!r.ok) {
    return { render: renderActionError(r.error), events: [] };
  }
  return { render: r.value.render, events: [r.value.event] };
}
```

- [ ] **Step 4: Run — verify pass + previous tests still pass**

Run: `pnpm test -- turn`
Expected: PASS, 4 tests (3 original + 1 new).

Run: `pnpm test`
Expected: every previously passing test still passes (unchanged in count, unchanged in content for slice 1).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 7: runTurn accepts optional injected parse fn (default = rule-based)"
```

---

## Task 8: Composite + real engine integration test

**Goal:** End-to-end test of the full pipeline using `runTurn` with the composite parser, an in-memory repo, and a fake `LanguageModel`. Demonstrates that LLM-resolved actions execute the same dispatch/render path as rule-based ones.

**Files:**
- Create: `tests/integration/composite-turn.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/integration/composite-turn.test.ts`:

```ts
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTurn } from '@core/engine/turn';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { makeFakeLanguageModel } from '../helpers/fake-language-model';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = { id: A, worldId: W, label: 'Tavern', shortDescription: '', longDescription: 'A tavern.' };
const locB: Location = { id: B, worldId: W, label: 'Street', shortDescription: '', longDescription: 'A street.' };
const door: Exit = { id: asExitId('e'), worldId: W, from: A, to: B, direction: 'south', label: 'south door', locked: false, lockedByItem: null };
const map: Item = { id: asItemId('item_map'), worldId: W, label: 'fire map', shortDescription: '', longDescription: '', owner: { kind: 'location', id: A }, weight: 1, hidden: false };
const paff: Agent = { id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false };

describe('composite parser through runTurn', () => {
  it('runs an LLM-resolved take through the full pipeline', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [door], items: [map], agents: [paff] });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"take","itemRef":"fire map"}',
        parsed: { kind: 'take', itemRef: 'fire map' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'grab the fire map off the table', repo, parse);
    expect(r.render.toLowerCase()).toBe('taken: fire map.');
    expect(r.events).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
  });

  it('runs an LLM-resolved move through the full pipeline', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [door], items: [], agents: [paff] });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"move","direction":"south"}',
        parsed: { kind: 'move', direction: 'south' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'head out the south door', repo, parse);
    expect(r.render).toBe('You go south.');
    expect(r.events).toHaveLength(1);
  });

  it('preserves the rule-based ParseError message when the LLM returns unknown', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [paff] });
    const llm = makeFakeLanguageModel({
      responder: () => ({
        raw: '{"kind":"unknown","reason":"combat not supported"}',
        parsed: { kind: 'unknown', reason: 'combat not supported' },
      }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'do a backflip', repo, parse);
    expect(r.render.toLowerCase()).toContain('backflip');
    // No mention of combat, no mention of LLM apology.
    expect(r.render.toLowerCase()).not.toContain('combat');
  });

  it('never calls the LLM when the rule-based parser succeeds', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [door], items: [], agents: [paff] });
    const llm = makeFakeLanguageModel({
      responder: () => ({ raw: '{}', parsed: {} }),
    });
    const parse = makeCompositeParser({ llm });
    const r = await runTurn(paff.id, 'south', repo, parse);
    expect(r.render).toBe('You go south.');
    expect(llm.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify it fails before implementation, passes now**

Run: `pnpm test -- composite-turn`
Expected: PASS, 4 tests (everything wired up by Task 7).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Task 8: composite-turn integration test (fake LLM, real engine)"
```

---

## Task 9: `openai` dependency, `.env.example`, vitest exclusion glob

**Goal:** Pull in the SDK, document env vars (including the Ollama hint), and configure vitest to exclude smoke tests from the default `pnpm test` run.

**Files:**
- Modify: `package.json` (add `openai` runtime dep, add `test:llm` script)
- Create: `.env.example`
- Modify: `vitest.config.ts` (exclude `*.smoke.test.ts`)

- [ ] **Step 1: Add `openai` and `test:llm` script**

Modify `package.json` `dependencies`:

```jsonc
{
  // ...
  "dependencies": {
    "@tanstack/react-router": "^1.169.0",
    "@tanstack/react-start": "^1.167.0",
    "better-sqlite3": "^11.10.0",
    "drizzle-orm": "^0.38.0",
    "openai": "^4.77.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

Add to `package.json` `scripts`:

```jsonc
{
  "scripts": {
    // ... existing scripts unchanged ...
    "test:llm": "vitest run tests/integration/openai-smoke.test.ts"
  }
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updated, `openai` resolved.

- [ ] **Step 3: Create `.env.example`**

Create `.env.example`:

```
# OpenAI-compatible language model used by the LLM interpreter (slice 2).
# When OPENAI_API_KEY is unset, the LLM fallback is disabled and the game
# behaves identically to slice 1 (rule-based parser only).

OPENAI_API_KEY=
# Optional. Defaults to gpt-4o-mini.
OPENAI_MODEL=gpt-4o-mini
# Optional. Override to point at a compatible server (e.g. Ollama: http://localhost:11434/v1).
OPENAI_BASE_URL=
```

- [ ] **Step 4: Exclude smoke tests from the default vitest run**

Modify `vitest.config.ts`:

```ts
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.smoke.test.ts'],
    environment: 'node',
  },
});
```

(If the existing config already has an `exclude`, merge the `*.smoke.test.ts` glob in.)

- [ ] **Step 5: Verify slice 1 tests still pass**

Run: `pnpm test`
Expected: all previously passing tests still pass; no smoke tests run.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Task 9: add openai dep, .env.example, smoke-test exclusion"
```

---

## Task 10: OpenAI `LanguageModel` adapter

**Goal:** The single place `import OpenAI from 'openai'` appears. Reads env, issues one non-streaming chat completion with `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`. One retry on transport/parse failure; throws on second failure or schema-mismatch. Tests live alongside, mocking the SDK module.

**Files:**
- Create: `src/infra/language-model/openai.ts`
- Test: `src/infra/language-model/openai.test.ts`

- [ ] **Step 1: Failing test (mocked SDK)**

Create `src/infra/language-model/openai.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
    constructor(_: unknown) {}
  },
}));

import { makeOpenAILanguageModel } from './openai';

beforeEach(() => {
  create.mockReset();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
});

describe('makeOpenAILanguageModel', () => {
  it('returns null when OPENAI_API_KEY is unset', () => {
    expect(makeOpenAILanguageModel()).toBeNull();
  });

  it('builds a request with the provided system, user, and json_schema', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '{"kind":"inventory"}' } }],
    });
    const llm = makeOpenAILanguageModel();
    expect(llm).not.toBeNull();
    const r = await llm!.complete({
      system: 'sys',
      user: 'usr',
      schema: { type: 'object', additionalProperties: false, required: ['kind'] },
      schemaName: 'X',
    });
    expect(r.parsed).toEqual({ kind: 'inventory' });
    expect(r.raw).toBe('{"kind":"inventory"}');
    const call = create.mock.calls[0]?.[0];
    expect(call.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(call.messages[1]).toEqual({ role: 'user', content: 'usr' });
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.json_schema.name).toBe('X');
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.model).toBe('gpt-4o-mini');
  });

  it('honours OPENAI_MODEL', async () => {
    process.env.OPENAI_API_KEY = 'k';
    process.env.OPENAI_MODEL = 'llama3.1';
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '{"kind":"inventory"}' } }],
    });
    await makeOpenAILanguageModel()!.complete({
      system: 's', user: 'u', schema: { type: 'object' }, schemaName: 'X',
    });
    expect(create.mock.calls[0]?.[0].model).toBe('llama3.1');
  });

  it('retries once on transport failure and succeeds on the second attempt', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"kind":"inventory"}' } }] });
    const r = await makeOpenAILanguageModel()!.complete({
      system: 's', user: 'u', schema: { type: 'object' }, schemaName: 'X',
    });
    expect(r.parsed).toEqual({ kind: 'inventory' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws when both attempts fail', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create.mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      makeOpenAILanguageModel()!.complete({
        system: 's', user: 'u', schema: { type: 'object' }, schemaName: 'X',
      }),
    ).rejects.toThrow('ECONNRESET');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws when the response message content is not parseable JSON (after retry)', async () => {
    process.env.OPENAI_API_KEY = 'k';
    create.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    await expect(
      makeOpenAILanguageModel()!.complete({
        system: 's', user: 'u', schema: { type: 'object' }, schemaName: 'X',
      }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- infra/language-model`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

Create `src/infra/language-model/openai.ts`:

```ts
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
  if (!cfg) return null;
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
  };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- infra/language-model`
Expected: PASS, 6 tests.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Verify the engine layer never imports `openai`**

Run:

```bash
grep -rn "from 'openai'" src/core/ tests/
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Task 10: OpenAILanguageModel adapter (env-driven, one retry)"
```

---

## Task 11: Wire the composite parser through the composition root

**Goal:** `app/server/world.ts` builds the composite parser once, exporting it alongside `getRepo`. `app/server/submit.ts` and `app/server/initial-view.ts` pass it into `runTurn`. With no `OPENAI_API_KEY`, behaviour is identical to slice 1.

**Files:**
- Modify: `app/server/world.ts`
- Modify: `app/server/submit.ts`
- Modify: `app/server/initial-view.ts`

- [ ] **Step 1: Modify `app/server/world.ts`**

Modify `app/server/world.ts`:

```ts
import { type AgentId, asAgentId } from '@core/domain/ids';
import { makeCompositeParser, type ParseFn } from '@core/engine/parser/composite';
import { type DbHandle, openDb } from '@infra/db';
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import { BURNING_DISTRICT_WORLD_ID, seedIfEmpty } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';
export const PLAYER_ID: AgentId = asAgentId('char_39322'); // Paff Pinkerton

let handle: DbHandle | null = null;
let parseFn: ParseFn | null = null;

export async function getRepo(): Promise<SqliteRepository> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db);
  }
  return new SqliteRepository(handle.db, BURNING_DISTRICT_WORLD_ID);
}

export function getParse(): ParseFn {
  if (!parseFn) {
    const llm = makeOpenAILanguageModel(); // null when OPENAI_API_KEY unset
    parseFn = makeCompositeParser({ llm });
  }
  return parseFn;
}
```

- [ ] **Step 2: Modify `app/server/submit.ts`**

In `app/server/submit.ts`, replace the `runTurn(PLAYER_ID, data.text, repo)` call with:

```ts
import { getParse, getRepo, PLAYER_ID } from './world';
// ...
const repo = await getRepo();
const parse = getParse();
const result = await runTurn(PLAYER_ID, data.text, repo, parse);
```

- [ ] **Step 3: Modify `app/server/initial-view.ts`**

In `app/server/initial-view.ts`, replace the `runTurn(PLAYER_ID, 'look', repo)` call with:

```ts
import { getParse, getRepo, PLAYER_ID } from './world';
// ...
const repo = await getRepo();
const parse = getParse();
const result = await runTurn(PLAYER_ID, 'look', repo, parse);
```

(The initial view always succeeds at the rule-based stage, so the LLM is never invoked here regardless of env.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck PASS; all tests pass — including `tests/integration/full-flow.test.ts` (unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 11: composition root builds composite parser, threads it through runTurn"
```

---

## Task 12: Smoke test against a real OpenAI endpoint (gated)

**Goal:** A single integration test that sends a real network request when `OPENAI_API_KEY` is present. Skipped when the key is absent. Excluded from `pnpm test` by the `*.smoke.test.ts` glob added in Task 9. Invoked via `pnpm test:llm`.

**Files:**
- Create: `tests/integration/openai-smoke.test.ts`

- [ ] **Step 1: Create the smoke test**

Create `tests/integration/openai-smoke.test.ts`:

```ts
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import {
  PLAYER_ACTION_SCHEMA,
  PLAYER_ACTION_SCHEMA_NAME,
  validatePlayerAction,
} from '@core/engine/llm-output';
import { describe, expect, it } from 'vitest';

const hasKey = typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0;
const maybe = hasKey ? describe : describe.skip;

maybe('OpenAI smoke (live, gated on OPENAI_API_KEY)', () => {
  it('maps "head south" to a valid move action', async () => {
    const llm = makeOpenAILanguageModel();
    expect(llm).not.toBeNull();
    const r = await llm!.complete({
      system: 'You map player input to one of: move, look, take, drop, inventory, unknown. Return JSON matching the schema. Use unknown if uncertain.',
      user: 'Player input: "head south"\nVisible items: none\nExits: south\nInventory: empty',
      schema: PLAYER_ACTION_SCHEMA,
      schemaName: PLAYER_ACTION_SCHEMA_NAME,
    });
    const validated = validatePlayerAction(r.parsed);
    expect(['move', 'unknown']).toContain(validated.kind);
    if (validated.kind === 'move') {
      expect(validated.direction).toBe('south');
    }
  }, 30_000);

  it('maps "what am I carrying?" to an inventory action', async () => {
    const llm = makeOpenAILanguageModel();
    const r = await llm!.complete({
      system: 'You map player input to one of: move, look, take, drop, inventory, unknown. Return JSON matching the schema.',
      user: 'Player input: "what am I carrying?"\nVisible items: none\nExits: none\nInventory: empty',
      schema: PLAYER_ACTION_SCHEMA,
      schemaName: PLAYER_ACTION_SCHEMA_NAME,
    });
    const validated = validatePlayerAction(r.parsed);
    expect(validated.kind).toBe('inventory');
  }, 30_000);
});
```

- [ ] **Step 2: Verify it is skipped under the default test command**

Run: `pnpm test`
Expected: smoke test does not appear in output (filename excluded by glob).

Run with no key: `OPENAI_API_KEY= pnpm test:llm`
Expected: smoke `describe` block reports as skipped.

- [ ] **Step 3: Optional manual verification with a real key**

Run: `OPENAI_API_KEY=sk-... pnpm test:llm`
Expected: 2 tests pass. (Manual; not part of CI.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Task 12: gated OpenAI smoke test (pnpm test:llm)"
```

---

## Task 13: Acceptance — full suite, lint, typecheck, no SDK leakage

**Goal:** Final verification that every spec acceptance criterion holds. Run the trio. Greppable check that `core/` and `core/domain/` are SDK-free. Confirm slice 1's tests are unchanged in count and content.

**Files:** None.

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all tests pass. The three slice 1 integration tests in `tests/integration/full-flow.test.ts` are present and green; the four slice 1 unit-test files (parser, perception, templates, turn — turn now has 4 tests instead of 3) plus action-handler tests still pass; new tests from this slice (Tasks 1–6, 8, 10) all pass.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: SDK-leakage check**

Run:

```bash
grep -rn "from 'openai'" src/core/ tests/
```

Expected: zero matches.

Run:

```bash
grep -rn "from 'openai'" src/
```

Expected: exactly one match in `src/infra/language-model/openai.ts`.

- [ ] **Step 5: Slice 1 test integrity**

Confirm:
- `tests/integration/full-flow.test.ts` is byte-identical to its slice 1 form.
- `src/core/engine/parser.test.ts`, `src/core/engine/perception.test.ts`, `src/core/engine/templates.test.ts`, action-handler tests under `src/core/engine/actions/` are unchanged.
- `src/core/engine/turn.test.ts` retains its three original `it` blocks unmodified; the only change is one appended `describe('runTurn with injected parse')` block from Task 7.

Run: `git log --oneline src/core/engine/parser.ts` (after the slice has been committed) — confirm the file has only its slice 1 commit, not modified by slice 2.

- [ ] **Step 6: Behavioural acceptance (manual, against running app)**

With `OPENAI_API_KEY` unset:
- `pnpm dev`, type `head south` at the Flaming Goblet → see slice 1 unknown-verb message. No network call attempted.

With `OPENAI_API_KEY` set to a valid key:
- `pnpm dev`, type `head south` → Paff moves south to the Dockside Markets.
- Type `grab the fire map` → fire map enters Paff's inventory.
- Type `do a backflip` → see the slice 1 unknown-verb message verbatim. No LLM apology reaches the screen.

With Ollama (manual): set `OPENAI_BASE_URL=http://localhost:11434/v1` and `OPENAI_MODEL=<some-local-structured-output-model>`; same three checks succeed.

- [ ] **Step 7: Final commit (only if anything changed)**

If any test output, lint output, or doc adjustment was needed during acceptance, commit the fix. Otherwise no commit needed.

```bash
git add -A
git commit -m "Task 13: acceptance — full suite green, no SDK leakage outside infra"
```

---

## Summary of new/modified files

```
imagined-dungeons/
├── .env.example                                                 (NEW)
├── package.json                                                  (MODIFIED — openai dep, test:llm script)
├── vitest.config.ts                                              (MODIFIED — exclude *.smoke.test.ts)
├── docs/superpowers/plans/
│   └── 2026-05-06-llm-interpreter.md                             (this file)
├── src/core/engine/
│   ├── language-model.ts                                         (NEW — port + JsonSchema)
│   ├── llm-output.ts                                             (NEW — schema + validator)
│   ├── llm-output.test.ts                                        (NEW)
│   ├── llm-prompt.ts                                             (NEW — buildSystemPrompt + buildUserPrompt)
│   ├── llm-prompt.test.ts                                        (NEW)
│   ├── llm-interpret.ts                                          (NEW)
│   ├── llm-interpret.test.ts                                     (NEW)
│   ├── language-model.test.ts                                    (NEW)
│   ├── parser/
│   │   ├── composite.ts                                          (NEW)
│   │   └── composite.test.ts                                     (NEW)
│   ├── parser.ts                                                 (UNCHANGED)
│   ├── turn.ts                                                   (MODIFIED — optional injected parse)
│   └── turn.test.ts                                              (MODIFIED — appended describe block only)
├── src/infra/language-model/
│   ├── openai.ts                                                 (NEW)
│   └── openai.test.ts                                            (NEW)
├── app/server/
│   ├── world.ts                                                  (MODIFIED — getParse())
│   ├── submit.ts                                                 (MODIFIED — pass parse)
│   └── initial-view.ts                                           (MODIFIED — pass parse)
├── tests/helpers/
│   ├── fake-language-model.ts                                    (NEW)
│   └── fake-language-model.test.ts                               (NEW)
└── tests/integration/
    ├── composite-turn.test.ts                                    (NEW)
    ├── openai-smoke.test.ts                                      (NEW — gated, excluded from default)
    └── full-flow.test.ts                                         (UNCHANGED)
```

Untouched: `src/core/domain/`, `src/core/engine/parser.ts`, `src/core/engine/perception.ts`, `src/core/engine/templates.ts`, `src/core/engine/actions/`, `src/infra/memory-repository.ts`, `src/infra/sqlite-repository.ts`, `src/infra/db.ts`, `src/infra/seed/`, the Drizzle schema and migrations, all routes and components.
