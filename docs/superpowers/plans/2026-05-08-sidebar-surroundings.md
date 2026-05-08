# Sidebar Surroundings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HERE / EXITS / CHARACTERS sections to the play-route sidebar, refreshed on initial load and after every player command, sourced from the existing `perceive` view.

**Architecture:** A single helper `buildSurroundings(playerId, repo)` shapes `perceive(...)` into a wire-format `SurroundingsView`. Both server functions (`getInitialView`, `submitCommand`) call it and include the result in their response. The client renders four fixed sidebar sections.

**Tech Stack:** TypeScript (strict), TanStack Start server functions, React, vitest, biome.

---

## File Structure

- **Create** `app/server/surroundings.ts` — `SurroundingsView` type and `buildSurroundings` helper.
- **Create** `app/server/surroundings.test.ts` — unit tests against `MemoryRepository`.
- **Modify** `app/server/initial-view.ts` — add `surroundings` to response.
- **Modify** `app/server/submit.ts` — add `surroundings` to response.
- **Modify** `app/routes/index.tsx` — `surroundings` state + three new sidebar sections.

---

### Task 1: `SurroundingsView` type + `buildSurroundings` (TDD — test first)

**Files:**
- Create: `app/server/surroundings.test.ts`
- Create: `app/server/surroundings.ts`

- [ ] **Step 1: Write the failing test**

Create `app/server/surroundings.test.ts`:

```ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { buildSurroundings } from './surroundings';

const W = asWorldId('w');
const LOC = asLocationId('loc_tavern');
const PLAYER = asAgentId('char_player');
const SPARK = asAgentId('char_spark');
const PAFF = asAgentId('char_paff');
const MAP = asItemId('item_map');
const HIDDEN = asItemId('item_hidden');
const EXIT_N = asExitId('exit_n');
const EXIT_S = asExitId('exit_s');

const loc: Location = {
  id: LOC,
  worldId: W,
  label: 'The Flaming Goblet',
  shortDescription: 'a tavern with a wall on fire',
  longDescription: 'A tavern with one wall constantly aflame.',
};

const player: Agent = {
  id: PLAYER, worldId: W, label: 'You',
  shortDescription: '', longDescription: '',
  locationId: LOC, hp: 20, damage: 2, defense: 12, capacity: 30,
  mood: null, shortTermIntent: null, goal: null, autonomous: false,
};

const spark: Agent = {
  id: SPARK, worldId: W, label: 'Spark',
  shortDescription: 'a halfling courier', longDescription: '',
  locationId: LOC, hp: 18, damage: 2, defense: 14, capacity: 10,
  mood: 'energetic', shortTermIntent: null, goal: null, autonomous: true,
};

const paff: Agent = {
  id: PAFF, worldId: W, label: 'Paff Pinkerton',
  shortDescription: 'a tavern-keeper', longDescription: '',
  locationId: LOC, hp: 20, damage: 2, defense: 12, capacity: 30,
  mood: null, shortTermIntent: null, goal: null, autonomous: false,
};

const map: Item = {
  id: MAP, worldId: W, label: 'fire map',
  shortDescription: 'a hand-drawn map', longDescription: '',
  ownerKind: OwnerKind.Location, ownerId: LOC, hidden: false,
};

const hidden: Item = {
  id: HIDDEN, worldId: W, label: 'secret token',
  shortDescription: '', longDescription: '',
  ownerKind: 'location', ownerId: LOC, hidden: true,
};

const exitN: Exit = {
  id: EXIT_N, worldId: W, fromLocationId: LOC, toLocationId: LOC,
  direction: 'north', label: 'Tavern Back Door',
  locked: true, lockedByItem: null,
};

const exitS: Exit = {
  id: EXIT_S, worldId: W, fromLocationId: LOC, toLocationId: LOC,
  direction: 'south', label: 'south',
  locked: false, lockedByItem: null,
};

const makeRepo = (): MemoryRepository =>
  new MemoryRepository(W, {
    locations: [loc],
    exits: [exitN, exitS],
    items: [map, hidden],
    agents: [player, spark, paff],
  });

describe('buildSurroundings', () => {
  it('returns visible items as { id, label }', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.items).toEqual([{ id: 'item_map', label: 'fire map' }]);
  });

  it('excludes hidden items', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.items.find((i) => i.id === 'item_hidden')).toBeUndefined();
  });

  it('returns exits with locked flag and label nulled when label === direction', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.exits).toEqual([
      { id: 'exit_n', direction: 'north', label: 'Tavern Back Door', locked: true },
      { id: 'exit_s', direction: 'south', label: null, locked: false },
    ]);
  });

  it('returns characters with mood passed through verbatim and null preserved', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.characters).toEqual([
      { id: 'char_spark', label: 'Spark', shortDescription: 'a halfling courier', mood: 'energetic' },
      { id: 'char_paff', label: 'Paff Pinkerton', shortDescription: 'a tavern-keeper', mood: null },
    ]);
  });

  it('does not include the player themselves in characters', async () => {
    const repo = makeRepo();
    const r = await buildSurroundings(PLAYER, repo);
    expect(r.characters.find((c) => c.id === 'char_player')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run app/server/surroundings.test.ts`
Expected: FAIL — `Cannot find module './surroundings'`.

- [ ] **Step 3: Write minimal implementation**

Create `app/server/surroundings.ts`:

```ts
import type { AgentId } from '@core/domain/ids';
import { perceive } from '@core/engine/perception';
import type { Repository } from '@core/engine/repository';

export interface SurroundingsItem {
  readonly id: string;
  readonly label: string;
}

export interface SurroundingsExit {
  readonly id: string;
  readonly direction: string;
  readonly label: string | null;
  readonly locked: boolean;
}

export interface SurroundingsCharacter {
  readonly id: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly mood: string | null;
}

export interface SurroundingsView {
  readonly items: readonly SurroundingsItem[];
  readonly exits: readonly SurroundingsExit[];
  readonly characters: readonly SurroundingsCharacter[];
}

export async function buildSurroundings(
  playerId: AgentId,
  repo: Repository,
): Promise<SurroundingsView> {
  const view = await perceive(playerId, repo);
  return {
    items: view.items.map((i) => ({ id: i.id as string, label: i.label })),
    exits: view.exits.map((e) => ({
      id: e.id as string,
      direction: e.direction,
      label: e.label && e.label !== e.direction ? e.label : null,
      locked: e.locked,
    })),
    characters: view.agents.map((a) => ({
      id: a.id as string,
      label: a.label,
      shortDescription: a.shortDescription,
      mood: a.mood,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run app/server/surroundings.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. If lint fails on formatting, run `pnpm format` then re-run lint.

- [ ] **Step 6: Commit**

```bash
git add app/server/surroundings.ts app/server/surroundings.test.ts
git commit -m "feat(server): buildSurroundings shapes perception for sidebar"
```

---

### Task 2: Wire surroundings into `getInitialView`

**Files:**
- Modify: `app/server/initial-view.ts`

- [ ] **Step 1: Edit `app/server/initial-view.ts`**

Replace the file contents with:

```ts
import { OwnerKind } from '@core/domain/kinds';
import { runTurn } from '@core/engine/turn';
import { createServerFn } from '@tanstack/react-start';
import { buildSurroundings } from './surroundings';
import { DISPLAY_NAME, PLAYER_ID, getParse, getRepo } from './world';

export const getInitialView = createServerFn({ method: 'GET' }).handler(async () => {
  const repo = await getRepo();
  const parse = getParse();
  const result = await runTurn(PLAYER_ID, 'look', repo, parse);
  const inventoryItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: PLAYER_ID });
  const surroundings = await buildSurroundings(PLAYER_ID, repo);
  return {
    render: result.render,
    displayName: DISPLAY_NAME,
    inventory: inventoryItems.map((i) => ({ id: i.id as string, label: i.label })),
    surroundings,
  };
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/server/initial-view.ts
git commit -m "feat(server): include surroundings in initial view payload"
```

---

### Task 3: Wire surroundings into `submitCommand`

**Files:**
- Modify: `app/server/submit.ts`

- [ ] **Step 1: Edit `app/server/submit.ts`**

Replace the file contents with:

```ts
import { OwnerKind } from '@core/domain/kinds';
import { runTick } from '@core/engine/tick';
import { createServerFn } from '@tanstack/react-start';
import { buildSurroundings } from './surroundings';
import { PLAYER_ID, getNarratorLlm, getParse, getRepo } from './world';

export const submitCommand = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { text?: unknown }).text !== 'string') {
      throw new Error('Expected { text: string }');
    }
    return d as { text: string };
  })
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const parse = getParse();
    const llm = getNarratorLlm();
    const result = await runTick(PLAYER_ID, data.text, repo, { parse, llm });
    const inventoryItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: PLAYER_ID });
    const surroundings = await buildSurroundings(PLAYER_ID, repo);
    return {
      render: result.render,
      witnessed: [...result.witnessed],
      inventory: inventoryItems.map((i) => ({ id: i.id as string, label: i.label })),
      surroundings,
    };
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/server/submit.ts
git commit -m "feat(server): include surroundings in submit response"
```

---

### Task 4: Render four sidebar sections in the play route

**Files:**
- Modify: `app/routes/index.tsx`

- [ ] **Step 1: Replace the file contents**

Replace `app/routes/index.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { getInitialView } from '../server/initial-view';
import { submitCommand } from '../server/submit';

export const Route = createFileRoute('/')({
  component: Page,
  loader: async () => await getInitialView(),
});

interface Line {
  id: number;
  kind: 'system' | 'user' | 'witnessed';
  text: string;
}

interface InventoryItem {
  id: string;
  label: string;
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
}

interface Surroundings {
  items: SurroundingsItem[];
  exits: SurroundingsExit[];
  characters: SurroundingsCharacter[];
}

const EMPTY_SURROUNDINGS: Surroundings = { items: [], exits: [], characters: [] };

function Page() {
  const initial = Route.useLoaderData();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: 'system', text: initial.render }]);
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
    setLines((ls) => [...ls, { id: idRef.current++, kind: 'user', text: `> ${text}` }]);
    setInput('');
    try {
      const r = await submitCommand({ data: { text } });
      setLines((ls) => {
        const next: Line[] = [...ls, { id: idRef.current++, kind: 'system', text: r.render }];
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

  const colorFor = (kind: Line['kind']): string => {
    if (kind === 'user') return '#9aff9a';
    if (kind === 'witnessed') return '#888888';
    return '#cfcfcf';
  };

  const renderExit = (e: SurroundingsExit): string => {
    const base = e.label ? `${e.direction} (${e.label})` : e.direction;
    return e.locked ? `${base} 🔒` : base;
  };

  const renderCharacter = (c: SurroundingsCharacter): string => {
    const base = `${c.label} — ${c.shortDescription}`;
    return c.mood ? `${base} (${c.mood})` : base;
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

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16 }}>
      <h1 style={{ fontSize: 14, opacity: 0.6, margin: '0 0 12px' }}>{initial.displayName}</h1>
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              paddingRight: 8,
            }}
          >
            {lines.map((l) => (
              <div
                key={l.id}
                style={{
                  color: colorFor(l.kind),
                  marginBottom: 8,
                  fontStyle: l.kind === 'witnessed' ? 'italic' : 'normal',
                }}
              >
                {l.text}
              </div>
            ))}
            {busy && (
              <div
                aria-label="Thinking"
                style={{
                  color: '#666',
                  fontStyle: 'italic',
                  marginBottom: 8,
                  letterSpacing: 2,
                }}
              >
                <span className="id-dot id-dot-1">·</span>
                <span className="id-dot id-dot-2">·</span>
                <span className="id-dot id-dot-3">·</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <span
              style={{
                alignSelf: 'center',
                color: '#9aff9a',
                fontSize: 22,
                lineHeight: 1,
              }}
            >
              &gt;
            </span>
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
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            borderLeft: '1px solid #222',
            paddingLeft: 16,
            color: '#cfcfcf',
            fontSize: 13,
            overflowY: 'auto',
          }}
        >
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
                  <li key={c.id} style={itemStyle}>{renderCharacter(c)}</li>
                ))}
              </ul>
            )}
          </section>

          <section style={sectionWrapperStyle}>
            <div style={sectionHeaderStyle}>Inventory</div>
            {inventory.length === 0 ? (
              <div style={emptyStyle}>(empty)</div>
            ) : (
              <ul style={listStyle}>
                {inventory.map((it) => (
                  <li key={it.id} style={itemStyle}>{it.label}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. If lint fails on formatting, run `pnpm format` then re-run lint.

- [ ] **Step 3: Run all tests**

Run: `pnpm test -- --run`
Expected: all tests pass (242 + 5 new = 247).

- [ ] **Step 4: Commit**

```bash
git add app/routes/index.tsx
git commit -m "feat(ui): sidebar shows here, exits, characters alongside inventory"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Open the play route in a browser and verify**

Confirm in the sidebar:
- `HERE` lists items in the room (or "(none)" if empty).
- `EXITS` lists each direction; locked exits show `🔒`; an exit whose label matches its direction shows just the direction.
- `CHARACTERS` lists each NPC as `<name> — <short description>` and appends `(<mood>)` when set.
- `INVENTORY` is unchanged.
- Submitting a command (e.g. `take fire map`) updates the relevant section on the next refresh.

- [ ] **Step 3: Stop dev server**

Ctrl-C.

---

## Self-Review

**Spec coverage.** All five spec sections covered: SurroundingsView wire format (Task 1), buildSurroundings server helper (Task 1), server-function wiring (Tasks 2 & 3), client rendering with the per-section formats (Task 4), unit tests for the five required cases (Task 1, 5 tests). Out-of-scope items (polling, interactivity, descriptions for items/exits) are not in the plan.

**No placeholders.** Every step has either complete code or a concrete shell command. No "TODO", no "similar to above".

**Type consistency.** `SurroundingsView` and its three nested types use the same field names across server (`app/server/surroundings.ts`) and client (`app/routes/index.tsx`): `items[].label`, `exits[].direction|label|locked`, `characters[].label|shortDescription|mood`. The client type definitions are structurally identical (mutable, since they come from JSON deserialisation).

**Discriminator usage.** Test fixtures use `OwnerKind.Location` (imported from `@core/domain/kinds`), consistent with the codebase's no-string-literals-in-logic rule.
