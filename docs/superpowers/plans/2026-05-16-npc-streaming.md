# NPC Turn Progressive Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream each NPC turn result to the client as it completes, so the player sees actions immediately rather than waiting for all NPCs to finish.

**Architecture:** Add an optional `onChunk` callback to `RunTickOptions` that fires after the player turn and after each NPC turn with visible witness output. A new TanStack Start server route at `/api/stream-command` calls `runTick` with this callback and writes SSE chunks to a `ReadableStream`. The client replaces the `submitCommand` call with a `fetch`-based SSE consumer that renders chunks incrementally.

**Tech Stack:** TypeScript, Vitest, TanStack Start (`createFileRoute` server property), React

**Spec:** `docs/superpowers/specs/2026-05-16-npc-streaming-design.md`

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `src/core/engine/tick-stream-types.ts` | **Create** | `TickChunkKind`, `PlayerTurnChunk`, `NpcTurnChunk` |
| `src/core/engine/tick-stream-types.test.ts` | **Create** | Wire-protocol stability tests for `TickChunkKind` |
| `src/core/engine/tick.ts` | **Modify** | Add `onChunk` to `RunTickOptions`; call it in player turn and NPC loop |
| `src/core/engine/tick.test.ts` | **Modify** | Tests for `onChunk` emission |
| `app/routes/api/stream-command.ts` | **Create** | `CompleteChunk`, `ErrorChunk`, `TickStreamChunk`; SSE server route |
| `app/routes/index.tsx` | **Modify** | `LineKind` const; replace `submitCommand` with SSE `fetch` consumer |

---

## Task 1: Core chunk types

**Files:**
- Create: `src/core/engine/tick-stream-types.ts`
- Create: `src/core/engine/tick-stream-types.test.ts`

- [ ] **Step 1.1: Write the failing test**

```typescript
// src/core/engine/tick-stream-types.test.ts
import { describe, expect, it } from 'vitest';
import { TickChunkKind } from './tick-stream-types';

describe('TickChunkKind', () => {
  it('has stable string values for the SSE wire protocol', () => {
    expect(TickChunkKind.PlayerTurn).toBe('player_turn');
    expect(TickChunkKind.NpcTurn).toBe('npc_turn');
    expect(TickChunkKind.Complete).toBe('complete');
    expect(TickChunkKind.Error).toBe('error');
  });
});
```

- [ ] **Step 1.2: Run test — verify it fails**

```
npm test src/core/engine/tick-stream-types.test.ts
```

Expected: `Cannot find module './tick-stream-types'`

- [ ] **Step 1.3: Create the types file**

```typescript
// src/core/engine/tick-stream-types.ts
import { type Segment } from '@core/domain/segments';

export const TickChunkKind = {
  PlayerTurn: 'player_turn',
  NpcTurn:    'npc_turn',
  Complete:   'complete',
  Error:      'error',
} as const;
export type TickChunkKind = (typeof TickChunkKind)[keyof typeof TickChunkKind];

export type PlayerTurnChunk = {
  kind: typeof TickChunkKind.PlayerTurn;
  render: readonly Segment[];
  witnessed: readonly string[];
};

export type NpcTurnChunk = {
  kind: typeof TickChunkKind.NpcTurn;
  witnessed: readonly string[];
};
```

- [ ] **Step 1.4: Run test — verify it passes**

```
npm test src/core/engine/tick-stream-types.test.ts
```

Expected: PASS

- [ ] **Step 1.5: Commit**

```
git add src/core/engine/tick-stream-types.ts src/core/engine/tick-stream-types.test.ts
git commit -m "feat(streaming): add core TickChunkKind and PlayerTurnChunk/NpcTurnChunk types"
```

---

## Task 2: Wire `onChunk` into `runTick`

**Files:**
- Modify: `src/core/engine/tick.ts`
- Modify: `src/core/engine/tick.test.ts`

`tick.test.ts` already uses `makeWorld()`, `makeCompositeParser({ llm: null })`, `makeFakeLanguageModel`, and `new LlmGameAI(llm)`. Add new tests within the existing `describe('runTick', ...)` block.

- [ ] **Step 2.1: Write the failing tests**

Add to the bottom of the `describe('runTick', ...)` block in `src/core/engine/tick.test.ts`:

```typescript
import { TickChunkKind, type NpcTurnChunk, type PlayerTurnChunk } from './tick-stream-types';

// (add inside the existing describe block)

it('onChunk: emits player_turn chunk first', async () => {
  const repo = makeWorld(); // player + Spark
  const chunks: Array<PlayerTurnChunk | NpcTurnChunk> = [];
  const llm = makeFakeLanguageModel({ textResponder: () => 'go north' });
  const parse = makeCompositeParser({ llm: null });
  await runTick(PLAYER, 'look', repo, {
    parse,
    ai: new LlmGameAI(llm),
    onChunk: (c) => chunks.push(c),
  });
  expect(chunks[0]?.kind).toBe(TickChunkKind.PlayerTurn);
  expect(chunks[0] as PlayerTurnChunk).toMatchObject({ render: expect.any(Array) });
});

it('onChunk: emits one npc_turn chunk per NPC that produces a visible action', async () => {
  const repo = makeWorld(); // player + Spark (autonomous)
  const chunks: Array<PlayerTurnChunk | NpcTurnChunk> = [];
  const llm = makeFakeLanguageModel({ textResponder: () => 'go north' });
  const parse = makeCompositeParser({ llm: null });
  await runTick(PLAYER, 'look', repo, {
    parse,
    ai: new LlmGameAI(llm),
    onChunk: (c) => chunks.push(c),
  });
  const npcChunks = chunks.filter((c) => c.kind === TickChunkKind.NpcTurn);
  expect(npcChunks).toHaveLength(1); // Spark moved north → one witnessed event
});

it('onChunk: emits no npc_turn chunks when no NPCs are visible', async () => {
  const repo = makeWorld([player]); // player only
  const chunks: Array<PlayerTurnChunk | NpcTurnChunk> = [];
  const parse = makeCompositeParser({ llm: null });
  await runTick(PLAYER, 'look', repo, {
    parse,
    ai: null,
    onChunk: (c) => chunks.push(c),
  });
  expect(chunks).toHaveLength(1);
  expect(chunks[0].kind).toBe(TickChunkKind.PlayerTurn);
});

it('onChunk: is optional — runTick works without it', async () => {
  const repo = makeWorld();
  const parse = makeCompositeParser({ llm: null });
  await expect(runTick(PLAYER, 'look', repo, { parse, ai: null })).resolves.toBeTruthy();
});
```

- [ ] **Step 2.2: Run tests — verify they fail**

```
npm test src/core/engine/tick.test.ts
```

Expected: the four new tests FAIL (import error or property does not exist on `RunTickOptions`).

- [ ] **Step 2.3: Add `onChunk` import to tick.ts**

At the top of `src/core/engine/tick.ts`, add:

```typescript
import { TickChunkKind, type NpcTurnChunk, type PlayerTurnChunk } from './tick-stream-types';
```

- [ ] **Step 2.4: Add `onChunk` to `RunTickOptions`**

In `src/core/engine/tick.ts`, find the `RunTickOptions` interface (around line 100) and add:

```typescript
readonly onChunk?: (chunk: PlayerTurnChunk | NpcTurnChunk) => void;
```

- [ ] **Step 2.5: Emit player turn chunk**

After line 461 (the closing `}` of the `if (isWaitIntent(text))` block, just before the comment `// 3. Scheduler picks NPCs`), add:

```typescript
opts.onChunk?.({
  kind: TickChunkKind.PlayerTurn,
  render: playerRender,
  witnessed: [...witnessed],
});
```

- [ ] **Step 2.6: Emit NPC turn chunks**

In the NPC loop (around line 475), introduce a per-NPC witness accumulator and emit after each NPC's intents complete. The diff covers lines ~475–527:

Before:
```typescript
  for (const npcId of npcIds) {
    // ... eligibility re-check ...
    const intents = ai ? await ai.npcIntent(npcId, repo) : [NpcFallbackIntent];
    for (const intent of intents) {
      // ...
      for (const ev of npcResult.events) {
        events.push(ev);
        npcEvents.push(ev);
        const line = await renderWitnessForPlayer(ev, playerId, repo);
        if (line !== null && line.length > 0) witnessed.push(line);
      }
    }
  }
```

After:
```typescript
  for (const npcId of npcIds) {
    // ... eligibility re-check (unchanged) ...
    const npcWitnessed: string[] = [];
    const intents = ai ? await ai.npcIntent(npcId, repo) : [NpcFallbackIntent];
    for (const intent of intents) {
      // ...
      for (const ev of npcResult.events) {
        events.push(ev);
        npcEvents.push(ev);
        const line = await renderWitnessForPlayer(ev, playerId, repo);
        if (line !== null && line.length > 0) {
          witnessed.push(line);
          npcWitnessed.push(line);
        }
      }
    }
    if (npcWitnessed.length > 0) {
      opts.onChunk?.({ kind: TickChunkKind.NpcTurn, witnessed: npcWitnessed });
    }
  }
```

- [ ] **Step 2.7: Emit spawn narrations as NPC turn chunks**

In the spawn pass block (around lines 554–573), add an `onChunk` call for spawn events the player witnesses and for spawn narrations. Find the two locations:

Location A — inside the spawn event loop, after setting `playerRender` for `AgentSpawned`:
```typescript
  // existing:
  playerRender = [...playerRender, { kind: SegmentKind.Spawn, text }];
  // add:
  opts.onChunk?.({ kind: TickChunkKind.NpcTurn, witnessed: [text] });
```

Location B — after the `for (const line of spawnNarrations) witnessed.push(line)` loop:
```typescript
  for (const line of spawnNarrations) witnessed.push(line);
  // add:
  if (spawnNarrations.length > 0) {
    opts.onChunk?.({ kind: TickChunkKind.NpcTurn, witnessed: spawnNarrations });
  }
```

- [ ] **Step 2.8: Run all tests — verify they pass**

```
npm test src/core/engine/tick.test.ts
```

Expected: all tests PASS (including existing ones — `onChunk` is optional so nothing breaks).

- [ ] **Step 2.9: Run full test suite**

```
npm test
```

Expected: all tests PASS.

- [ ] **Step 2.10: Commit**

```
git add src/core/engine/tick.ts src/core/engine/tick.test.ts
git commit -m "feat(streaming): add onChunk callback to runTick for per-turn streaming"
```

---

## Task 3: SSE server route

**Files:**
- Create: `app/routes/api/stream-command.ts`

TanStack Start server routes use `createFileRoute` with a `server.handlers` property. The handler returns a raw `Response`; returning a `ReadableStream` body with `Content-Type: text/event-stream` gives you SSE.

No unit tests for the route handler — it's thin glue between `runTick` (tested) and the HTTP layer. The behavior is verified end-to-end in Task 4.

- [ ] **Step 3.1: Create the route file**

```typescript
// app/routes/api/stream-command.ts
import { OwnerKind } from '@core/domain/kinds';
import { LlmGameAI, nullGameAI } from '@core/engine/game-ai';
import { runTick } from '@core/engine/tick';
import {
  TickChunkKind,
  type NpcTurnChunk,
  type PlayerTurnChunk,
} from '@core/engine/tick-stream-types';
import { createFileRoute } from '@tanstack/react-router';
import { buildSurroundings, type SurroundingsView } from '~/server/surroundings';
import { getBuilderRepo } from '~/server/admin/repo';
import { PLAYER_ID, getNarratorLlm, getParse, getRepo } from '~/server/world';

export type CompleteChunk = {
  kind: typeof TickChunkKind.Complete;
  inventory: Array<{ id: string; label: string; equipped: boolean }>;
  surroundings: SurroundingsView;
};

export type ErrorChunk = {
  kind: typeof TickChunkKind.Error;
  message: string;
};

export type TickStreamChunk = PlayerTurnChunk | NpcTurnChunk | CompleteChunk | ErrorChunk;

export const Route = createFileRoute('/api/stream-command')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text } = (await request.json()) as { text: string };
        const repo = await getRepo();
        const builderRepo = await getBuilderRepo();
        const parse = getParse();
        const rawLlm = getNarratorLlm();
        const ai = rawLlm ? new LlmGameAI(rawLlm) : nullGameAI;

        const encode = (chunk: TickStreamChunk): Uint8Array =>
          new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);

        const stream = new ReadableStream({
          async start(controller) {
            try {
              await runTick(PLAYER_ID, text, repo, {
                parse,
                ai,
                builderRepo,
                onChunk: (chunk) => controller.enqueue(encode(chunk)),
              });
              const inventoryItems = await repo.itemsOwnedBy({
                kind: OwnerKind.Agent,
                id: PLAYER_ID,
              });
              const surroundings = await buildSurroundings(PLAYER_ID, repo);
              controller.enqueue(
                encode({
                  kind: TickChunkKind.Complete,
                  inventory: inventoryItems.map((i) => ({
                    id: i.id as string,
                    label: i.label,
                    equipped: i.equipped,
                  })),
                  surroundings,
                }),
              );
            } catch (err) {
              controller.enqueue(
                encode({
                  kind: TickChunkKind.Error,
                  message: err instanceof Error ? err.message : 'Tick failed',
                }),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      },
    },
  },
});
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors. If TanStack Start's type system raises issues with `server.handlers`, check that `createFileRoute` is imported from `@tanstack/react-router` (not `@tanstack/react-start`).

- [ ] **Step 3.3: Commit**

```
git add app/routes/api/stream-command.ts
git commit -m "feat(streaming): add SSE server route at /api/stream-command"
```

---

## Task 4: Client streaming consumer

**Files:**
- Modify: `app/routes/index.tsx`

The current `handleSubmit` awaits `submitCommand` and then sets all state at once. Replace it with a `fetch`-based SSE consumer that applies state updates as each chunk arrives.

Also introduce a `LineKind` const to replace the raw string literals `'system'`, `'user'`, `'witnessed'` that the `Line` type currently uses.

- [ ] **Step 4.1: Add `LineKind` const and update `Line` type**

In `app/routes/index.tsx`, find the `Line` type (around line 12):

Before:
```typescript
type Line =
  | { id: number; kind: 'system'; segments: readonly Segment[] }
  | { id: number; kind: 'user' | 'witnessed'; text: string };
```

After:
```typescript
const LineKind = {
  System:   'system',
  User:     'user',
  Witnessed: 'witnessed',
} as const;
type LineKind = (typeof LineKind)[keyof typeof LineKind];

type Line =
  | { id: number; kind: typeof LineKind.System;   segments: readonly Segment[] }
  | { id: number; kind: typeof LineKind.User | typeof LineKind.Witnessed; text: string };
```

- [ ] **Step 4.2: Update all `Line` construction sites to use `LineKind`**

In `app/routes/index.tsx`, replace every raw string literal in `kind:` assignments:

| Old | New |
|---|---|
| `kind: 'system'` | `kind: LineKind.System` |
| `kind: 'user'` | `kind: LineKind.User` |
| `kind: 'witnessed'` | `kind: LineKind.Witnessed` |

Also update `colorFor` (around line 94):
```typescript
// before
const colorFor = (kind: 'user' | 'witnessed'): string => {
  if (kind === 'user') return '#9aff9a';

// after
const colorFor = (kind: typeof LineKind.User | typeof LineKind.Witnessed): string => {
  if (kind === LineKind.User) return '#9aff9a';
```

And the render block (around line 190):
```typescript
// before
if (l.kind === 'system') {
// ...
fontStyle: l.kind === 'witnessed' ? 'italic' : 'normal',

// after
if (l.kind === LineKind.System) {
// ...
fontStyle: l.kind === LineKind.Witnessed ? 'italic' : 'normal',
```

- [ ] **Step 4.3: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.4: Add chunk imports**

At the top of `app/routes/index.tsx`, add:

```typescript
import { TickChunkKind } from '@core/engine/tick-stream-types';
import { type TickStreamChunk } from '../api/stream-command';
```

- [ ] **Step 4.5: Replace `handleSubmit` with the streaming consumer**

Find `handleSubmit` (around line 72) and replace the body:

Before:
```typescript
async function handleSubmit(e: React.FormEvent): Promise<void> {
  e.preventDefault();
  const text = input.trim();
  if (!text || busy) return;
  setBusy(true);
  setLines((ls) => [...ls, { id: idRef.current++, kind: 'user', text: `> ${text}` }]);
  setInput('');
  try {
    const r = await submitCommand({ data: { text } });
    setLines((ls) => {
      const next: Line[] = [...ls, { id: idRef.current++, kind: 'system', segments: r.render }];
      for (const w of r.witnessed) {
        next.push({ id: idRef.current++, kind: 'witnessed', text: w });
      }
      return next;
    });
    if (r.inventory) setInventory(r.inventory);
    if (r.surroundings) setSurroundings(r.surroundings);
  } finally {
    setBusy(false);
  }
}
```

After:
```typescript
async function handleSubmit(e: React.FormEvent): Promise<void> {
  e.preventDefault();
  const text = input.trim();
  if (!text || busy) return;
  setBusy(true);
  setLines((ls) => [...ls, { id: idRef.current++, kind: LineKind.User, text: `> ${text}` }]);
  setInput('');
  try {
    const response = await fetch('/api/stream-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const SSE_PREFIX = 'data: ';
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith(SSE_PREFIX)) continue;
        applyChunk(JSON.parse(line.slice(SSE_PREFIX.length)) as TickStreamChunk);
      }
    }
  } catch (err) {
    setLines((ls) => [
      ...ls,
      {
        id: idRef.current++,
        kind: LineKind.System,
        segments: [{ kind: SegmentKind.Error, text: err instanceof Error ? err.message : 'Unknown error' }],
      },
    ]);
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 4.6: Add `applyChunk` helper**

Add this function immediately after `handleSubmit` in `app/routes/index.tsx`:

```typescript
function applyChunk(chunk: TickStreamChunk): void {
  if (chunk.kind === TickChunkKind.PlayerTurn) {
    setLines((ls) => {
      const next: Line[] = [...ls, { id: idRef.current++, kind: LineKind.System, segments: chunk.render }];
      for (const w of chunk.witnessed) {
        next.push({ id: idRef.current++, kind: LineKind.Witnessed, text: w });
      }
      return next;
    });
  } else if (chunk.kind === TickChunkKind.NpcTurn) {
    if (chunk.witnessed.length === 0) return;
    setLines((ls) => {
      const next = [...ls];
      for (const w of chunk.witnessed) {
        next.push({ id: idRef.current++, kind: LineKind.Witnessed, text: w });
      }
      return next;
    });
  } else if (chunk.kind === TickChunkKind.Complete) {
    setInventory(chunk.inventory);
    setSurroundings(chunk.surroundings);
  } else if (chunk.kind === TickChunkKind.Error) {
    setLines((ls) => [
      ...ls,
      {
        id: idRef.current++,
        kind: LineKind.System,
        segments: [{ kind: SegmentKind.Error, text: chunk.message }],
      },
    ]);
  }
}
```

Note: `applyChunk` closes over `setLines`, `setInventory`, `setSurroundings`, and `idRef` — it must be defined inside the `Page` component function.

- [ ] **Step 4.7: Remove unused `submitCommand` import**

If `submitCommand` is no longer imported anywhere in the file, remove its import line.

- [ ] **Step 4.8: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.9: Run the full test suite**

```
npm test
```

Expected: all tests PASS. (Client code has no unit tests — correctness is verified by running the app.)

- [ ] **Step 4.10: Start the dev server and test manually**

```
npm run dev
```

Open the game in a browser. Submit a command in a location with NPCs. Verify:
1. Player turn output appears immediately
2. NPC witness lines appear one at a time as each NPC finishes
3. Inventory and surroundings update correctly after all NPCs are done
4. Error case: stop the server mid-game, submit a command — verify an error message appears rather than a hang

- [ ] **Step 4.11: Commit**

```
git add app/routes/index.tsx app/routes/api/stream-command.ts
git commit -m "feat(streaming): stream NPC turns progressively to client via SSE"
```

---

## Self-Review Notes

- **Spec coverage:** architecture ✓, chunk types ✓, server changes ✓, client changes ✓, error handling ✓, out-of-scope items (parallel AI calls, streaming narration mid-sentence) excluded ✓
- **Type consistency:** `TickChunkKind` imported from `tick-stream-types` everywhere; `TickStreamChunk` union defined once in the route file and imported by the client
- **Backwards compat:** `onChunk` is optional — all existing callers (tests, submit.ts) unaffected
- **SOLID:** `tick-stream-types.ts` owns the wire types; `tick.ts` owns orchestration; the route owns HTTP/SSE; the client owns rendering — each has one responsibility
- **Known limitation:** spawn render additions to `playerRender` (line 559 of tick.ts) are emitted as `NpcTurnChunk` witness strings in the streaming path. Non-streaming callers (`submitCommand`) continue to receive them as `Segment` objects in `render`. This is a minor display difference in the rare spawn case.
