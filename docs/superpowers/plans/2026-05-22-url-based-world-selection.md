# URL-Based World Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make any live world playable at `/play/<worldId>`, with a world picker at `/`.

**Architecture:** `world.ts` gains a `getWorldContext(db, worldId)` helper that resolves `repo`, `playerId`, and `displayName` from the DB. The game page moves to `/play/$worldId.tsx` and threads `worldId` through the loader and POST body. The root `/` becomes a world picker listing live worlds.

**Tech Stack:** TanStack Start (file-based routing, `createServerFn`), Drizzle ORM, Vitest, better-sqlite3

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `app/server/world.ts` | Add `getWorldContext(db, worldId)`; remove `PLAYER_ID`, `DISPLAY_NAME`, `getRepo()` |
| Create | `app/server/world.test.ts` | Unit tests for `getWorldContext` |
| Modify | `app/server/initial-view.ts` | Accept `worldId` string input |
| Modify | `app/routes/api/stream-command.ts` | Read `worldId` from POST body |
| Create | `app/routes/play/$worldId.tsx` | Game page (moved + updated from `index.tsx`) |
| Create | `app/server/list-live-worlds.ts` | Server fn returning live worlds for the picker |
| Modify | `app/routes/index.tsx` | World picker page |

---

## Task 1: Fix Kitty Drama's missing playerAgentId in the DB

The live world `w_mvavu5oc` has `playerAgentId = NULL`. `getWorldContext` will throw without this.

**Files:**
- No source files changed — direct DB update

- [ ] **Step 1: Update the record**

```bash
sqlite3 ./imagined-dungeons.db \
  "UPDATE worlds SET player_agent_id = 'cat_character' WHERE id = 'w_mvavu5oc';"
```

- [ ] **Step 2: Verify**

```bash
sqlite3 ./imagined-dungeons.db \
  "SELECT id, player_agent_id FROM worlds WHERE id = 'w_mvavu5oc';"
```

Expected output:
```
w_mvavu5oc|cat_character
```

---

## Task 2: Write failing tests for `getWorldContext`

**Files:**
- Create: `app/server/world.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { asWorldId } from '@core/domain/ids';
import { openDb } from '@infra/db';
import { seedIfEmpty } from '@infra/seed/seeder';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@infra/db';
import { getWorldContext } from './world';

describe('getWorldContext', () => {
  let db: DB;
  let close: () => void;

  beforeEach(async () => {
    const h = openDb(':memory:');
    db = h.db;
    close = h.close;
    await seedIfEmpty(db, BURNING_DISTRICT_CAMPAIGN);
  });

  afterEach(() => close());

  it('returns repo, playerId, displayName for a known live world', async () => {
    const ctx = await getWorldContext(db, asWorldId('w_burning_district'));
    expect(ctx.playerId).toBe('char_39322');
    expect(ctx.displayName).toBe('Imagined Dungeons — The Burning District');
    expect(ctx.repo).toBeDefined();
  });

  it('throws for an unknown worldId', async () => {
    await expect(
      getWorldContext(db, asWorldId('w_does_not_exist')),
    ).rejects.toThrow('World not found: w_does_not_exist');
  });

  it('throws when playerAgentId is null', async () => {
    const { eq } = await import('drizzle-orm');
    const schema = await import('@infra/schema');
    await db.update(schema.worlds)
      .set({ playerAgentId: null })
      .where(eq(schema.worlds.id, 'w_burning_district'));

    await expect(
      getWorldContext(db, asWorldId('w_burning_district')),
    ).rejects.toThrow('World has no playerAgentId: w_burning_district');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run app/server/world.test.ts
```

Expected: FAIL — `getWorldContext is not a function` or similar import error.

---

## Task 3: Implement `getWorldContext` in `world.ts`; remove old exports

**Files:**
- Modify: `app/server/world.ts`

- [ ] **Step 1: Replace `world.ts` with the refactored version**

```ts
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import type { AgentId, WorldId } from '@core/domain/ids';
import { asAgentId } from '@core/domain/ids';
import { type LanguageModel } from '@core/engine/language-model';
import { type ParseFn, makeCompositeParser } from '@core/engine/parser/composite';
import { type DB, type DbHandle, openDb } from '@infra/db';
import { makeOpenAILanguageModel } from '@infra/language-model/openai';
import * as schema from '@infra/schema';
import { seedIfEmpty } from '@infra/seed/seeder';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { SqliteRepository } from '@infra/sqlite-repository';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';

let handle: DbHandle | null = null;
let parseFn: ParseFn | null = null;
let llmInstance: LanguageModel | null = null;
let llmInitialised = false;

function getLlm(): LanguageModel | null {
  if (!llmInitialised) {
    llmInstance = makeOpenAILanguageModel();
    llmInitialised = true;
  }
  return llmInstance;
}

export async function getDb(): Promise<DB> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db, BURNING_DISTRICT_CAMPAIGN);
  }
  return handle.db;
}

export function getParse(): ParseFn {
  if (!parseFn) {
    parseFn = makeCompositeParser({ llm: getLlm() });
  }
  return parseFn;
}

export function getNarratorLlm(): LanguageModel | null {
  return getLlm();
}

export async function getWorldContext(
  db: DB,
  worldId: WorldId,
): Promise<{ repo: SqliteRepository; playerId: AgentId; displayName: string }> {
  const rows = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId as string));
  const world = rows[0];
  if (!world) throw new Error(`World not found: ${worldId}`);
  if (!world.playerAgentId) throw new Error(`World has no playerAgentId: ${worldId}`);
  return {
    repo: new SqliteRepository(db, worldId),
    playerId: asAgentId(world.playerAgentId),
    displayName: world.displayName,
  };
}
```

Note: `BURNING_DISTRICT_CAMPAIGN` is still imported for the `seedIfEmpty` boot call. `PLAYER_ID`, `DISPLAY_NAME`, and the no-arg `getRepo()` are gone.

- [ ] **Step 2: Run the new tests**

```bash
npx vitest run app/server/world.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 3: Check for broken imports of removed exports**

```bash
npx tsc --noEmit 2>&1 | grep -E "PLAYER_ID|DISPLAY_NAME|getRepo" | grep -v "^$"
```

Expected: lines mentioning those names in files that still import them. Fix each in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add app/server/world.ts app/server/world.test.ts
git commit -m "refactor(world): add getWorldContext; remove PLAYER_ID/DISPLAY_NAME/getRepo"
```

---

## Task 4: Update `initial-view.ts` to accept a `worldId`

**Files:**
- Modify: `app/server/initial-view.ts`

- [ ] **Step 1: Replace `initial-view.ts`**

```ts
import { OwnerKind } from '@core/domain/kinds';
import { asWorldId } from '@core/domain/ids';
import { runTurn } from '@core/engine/turn';
import { createServerFn } from '@tanstack/react-start';
import { buildSurroundings } from './surroundings';
import { getDb, getParse, getWorldContext } from './world';

export const getInitialView = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown): string => {
    if (typeof d !== 'string') throw new Error('Expected worldId string');
    return d;
  })
  .handler(async ({ data: worldId }) => {
    const db = await getDb();
    const { repo, playerId, displayName } = await getWorldContext(db, asWorldId(worldId));
    const parse = getParse();
    const result = await runTurn(playerId, 'look', repo, parse);
    const inventoryItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: playerId });
    const surroundings = await buildSurroundings(playerId, repo);
    return {
      render: result.render,
      displayName,
      inventory: inventoryItems.map((i) => ({
        id: i.id as string,
        label: i.label,
        equipped: i.equipped,
      })),
      surroundings,
    };
  });
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep "initial-view"
```

Expected: no errors for `initial-view.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/server/initial-view.ts
git commit -m "refactor(initial-view): accept worldId parameter"
```

---

## Task 5: Update `stream-command.ts` to read `worldId` from the POST body

**Files:**
- Modify: `app/routes/api/stream-command.ts`

- [ ] **Step 1: Replace the handler**

```ts
import { OwnerKind } from '@core/domain/kinds';
import { asWorldId } from '@core/domain/ids';
import { LlmGameAI, nullGameAI } from '@core/engine/game-ai';
import { runTick } from '@core/engine/tick';
import {
  TickChunkKind,
  type NpcTurnChunk,
  type PlayerTurnChunk,
} from '@core/engine/tick-stream-types';
import { SqliteNpcDecisionRepository } from '@infra/sqlite-npc-decision-repository';
import { createFileRoute } from '@tanstack/react-router';
import { buildSurroundings, type SurroundingsView } from '~/server/surroundings';
import { getBuilderRepo } from '~/server/admin/repo';
import { getDb, getNarratorLlm, getParse, getWorldContext } from '~/server/world';

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
        const { text, worldId: worldIdRaw } = (await request.json()) as {
          text: string;
          worldId: string;
        };
        const db = await getDb();
        const { repo, playerId } = await getWorldContext(db, asWorldId(worldIdRaw));
        const builderRepo = await getBuilderRepo();
        const decisionRepo = new SqliteNpcDecisionRepository(db);
        const parse = getParse();
        const rawLlm = getNarratorLlm();
        const ai = rawLlm ? new LlmGameAI(rawLlm) : nullGameAI;

        const encode = (chunk: TickStreamChunk): Uint8Array =>
          new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);

        const stream = new ReadableStream({
          async start(controller) {
            try {
              await runTick(playerId, text, repo, {
                parse,
                ai,
                builderRepo,
                decisionRepo,
                onChunk: (chunk) => controller.enqueue(encode(chunk)),
              });
              const inventoryItems = await repo.itemsOwnedBy({
                kind: OwnerKind.Agent,
                id: playerId,
              });
              const surroundings = await buildSurroundings(playerId, repo);
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
            Connection: 'keep-alive',
          },
        });
      },
    },
  },
});
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit 2>&1 | grep "stream-command"
```

Expected: no errors for `stream-command.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api/stream-command.ts
git commit -m "refactor(stream-command): resolve world context from worldId in request body"
```

---

## Task 6: Create the game page at `/play/$worldId`

**Files:**
- Create: `app/routes/play/$worldId.tsx`

This is the current `app/routes/index.tsx` game page, updated to:
- Use `worldId` from route params in the loader call and POST body
- Remove the `↺ refresh` button's `window.location.reload()` (no change needed — it still works)

- [ ] **Step 1: Create `app/routes/play/$worldId.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { TickChunkKind } from '@core/engine/tick-stream-types';
import { type TickStreamChunk } from '../api/stream-command';
import { getInitialView } from '../../server/initial-view';

export const Route = createFileRoute('/play/$worldId')({
  component: Page,
  loader: async ({ params }) => await getInitialView({ data: params.worldId }),
});

const LineKind = {
  System:    'system',
  User:      'user',
  Witnessed: 'witnessed',
} as const;
type LineKind = (typeof LineKind)[keyof typeof LineKind];

type Line =
  | { id: number; kind: typeof LineKind.System;                           segments: readonly Segment[] }
  | { id: number; kind: typeof LineKind.User | typeof LineKind.Witnessed; text: string };

interface InventoryItem {
  id: string;
  label: string;
  equipped: boolean;
}

interface ForSaleItem {
  readonly id: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly priceTag: number;
}

interface SurroundingsItem {
  id: string;
  label: string;
}

interface SurroundingsExit {
  id: string;
  direction: string;
  label: string | null;
  locked: boolean;
}

interface SurroundingsCharacter {
  id: string;
  label: string;
  shortDescription: string;
  mood: string | null;
  hp: number;
  wares: readonly ForSaleItem[];
}

interface Surroundings {
  items: readonly SurroundingsItem[];
  exits: readonly SurroundingsExit[];
  characters: readonly SurroundingsCharacter[];
}

const EMPTY_SURROUNDINGS: Surroundings = { items: [], exits: [], characters: [] };

function Page() {
  const initial = Route.useLoaderData();
  const { worldId } = Route.useParams();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: LineKind.System, segments: initial.render }]);
  const [inventory, setInventory] = useState<InventoryItem[]>(initial.inventory ?? []);
  const [surroundings, setSurroundings] = useState<Surroundings>(
    initial.surroundings ?? EMPTY_SURROUNDINGS,
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll + refocus on update is the intent
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!busy && document.activeElement !== inputRef.current) {
      inputRef.current?.focus();
    }
  }, [lines, busy]);

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
        body: JSON.stringify({ text, worldId }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const SSE_PREFIX = 'data: ';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
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

  const colorFor = (kind: typeof LineKind.User | typeof LineKind.Witnessed): string => {
    if (kind === LineKind.User) return '#9aff9a';
    return '#888888';
  };

  const renderExit = (e: SurroundingsExit): string => {
    const base = e.label ? `${e.direction} (${e.label})` : e.direction;
    return e.locked ? `${base} 🔒` : base;
  };

  const styleForSegment = (kind: SegmentKind): React.CSSProperties => {
    switch (kind) {
      case SegmentKind.LocationName:
        return { color: '#ffffff', fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 12, marginBottom: 6 };
      case SegmentKind.LocationDescription:
        return { fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #333', paddingLeft: 8, marginBottom: 10 };
      case SegmentKind.Narration:
        return { fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #444', paddingLeft: 8 };
      case SegmentKind.ItemList:
      case SegmentKind.CharacterList:
      case SegmentKind.ExitList:
        return { color: '#aaaaaa', fontSize: 13 };
      case SegmentKind.NoExits:
        return { color: '#666666', fontSize: 13, fontStyle: 'italic' };
      case SegmentKind.Feedback:
        return { color: '#cfcfcf', opacity: 0.8 };
      case SegmentKind.Inventory:
        return { color: '#aaaaaa', fontSize: 13, fontStyle: 'italic' };
      case SegmentKind.Spawn:
        return { color: '#ffaa44', fontWeight: 700 };
      case SegmentKind.Error:
        return { color: '#ff9999', fontWeight: 700 };
      case SegmentKind.Hit:
        return { color: '#ffcc44', fontWeight: 700 };
      case SegmentKind.Miss:
        return { color: '#999999', fontStyle: 'italic' };
      case SegmentKind.Damage:
        return { color: '#ff6666' };
      case SegmentKind.Death:
        return { color: '#ff3333', fontWeight: 700, textTransform: 'uppercase' as const };
    }
  };

  const sectionHeaderStyle: React.CSSProperties = {
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    marginBottom: 8,
  };
  const sectionWrapperStyle: React.CSSProperties = { marginBottom: 16 };
  const emptyStyle: React.CSSProperties = { opacity: 0.5, fontStyle: 'italic' };
  const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };
  const itemStyle: React.CSSProperties = { padding: '3px 0' };
  const subheadStyle: React.CSSProperties = {
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
    margin: '6px 0 2px',
  };
  const equippedItemStyle: React.CSSProperties = {
    padding: '3px 0',
    color: '#d8c98a',
  };
  const equippedIconStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 14,
    marginRight: 6,
    color: '#d8c98a',
    fontSize: 12,
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 14, opacity: 0.6, margin: 0 }}>{initial.displayName}</h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: 'none',
            border: '1px solid #333',
            color: '#666',
            fontSize: 12,
            padding: '3px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ↺ refresh
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5, paddingRight: 8 }}>
            {lines.map((l) => {
              if (l.kind === LineKind.System) {
                return (
                  <div key={l.id} style={{ color: '#cfcfcf', marginBottom: 8 }}>
                    {l.segments.map((seg, i) => (
                      <div key={i} style={styleForSegment(seg.kind)}>{seg.text}</div>
                    ))}
                  </div>
                );
              }
              return (
                <div
                  key={l.id}
                  style={{
                    color: colorFor(l.kind),
                    marginBottom: 8,
                    fontStyle: l.kind === LineKind.Witnessed ? 'italic' : 'normal',
                  }}
                >
                  {l.text}
                </div>
              );
            })}
            {busy && (
              <div aria-label="Thinking" style={{ color: '#666', fontStyle: 'italic', marginBottom: 8, letterSpacing: 2 }}>
                <span className="id-dot id-dot-1">·</span>
                <span className="id-dot id-dot-2">·</span>
                <span className="id-dot id-dot-3">·</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <span style={{ alignSelf: 'center', color: '#9aff9a', fontSize: 22, lineHeight: 1 }}>&gt;</span>
            <input
              ref={inputRef}
              // biome-ignore lint/a11y/noAutofocus: single-input game prompt — focus is the entire UX
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              style={{
                flex: 1,
                background: '#0a0a0a',
                color: '#cfcfcf',
                border: '1px solid #333',
                padding: '14px 16px',
                fontFamily: 'inherit',
                fontSize: 18,
                lineHeight: 1.4,
              }}
              placeholder="What do you do?"
            />
          </form>
        </div>
        <aside style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #222', paddingLeft: 16, color: '#cfcfcf', fontSize: 13, overflowY: 'auto' }}>
          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Here</div>
            {surroundings.items.length === 0 ? (
              <div style={emptyStyle}>(none)</div>
            ) : (
              <ul style={listStyle}>
                {surroundings.items.map((it) => (
                  <li key={it.id} style={itemStyle}>{it.label}</li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Exits</div>
            {surroundings.exits.length === 0 ? (
              <div style={emptyStyle}>(none)</div>
            ) : (
              <ul style={listStyle}>
                {surroundings.exits.map((e) => (
                  <li key={e.id} style={itemStyle}>{renderExit(e)}</li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Characters</div>
            {surroundings.characters.length === 0 ? (
              <div style={emptyStyle}>(none)</div>
            ) : (
              <ul style={listStyle}>
                {surroundings.characters.map((c) => (
                  <li key={c.id} style={{ ...itemStyle, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span>{c.label}</span>
                      <span style={{ fontSize: 11, color: '#c44', marginLeft: 8, flexShrink: 0 }}>♥ {c.hp}</span>
                    </div>
                    {c.shortDescription ? (
                      <div style={{ fontStyle: 'italic', opacity: 0.85, fontSize: 12 }}>{c.shortDescription}</div>
                    ) : null}
                    {c.mood ? (
                      <div style={{ fontStyle: 'italic', color: '#888', fontSize: 12 }}>{c.mood}</div>
                    ) : null}
                    {c.wares.length > 0 ? (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>For sale:</div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {c.wares.map((w) => (
                            <li key={w.id} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 1 }}>
                              <span style={{ opacity: 0.9 }}>
                                {w.label}
                                {w.shortDescription ? (
                                  <span style={{ fontStyle: 'italic', opacity: 0.75 }}> — {w.shortDescription}</span>
                                ) : null}
                              </span>
                              <span style={{ color: '#ba9', flexShrink: 0 }}>{w.priceTag}g</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Inventory</div>
            {inventory.length === 0 ? (
              <div style={emptyStyle}>(empty)</div>
            ) : (
              (() => {
                const equipped = inventory.filter((it) => it.equipped);
                const carried = inventory.filter((it) => !it.equipped);
                return (
                  <>
                    {equipped.length > 0 ? (
                      <>
                        <div style={subheadStyle}>Equipped</div>
                        <ul style={listStyle}>
                          {equipped.map((it) => (
                            <li key={it.id} style={equippedItemStyle}>
                              <span style={equippedIconStyle} aria-label="equipped" title="Equipped">⚔</span>
                              {it.label}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {carried.length > 0 ? (
                      <>
                        {equipped.length > 0 ? <div style={subheadStyle}>Carried</div> : null}
                        <ul style={listStyle}>
                          {carried.map((it) => (
                            <li key={it.id} style={itemStyle}>{it.label}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                );
              })()
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit 2>&1 | grep "play"
```

Expected: no errors for the play route.

- [ ] **Step 3: Commit**

```bash
git add app/routes/play/
git commit -m "feat(play): add /play/\$worldId game page"
```

---

## Task 7: Create `list-live-worlds` server fn

**Files:**
- Create: `app/server/list-live-worlds.ts`

- [ ] **Step 1: Create the file**

```ts
import { eq } from 'drizzle-orm';
import { createServerFn } from '@tanstack/react-start';
import * as schema from '@infra/schema';
import { getDb } from './world';

export const listLiveWorlds = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDb();
  return db
    .select({
      id: schema.worlds.id,
      displayName: schema.worlds.displayName,
    })
    .from(schema.worlds)
    .where(eq(schema.worlds.kind, 'live'));
});
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit 2>&1 | grep "list-live-worlds"
```

Expected: no errors.

---

## Task 8: Convert `/` to the world picker

**Files:**
- Modify: `app/routes/index.tsx`

- [ ] **Step 1: Replace `index.tsx` with the world picker**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { listLiveWorlds } from '~/server/list-live-worlds';

export const Route = createFileRoute('/')({
  component: WorldPickerPage,
  loader: async () => await listLiveWorlds(),
});

function WorldPickerPage() {
  const worlds = Route.useLoaderData();

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 32,
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, opacity: 0.8 }}>
        Imagined Dungeons
      </h1>
      {worlds.length === 0 ? (
        <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No worlds available. Create one in the admin panel.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {worlds.map((w) => (
            <li key={w.id}>
              <Link
                to="/play/$worldId"
                params={{ worldId: w.id }}
                style={{
                  display: 'block',
                  padding: '12px 24px',
                  border: '1px solid #333',
                  color: '#cfcfcf',
                  textDecoration: 'none',
                  fontSize: 16,
                  letterSpacing: '0.05em',
                }}
              >
                {w.displayName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Run full type check**

```bash
npx tsc --noEmit 2>&1 | grep -v "^$"
```

Expected: no new errors beyond the pre-existing ones noted earlier (check `npc-mind.ts`, `consequences.ts`, etc. — those are pre-existing).

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/routes/index.tsx app/server/list-live-worlds.ts
git commit -m "feat(picker): world picker at /"
```

---

## Task 9: Smoke-test in the browser

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the world picker**

Open `http://localhost:3000`. You should see "Imagined Dungeons" heading and two entries:
- Imagined Dungeons — The Burning District
- Kitty Drama

- [ ] **Step 3: Play Kitty Drama**

Click "Kitty Drama". URL should become `/play/w_mvavu5oc`. The game should load with the initial `look` output and "Kitty Drama" in the header.

- [ ] **Step 4: Play the Burning District**

Navigate back (`/`) and click "Imagined Dungeons — The Burning District". URL becomes `/play/w_burning_district`. Game loads normally.

- [ ] **Step 5: Verify commands work**

Type a command (e.g. `look`) in each world. Confirm the response is world-appropriate.

- [ ] **Step 6: Commit any smoke-test fixes**

If you made any fixes during smoke testing, commit them:

```bash
git add -p
git commit -m "fix: url-based world selection smoke-test fixes"
```

If there were no fixes needed, skip this step.
