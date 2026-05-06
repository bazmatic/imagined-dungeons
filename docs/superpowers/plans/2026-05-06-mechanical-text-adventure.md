# Mechanical Text Adventure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship slice 1 of Imagined Dungeons — a fully playable, deterministic, classic-style text adventure for The Burning District on TanStack Start, with no language model involved.

**Architecture:** Layered hexagonal. `core/domain` (pure types) → `core/engine` (action handlers + parser + templates over a `Repository` interface) → `infra/persistence` (Drizzle + SQLite implementing the interface) → `app` (TanStack Start routes calling server functions that compose the engine and the SQLite repo). Engine is unit-tested against an in-memory repo fake; integration tests use `:memory:` SQLite.

**Tech Stack:** TanStack Start, TypeScript (strict), Drizzle ORM, `better-sqlite3`, vitest, biome.

**Source-of-truth refs:**
- Spec: [docs/superpowers/specs/2026-05-06-mechanical-text-adventure-design.md](../specs/2026-05-06-mechanical-text-adventure-design.md)
- World data: [burning-district-data.md](../../../burning-district-data.md)
- Abstract design: [abstract-design.md](../../../abstract-design.md)

---

## Task 1: Project scaffold and tooling

**Goal:** Empty TanStack Start app, TypeScript strict, biome, vitest configured. `pnpm dev` opens a blank page; `pnpm test` runs zero tests; `pnpm typecheck` passes.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `biome.json`
- Create: `.gitignore`
- Create: `app/router.tsx`
- Create: `app/routes/__root.tsx`
- Create: `app/routes/index.tsx`
- Create: `app/client.tsx`
- Create: `app/ssr.tsx`

- [ ] **Step 1: Initialize package.json**

Create `package.json`:

```json
{
  "name": "imagined-dungeons",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "dependencies": {
    "@tanstack/react-router": "^1.95.0",
    "@tanstack/react-start": "^1.95.0",
    "@tanstack/router-devtools": "^1.95.0",
    "better-sqlite3": "^11.7.0",
    "drizzle-orm": "^0.38.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vinxi": "^0.5.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "vite-tsconfig-paths": "^5.1.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["./app/*"],
      "@core/*": ["./src/core/*"],
      "@infra/*": ["./src/infra/*"]
    }
  },
  "include": ["app", "src", "tests", "*.ts", "*.tsx"]
}
```

- [ ] **Step 3: Vite + Vitest + Biome config**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vinxi/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: { plugins: [tsconfigPaths()] },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
```

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "files": { "ignore": ["dist", "node_modules", ".vinxi", ".output", "drizzle"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "error", "useConst": "error" },
      "correctness": { "noUnusedVariables": "error", "noUnusedImports": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

Create `.gitignore`:

```
node_modules
.vinxi
.output
dist
*.db
*.db-journal
.env
.env.local
.DS_Store
```

- [ ] **Step 4: TanStack Start minimal app**

Create `app/router.tsx`:

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  return createTanStackRouter({ routeTree, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createRouter> }
}
```

Create `app/routes/__root.tsx`:

```tsx
import { Outlet, ScrollRestoration, createRootRoute } from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Imagined Dungeons' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head><Meta /></head>
      <body style={{ background: '#000', color: '#cfcfcf', fontFamily: 'ui-monospace, monospace', margin: 0 }}>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

Create `app/routes/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => <main style={{ padding: 24 }}>Imagined Dungeons — booting…</main>,
});
```

Create `app/client.tsx`:

```tsx
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from './router';

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
```

Create `app/ssr.tsx`:

```tsx
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { getRouterManifest } from '@tanstack/react-start/router-manifest';
import { createRouter } from './router';

export default createStartHandler({ createRouter, getRouterManifest })(defaultStreamHandler);
```

- [ ] **Step 5: Install + verify**

Run:

```bash
pnpm install
pnpm typecheck
pnpm test
```

Expected: install succeeds; typecheck succeeds (note: `routeTree.gen.ts` is generated on first `dev`/`build` — if typecheck fails on missing import, run `pnpm dev` once to generate it, kill it, then re-typecheck); test reports zero tests passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Task 1: project scaffold (TanStack Start, TS strict, vitest, biome)"
```

---

## Task 2: Domain types and ids

**Goal:** Pure-TypeScript domain layer. Branded ids, entity types, action types, event types, `Result`. No I/O. Compiles in isolation.

**Files:**
- Create: `src/core/domain/ids.ts`
- Create: `src/core/domain/result.ts`
- Create: `src/core/domain/entities.ts`
- Create: `src/core/domain/actions.ts`
- Create: `src/core/domain/events.ts`
- Test: `src/core/domain/ids.test.ts`

- [ ] **Step 1: Failing test for branded ids**

Create `src/core/domain/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type LocationId, type ItemId, asLocationId, asItemId } from './ids';

describe('branded ids', () => {
  it('asLocationId tags a string as LocationId', () => {
    const id: LocationId = asLocationId('loc_test');
    expect(id).toBe('loc_test');
  });

  it('asItemId and asLocationId produce values that are not interchangeable to the type system', () => {
    const loc: LocationId = asLocationId('loc_test');
    const item: ItemId = asItemId('item_test');
    // @ts-expect-error — LocationId is not assignable to ItemId
    const wrong: ItemId = loc;
    expect(item).toBe('item_test');
    expect(wrong).toBe('loc_test');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm test -- ids`
Expected: FAIL — `Cannot find module './ids'`.

- [ ] **Step 3: Implement ids**

Create `src/core/domain/ids.ts`:

```ts
declare const Brand: unique symbol;
type Branded<T, B> = T & { readonly [Brand]: B };

export type LocationId = Branded<string, 'LocationId'>;
export type ItemId = Branded<string, 'ItemId'>;
export type AgentId = Branded<string, 'AgentId'>;
export type ExitId = Branded<string, 'ExitId'>;
export type EventId = Branded<string, 'EventId'>;
export type WorldId = Branded<string, 'WorldId'>;

export const asLocationId = (s: string): LocationId => s as LocationId;
export const asItemId = (s: string): ItemId => s as ItemId;
export const asAgentId = (s: string): AgentId => s as AgentId;
export const asExitId = (s: string): ExitId => s as ExitId;
export const asEventId = (s: string): EventId => s as EventId;
export const asWorldId = (s: string): WorldId => s as WorldId;
```

- [ ] **Step 4: Run — verify it passes**

Run: `pnpm test -- ids`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement Result**

Create `src/core/domain/result.ts`:

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- [ ] **Step 6: Implement entities**

Create `src/core/domain/entities.ts`:

```ts
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from './ids';

export type Direction =
  | 'north' | 'south' | 'east' | 'west'
  | 'northeast' | 'northwest' | 'southeast' | 'southwest'
  | 'up' | 'down';

export const ALL_DIRECTIONS: readonly Direction[] = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'up', 'down',
];

export type Owner =
  | { kind: 'location'; id: LocationId }
  | { kind: 'agent'; id: AgentId }
  | { kind: 'item'; id: ItemId };

export interface Location {
  readonly id: LocationId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
}

export interface Exit {
  readonly id: ExitId;
  readonly worldId: WorldId;
  readonly from: LocationId;
  readonly to: LocationId;
  readonly direction: Direction;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}

export interface Item {
  readonly id: ItemId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly owner: Owner;
  readonly weight: number;
  readonly hidden: boolean;
}

export interface Agent {
  readonly id: AgentId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly locationId: LocationId;
  readonly hp: number;
  readonly damage: number;
  readonly defense: number;
  readonly capacity: number;
  readonly mood: string | null;
  readonly goal: string | null;
  readonly autonomous: boolean;
}
```

- [ ] **Step 7: Implement actions**

Create `src/core/domain/actions.ts`:

```ts
import type { AgentId } from './ids';
import type { Direction } from './entities';

export type Action =
  | { kind: 'move'; actorId: AgentId; direction: Direction }
  | { kind: 'look'; actorId: AgentId; targetRef: string | null }
  | { kind: 'take'; actorId: AgentId; itemRef: string }
  | { kind: 'drop'; actorId: AgentId; itemRef: string }
  | { kind: 'inventory'; actorId: AgentId };

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'unknown_verb'; verb: string }
  | { kind: 'missing_argument'; verb: string }
  | { kind: 'unknown_direction'; raw: string }
  | { kind: 'no_such_target'; ref: string }
  | { kind: 'ambiguous_target'; ref: string; candidates: string[] };
```

- [ ] **Step 8: Implement events**

Create `src/core/domain/events.ts`:

```ts
import type { AgentId, EventId, ItemId, LocationId, WorldId } from './ids';
import type { Direction } from './entities';

export type EventKind = 'move' | 'take' | 'drop' | 'look' | 'inventory' | 'failed';

export interface BaseEvent {
  readonly id: EventId;
  readonly worldId: WorldId;
  readonly actorId: AgentId;
  readonly kind: EventKind;
  readonly witnesses: readonly AgentId[];
  readonly createdAt: Date;
}

export type DomainEvent =
  | (BaseEvent & { kind: 'move'; from: LocationId; to: LocationId; direction: Direction })
  | (BaseEvent & { kind: 'take'; itemId: ItemId; from: LocationId })
  | (BaseEvent & { kind: 'drop'; itemId: ItemId; to: LocationId })
  | (BaseEvent & { kind: 'look'; locationId: LocationId; targetItemId: ItemId | null })
  | (BaseEvent & { kind: 'inventory' })
  | (BaseEvent & { kind: 'failed'; attempted: string; reason: string });
```

- [ ] **Step 9: Verify everything compiles**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck PASS, 2 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Task 2: domain types — ids, entities, actions, events, Result"
```

---

## Task 3: Repository interface and in-memory fake

**Goal:** Define the engine's port to persistence and a working in-memory implementation we can build the engine against.

**Files:**
- Create: `src/core/engine/repository.ts`
- Create: `src/infra/memory-repository.ts`
- Test: `src/infra/memory-repository.test.ts`

- [ ] **Step 1: Repository interface**

Create `src/core/engine/repository.ts`:

```ts
import type { Agent, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from '@core/domain/ids';

export interface Repository {
  getWorldId(): Promise<WorldId>;
  getAgent(id: AgentId): Promise<Agent>;
  getLocation(id: LocationId): Promise<Location>;
  getItem(id: ItemId): Promise<Item>;
  getExit(id: ExitId): Promise<Exit>;
  itemsOwnedBy(owner: Owner): Promise<readonly Item[]>;
  agentsAt(loc: LocationId): Promise<readonly Agent[]>;
  exitsFrom(loc: LocationId): Promise<readonly Exit[]>;
  moveAgent(agent: AgentId, to: LocationId): Promise<void>;
  transferItem(item: ItemId, to: Owner): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
  recentEvents(limit: number): Promise<readonly DomainEvent[]>;
}
```

- [ ] **Step 2: Failing test for in-memory repo**

Create `src/infra/memory-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Item, Location } from '@core/domain/entities';
import { MemoryRepository } from './memory-repository';

const W = asWorldId('w');

const loc = (id: string, label: string): Location => ({
  id: asLocationId(id), worldId: W, label,
  shortDescription: label, longDescription: label,
});

const agent = (id: string, label: string, locId: string): Agent => ({
  id: asAgentId(id), worldId: W, label, shortDescription: label, longDescription: label,
  locationId: asLocationId(locId), hp: 10, damage: 1, defense: 10, capacity: 10,
  mood: null, goal: null, autonomous: false,
});

const item = (id: string, label: string, ownerKind: 'location' | 'agent', ownerId: string): Item => ({
  id: asItemId(id), worldId: W, label, shortDescription: label, longDescription: label,
  owner: ownerKind === 'location'
    ? { kind: 'location', id: asLocationId(ownerId) }
    : { kind: 'agent', id: asAgentId(ownerId) },
  weight: 1, hidden: false,
});

describe('MemoryRepository', () => {
  it('returns items owned by a location', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a', 'A')],
      exits: [],
      items: [item('item_x', 'x', 'location', 'loc_a')],
      agents: [],
    });
    const items = await repo.itemsOwnedBy({ kind: 'location', id: asLocationId('loc_a') });
    expect(items.map((i) => i.id)).toEqual(['item_x']);
  });

  it('moves an agent and reflects the change on subsequent reads', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a', 'A'), loc('loc_b', 'B')],
      exits: [],
      items: [],
      agents: [agent('char_1', 'P', 'loc_a')],
    });
    await repo.moveAgent(asAgentId('char_1'), asLocationId('loc_b'));
    const a = await repo.getAgent(asAgentId('char_1'));
    expect(a.locationId).toBe('loc_b');
  });

  it('transfers item ownership from a location to an agent', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a', 'A')],
      exits: [],
      items: [item('item_x', 'x', 'location', 'loc_a')],
      agents: [agent('char_1', 'P', 'loc_a')],
    });
    await repo.transferItem(asItemId('item_x'), { kind: 'agent', id: asAgentId('char_1') });
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: asAgentId('char_1') });
    expect(owned.map((i) => i.id)).toEqual(['item_x']);
    const stillThere = await repo.itemsOwnedBy({ kind: 'location', id: asLocationId('loc_a') });
    expect(stillThere).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run — verify failure**

Run: `pnpm test -- memory-repository`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement MemoryRepository**

Create `src/infra/memory-repository.ts`:

```ts
import type { Repository } from '@core/engine/repository';
import type { Agent, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from '@core/domain/ids';

export interface SeedData {
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
}

const sameOwner = (a: Owner, b: Owner): boolean => a.kind === b.kind && a.id === b.id;

export class MemoryRepository implements Repository {
  private readonly worldId: WorldId;
  private readonly locations = new Map<LocationId, Location>();
  private readonly exits = new Map<ExitId, Exit>();
  private readonly items = new Map<ItemId, Item>();
  private readonly agents = new Map<AgentId, Agent>();
  private readonly events: DomainEvent[] = [];

  constructor(worldId: WorldId, seed: SeedData) {
    this.worldId = worldId;
    for (const l of seed.locations) this.locations.set(l.id, l);
    for (const e of seed.exits) this.exits.set(e.id, e);
    for (const i of seed.items) this.items.set(i.id, i);
    for (const a of seed.agents) this.agents.set(a.id, a);
  }

  async getWorldId(): Promise<WorldId> { return this.worldId; }

  async getAgent(id: AgentId): Promise<Agent> {
    const a = this.agents.get(id);
    if (!a) throw new Error(`agent not found: ${id}`);
    return a;
  }

  async getLocation(id: LocationId): Promise<Location> {
    const l = this.locations.get(id);
    if (!l) throw new Error(`location not found: ${id}`);
    return l;
  }

  async getItem(id: ItemId): Promise<Item> {
    const i = this.items.get(id);
    if (!i) throw new Error(`item not found: ${id}`);
    return i;
  }

  async getExit(id: ExitId): Promise<Exit> {
    const e = this.exits.get(id);
    if (!e) throw new Error(`exit not found: ${id}`);
    return e;
  }

  async itemsOwnedBy(owner: Owner): Promise<readonly Item[]> {
    return [...this.items.values()].filter((i) => sameOwner(i.owner, owner));
  }

  async agentsAt(loc: LocationId): Promise<readonly Agent[]> {
    return [...this.agents.values()].filter((a) => a.locationId === loc);
  }

  async exitsFrom(loc: LocationId): Promise<readonly Exit[]> {
    return [...this.exits.values()].filter((e) => e.from === loc);
  }

  async moveAgent(id: AgentId, to: LocationId): Promise<void> {
    const a = await this.getAgent(id);
    this.agents.set(id, { ...a, locationId: to });
  }

  async transferItem(id: ItemId, to: Owner): Promise<void> {
    const i = await this.getItem(id);
    this.items.set(id, { ...i, owner: to });
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }

  async recentEvents(limit: number): Promise<readonly DomainEvent[]> {
    return this.events.slice(-limit);
  }
}
```

- [ ] **Step 5: Run — verify it passes**

Run: `pnpm test -- memory-repository`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Task 3: Repository interface + MemoryRepository (test fake)"
```

---

## Task 4: Perception module

**Goal:** Single source of truth for "what does actor X see in their location?". Filters hidden items, scopes to current location.

**Files:**
- Create: `src/core/engine/perception.ts`
- Test: `src/core/engine/perception.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/perception.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { MemoryRepository } from '@infra/memory-repository';
import { perceive } from './perception';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');

const loc = (id: string): Location => ({
  id: asLocationId(id), worldId: W, label: id, shortDescription: id, longDescription: id,
});
const agent = (id: string, locId: string): Agent => ({
  id: asAgentId(id), worldId: W, label: id, shortDescription: id, longDescription: id,
  locationId: asLocationId(locId), hp: 1, damage: 0, defense: 0, capacity: 10,
  mood: null, goal: null, autonomous: false,
});
const item = (id: string, ownerLoc: string, hidden = false): Item => ({
  id: asItemId(id), worldId: W, label: id, shortDescription: id, longDescription: id,
  owner: { kind: 'location', id: asLocationId(ownerLoc) },
  weight: 1, hidden,
});

describe('perceive', () => {
  it('returns visible items, agents (excluding self), and exits in the actor location', async () => {
    const repo = new MemoryRepository(W, {
      locations: [loc('loc_a'), loc('loc_b')],
      exits: [{ id: 'e1' as never, worldId: W, from: A, to: B, direction: 'north', label: 'door', locked: false, lockedByItem: null } as Exit],
      items: [item('item_x', 'loc_a'), item('item_hidden', 'loc_a', true), item('item_other', 'loc_b')],
      agents: [agent('char_self', 'loc_a'), agent('char_other', 'loc_a'), agent('char_far', 'loc_b')],
    });
    const view = await perceive(asAgentId('char_self'), repo);
    expect(view.items.map((i) => i.id)).toEqual(['item_x']);
    expect(view.agents.map((a) => a.id)).toEqual(['char_other']);
    expect(view.exits.map((e) => e.direction)).toEqual(['north']);
    expect(view.location.id).toBe('loc_a');
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- perception`
Expected: FAIL.

- [ ] **Step 3: Implement perception**

Create `src/core/engine/perception.ts`:

```ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import type { AgentId } from '@core/domain/ids';
import type { Repository } from './repository';

export interface PerceptionView {
  readonly actor: Agent;
  readonly location: Location;
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly exits: readonly Exit[];
}

export async function perceive(actorId: AgentId, repo: Repository): Promise<PerceptionView> {
  const actor = await repo.getAgent(actorId);
  const location = await repo.getLocation(actor.locationId);
  const itemsHere = await repo.itemsOwnedBy({ kind: 'location', id: location.id });
  const items = itemsHere.filter((i) => !i.hidden);
  const agentsHere = await repo.agentsAt(location.id);
  const agents = agentsHere.filter((a) => a.id !== actorId);
  const exits = await repo.exitsFrom(location.id);
  return { actor, location, items, agents, exits };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- perception`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 4: perception module — actor's view of their location"
```

---

## Task 5: Templates (mechanical narration)

**Goal:** Pure functions from event/perception to user-facing strings. The only place narration text lives.

**Files:**
- Create: `src/core/engine/templates.ts`
- Test: `src/core/engine/templates.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asEventId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  renderLook, renderMoveSelf, renderTakeSelf, renderDropSelf,
  renderInventory, renderParseError, renderActionError,
} from './templates';

const W = asWorldId('w');
const loc: Location = {
  id: asLocationId('loc_a'), worldId: W, label: 'The Goblet',
  shortDescription: 'A tavern.', longDescription: 'A tavern with one wall aflame.',
};
const itemA: Item = { id: asItemId('item_a'), worldId: W, label: 'fire map', shortDescription: 'a map', longDescription: 'A real-time map.', owner: { kind: 'location', id: loc.id }, weight: 1, hidden: false };
const npc: Agent = { id: asAgentId('char_n'), worldId: W, label: 'Spark', shortDescription: 's', longDescription: 's', locationId: loc.id, hp: 1, damage: 0, defense: 0, capacity: 0, mood: null, goal: null, autonomous: false };
const exitN: Exit = { id: 'e' as never, worldId: W, from: loc.id, to: asLocationId('loc_b'), direction: 'north', label: 'Tavern Back Door', locked: true, lockedByItem: asItemId('item_key') };
const exitS: Exit = { id: 'e2' as never, worldId: W, from: loc.id, to: asLocationId('loc_c'), direction: 'south', label: 'Tavern Front Door', locked: false, lockedByItem: null };

describe('templates', () => {
  it('renderLook produces a multi-line description with items, agents, exits', () => {
    const out = renderLook({
      actor: npc, location: loc, items: [itemA], agents: [npc], exits: [exitN, exitS],
    });
    expect(out).toContain('The Goblet');
    expect(out).toContain('A tavern with one wall aflame.');
    expect(out).toContain('You see: fire map.');
    expect(out).toContain('Also here: Spark.');
    expect(out).toContain('Exits:');
    expect(out).toContain('north (Tavern Back Door, locked)');
    expect(out).toContain('south (Tavern Front Door)');
  });

  it('renderLook with no items/agents omits those lines', () => {
    const out = renderLook({ actor: npc, location: loc, items: [], agents: [], exits: [exitS] });
    expect(out).not.toContain('You see:');
    expect(out).not.toContain('Also here:');
  });

  it('renderMoveSelf names the direction', () => {
    expect(renderMoveSelf('north')).toBe('You go north.');
  });

  it('renderTakeSelf and renderDropSelf name the item', () => {
    expect(renderTakeSelf(itemA)).toBe('Taken: fire map.');
    expect(renderDropSelf(itemA)).toBe('Dropped: fire map.');
  });

  it('renderInventory lists items or says empty', () => {
    expect(renderInventory([])).toBe('You are carrying nothing.');
    expect(renderInventory([itemA])).toBe('You are carrying: fire map.');
  });

  it('renderParseError covers all variants', () => {
    expect(renderParseError({ kind: 'empty' })).toMatch(/type a command/i);
    expect(renderParseError({ kind: 'unknown_verb', verb: 'frobnicate' })).toContain('frobnicate');
    expect(renderParseError({ kind: 'missing_argument', verb: 'take' })).toContain('take');
    expect(renderParseError({ kind: 'unknown_direction', raw: 'sideways' })).toContain('sideways');
    expect(renderParseError({ kind: 'no_such_target', ref: 'unicorn' })).toContain('unicorn');
    expect(renderParseError({ kind: 'ambiguous_target', ref: 'key', candidates: ['rusty key', 'silver key'] })).toContain('rusty key');
  });

  it('renderActionError returns the supplied reason', () => {
    expect(renderActionError("You can't go that way.")).toBe("You can't go that way.");
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- templates`
Expected: FAIL.

- [ ] **Step 3: Implement templates**

Create `src/core/engine/templates.ts`:

```ts
import type { Item } from '@core/domain/entities';
import type { Direction } from '@core/domain/entities';
import type { ParseError } from '@core/domain/actions';
import type { PerceptionView } from './perception';

const list = (items: readonly { label: string }[]): string =>
  items.map((i) => i.label).join(', ');

export function renderLook(view: PerceptionView): string {
  const lines: string[] = [];
  lines.push(view.location.label);
  lines.push(view.location.longDescription);
  if (view.items.length > 0) lines.push(`You see: ${list(view.items)}.`);
  if (view.agents.length > 0) lines.push(`Also here: ${list(view.agents)}.`);
  if (view.exits.length > 0) {
    const parts = view.exits.map((e) => {
      const tag = e.locked ? `${e.label}, locked` : e.label;
      return `${e.direction} (${tag})`;
    });
    lines.push(`Exits: ${parts.join(', ')}.`);
  } else {
    lines.push('There are no obvious exits.');
  }
  return lines.join('\n');
}

export function renderLookTarget(item: Item): string {
  return item.longDescription;
}

export function renderMoveSelf(dir: Direction): string {
  return `You go ${dir}.`;
}

export function renderTakeSelf(item: Item): string {
  return `Taken: ${item.label}.`;
}

export function renderDropSelf(item: Item): string {
  return `Dropped: ${item.label}.`;
}

export function renderInventory(items: readonly Item[]): string {
  if (items.length === 0) return 'You are carrying nothing.';
  return `You are carrying: ${list(items)}.`;
}

export function renderParseError(err: ParseError): string {
  switch (err.kind) {
    case 'empty':
      return 'Please type a command.';
    case 'unknown_verb':
      return `I don't know the verb "${err.verb}".`;
    case 'missing_argument':
      return `The verb "${err.verb}" needs something to act on.`;
    case 'unknown_direction':
      return `"${err.raw}" isn't a direction I understand.`;
    case 'no_such_target':
      return `You don't see any "${err.ref}" here.`;
    case 'ambiguous_target':
      return `Which do you mean — ${err.candidates.join(' or ')}?`;
  }
}

export function renderActionError(reason: string): string {
  return reason;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- templates`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 5: mechanical narration templates"
```

---

## Task 6: Parser

**Goal:** Verb-noun parser turning user text into `Action` or `ParseError`. Handles direction abbreviations, article stripping, perceivable noun resolution.

**Files:**
- Create: `src/core/engine/parser.ts`
- Test: `src/core/engine/parser.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { parse } from './parser';
import type { PerceptionView } from './perception';

const W = asWorldId('w');
const ACTOR: Agent = {
  id: asAgentId('char_self'), worldId: W, label: 'Paff',
  shortDescription: '', longDescription: '', locationId: asLocationId('loc_a'),
  hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false,
};
const LOC: Location = { id: asLocationId('loc_a'), worldId: W, label: 'A', shortDescription: '', longDescription: '' };
const map: Item = { id: asItemId('item_map'), worldId: W, label: 'fire map', shortDescription: '', longDescription: '', owner: { kind: 'location', id: LOC.id }, weight: 1, hidden: false };
const cloak: Item = { id: asItemId('item_cloak'), worldId: W, label: 'heat-resistant cloak', shortDescription: '', longDescription: '', owner: { kind: 'location', id: LOC.id }, weight: 2, hidden: false };
const key1: Item = { id: asItemId('item_rusty_key'), worldId: W, label: 'rusty key', shortDescription: '', longDescription: '', owner: { kind: 'location', id: LOC.id }, weight: 1, hidden: false };
const key2: Item = { id: asItemId('item_silver_key'), worldId: W, label: 'silver key', shortDescription: '', longDescription: '', owner: { kind: 'location', id: LOC.id }, weight: 1, hidden: false };
const exitN: Exit = { id: 'e' as never, worldId: W, from: LOC.id, to: asLocationId('loc_b'), direction: 'north', label: 'd', locked: false, lockedByItem: null };

const view = (items: Item[] = [map], agents: Agent[] = []): PerceptionView => ({
  actor: ACTOR, location: LOC, items, agents, exits: [exitN],
});

const inv = (items: Item[] = []): readonly Item[] => items;

describe('parse', () => {
  it('empty input yields empty error', () => {
    const r = parse('', ACTOR, view(), inv());
    expect(r.kind === 'empty').toBe(true);
  });

  it('unknown verb', () => {
    const r = parse('frobnicate the widget', ACTOR, view(), inv());
    if (r.kind !== 'unknown_verb') throw new Error('expected unknown_verb');
    expect(r.verb).toBe('frobnicate');
  });

  it('north and "n" both parse to move(north)', () => {
    const r1 = parse('north', ACTOR, view(), inv());
    const r2 = parse('n', ACTOR, view(), inv());
    if (r1.kind !== 'move' || r2.kind !== 'move') throw new Error();
    expect(r1.direction).toBe('north');
    expect(r2.direction).toBe('north');
  });

  it('"go north" parses to move(north)', () => {
    const r = parse('go north', ACTOR, view(), inv());
    if (r.kind !== 'move') throw new Error();
    expect(r.direction).toBe('north');
  });

  it('"move sideways" yields unknown_direction', () => {
    const r = parse('move sideways', ACTOR, view(), inv());
    expect(r.kind).toBe('unknown_direction');
  });

  it('"look" with no target', () => {
    const r = parse('look', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.targetRef).toBeNull();
  });

  it('"look at the fire map" strips article + preposition', () => {
    const r = parse('look at the fire map', ACTOR, view(), inv());
    if (r.kind !== 'look') throw new Error();
    expect(r.targetRef).toBe('fire map');
  });

  it('"take fire map" yields take action', () => {
    const r = parse('take fire map', ACTOR, view(), inv());
    if (r.kind !== 'take') throw new Error();
    expect(r.itemRef).toBe('fire map');
  });

  it('"take" alone yields missing_argument', () => {
    const r = parse('take', ACTOR, view(), inv());
    if (r.kind !== 'missing_argument') throw new Error();
    expect(r.verb).toBe('take');
  });

  it('"i" and "inventory" both produce inventory action', () => {
    expect(parse('i', ACTOR, view(), inv()).kind).toBe('inventory');
    expect(parse('inventory', ACTOR, view(), inv()).kind).toBe('inventory');
  });

  it('"drop fire map" with map in inventory parses', () => {
    const r = parse('drop fire map', ACTOR, view([]), inv([map]));
    if (r.kind !== 'drop') throw new Error();
    expect(r.itemRef).toBe('fire map');
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- parser`
Expected: FAIL.

- [ ] **Step 3: Implement parser**

Create `src/core/engine/parser.ts`:

```ts
import type { Action, ParseError } from '@core/domain/actions';
import type { Agent, Direction, Item } from '@core/domain/entities';
import { ALL_DIRECTIONS } from '@core/domain/entities';
import type { PerceptionView } from './perception';

const DIRECTION_ALIASES: Readonly<Record<string, Direction>> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down',
  north: 'north', south: 'south', east: 'east', west: 'west',
  northeast: 'northeast', northwest: 'northwest',
  southeast: 'southeast', southwest: 'southwest',
  up: 'up', down: 'down',
};

const STOP_WORDS = new Set(['the', 'a', 'an', 'at', 'to', 'on']);

export type ParseResult = Action | ParseError;

const tokens = (s: string): string[] =>
  s.trim().toLowerCase().split(/\s+/).filter(Boolean);

const stripStopWords = (toks: string[]): string[] =>
  toks.filter((t) => !STOP_WORDS.has(t));

const resolveDirection = (raw: string): Direction | null => {
  return DIRECTION_ALIASES[raw] ?? null;
};

export function parse(
  text: string,
  actor: Agent,
  view: PerceptionView,
  inventory: readonly Item[],
): ParseResult {
  const toks = tokens(text);
  if (toks.length === 0) return { kind: 'empty' };

  const first = toks[0]!;

  // Bare direction → move
  const bareDir = resolveDirection(first);
  if (bareDir && toks.length === 1) {
    return { kind: 'move', actorId: actor.id, direction: bareDir };
  }

  switch (first) {
    case 'go':
    case 'move': {
      if (toks.length < 2) return { kind: 'missing_argument', verb: first };
      const raw = toks.slice(1).join(' ');
      const dir = resolveDirection(toks[1]!);
      if (!dir) return { kind: 'unknown_direction', raw };
      return { kind: 'move', actorId: actor.id, direction: dir };
    }

    case 'look':
    case 'l': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: 'look', actorId: actor.id, targetRef: null };
      return { kind: 'look', actorId: actor.id, targetRef: rest.join(' ') };
    }

    case 'take':
    case 'get':
    case 'pick': {
      const rest = stripStopWords(toks.slice(1).filter((t) => t !== 'up'));
      if (rest.length === 0) return { kind: 'missing_argument', verb: 'take' };
      return { kind: 'take', actorId: actor.id, itemRef: rest.join(' ') };
    }

    case 'drop': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: 'missing_argument', verb: 'drop' };
      return { kind: 'drop', actorId: actor.id, itemRef: rest.join(' ') };
    }

    case 'inventory':
    case 'i':
    case 'inv':
      return { kind: 'inventory', actorId: actor.id };
  }

  // Direction-only with extra tokens
  if (bareDir) {
    return { kind: 'unknown_direction', raw: toks.join(' ') };
  }

  return { kind: 'unknown_verb', verb: first };
}

/**
 * Resolve a noun reference against a candidate set.
 * Used by handlers that need to turn `itemRef` / `targetRef` into a concrete item.
 * Exact label match wins; otherwise prefix; ambiguous → ambiguous_target.
 */
export function resolveItem(
  ref: string,
  candidates: readonly Item[],
): { ok: true; item: Item } | { ok: false; error: ParseError } {
  const needle = ref.toLowerCase();
  const exact = candidates.filter((c) => c.label.toLowerCase() === needle);
  if (exact.length === 1) return { ok: true, item: exact[0]! };
  if (exact.length > 1) {
    return { ok: false, error: { kind: 'ambiguous_target', ref, candidates: exact.map((c) => c.label) } };
  }
  const prefix = candidates.filter((c) => c.label.toLowerCase().startsWith(needle));
  if (prefix.length === 1) return { ok: true, item: prefix[0]! };
  if (prefix.length > 1) {
    return { ok: false, error: { kind: 'ambiguous_target', ref, candidates: prefix.map((c) => c.label) } };
  }
  const contains = candidates.filter((c) => c.label.toLowerCase().includes(needle));
  if (contains.length === 1) return { ok: true, item: contains[0]! };
  if (contains.length > 1) {
    return { ok: false, error: { kind: 'ambiguous_target', ref, candidates: contains.map((c) => c.label) } };
  }
  return { ok: false, error: { kind: 'no_such_target', ref } };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- parser`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 6: verb-noun parser with direction aliases and noun resolution"
```

---

## Task 7: Action handlers

**Goal:** Implement `move`, `look`, `take`, `drop`, `inventory` handlers. Each: validate, mutate via repo, emit event, return rendered text.

**Files:**
- Create: `src/core/engine/actions/move.ts`
- Create: `src/core/engine/actions/look.ts`
- Create: `src/core/engine/actions/take.ts`
- Create: `src/core/engine/actions/drop.ts`
- Create: `src/core/engine/actions/inventory.ts`
- Create: `src/core/engine/actions/registry.ts`
- Create: `src/core/engine/ids-gen.ts`
- Test: `src/core/engine/actions/move.test.ts`
- Test: `src/core/engine/actions/take.test.ts`
- Test: `src/core/engine/actions/drop.test.ts`
- Test: `src/core/engine/actions/look.test.ts`

- [ ] **Step 1: Event id generator**

Create `src/core/engine/ids-gen.ts`:

```ts
import { type EventId, asEventId } from '@core/domain/ids';

let counter = 0;
export function nextEventId(now = Date.now()): EventId {
  counter = (counter + 1) % 1_000_000;
  return asEventId(`evt_${now.toString(36)}_${counter.toString(36)}`);
}
```

- [ ] **Step 2: Failing test for `move`**

Create `src/core/engine/actions/move.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Exit, Location } from '@core/domain/entities';
import { MemoryRepository } from '@infra/memory-repository';
import { handleMove } from './move';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = { id: A, worldId: W, label: 'A', shortDescription: 'a', longDescription: 'a' };
const locB: Location = { id: B, worldId: W, label: 'B', shortDescription: 'b', longDescription: 'b' };
const exitN: Exit = { id: asExitId('e1'), worldId: W, from: A, to: B, direction: 'north', label: 'door', locked: false, lockedByItem: null };
const exitS: Exit = { id: asExitId('e2'), worldId: W, from: A, to: B, direction: 'south', label: 'gate', locked: true, lockedByItem: asItemId('item_key') };
const paff: Agent = { id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false };

describe('handleMove', () => {
  it('moves the actor and emits a move event when exit exists and is unlocked', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [exitN], items: [], agents: [paff] });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'north' }, repo);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('You go north.');
    expect((await repo.getAgent(paff.id)).locationId).toBe('loc_b');
    const events = await repo.recentEvents(10);
    expect(events.map((e) => e.kind)).toEqual(['move']);
  });

  it('refuses when no exit in that direction', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [exitN], items: [], agents: [paff] });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'east' }, repo);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/can't go that way/i);
  });

  it('refuses when exit is locked, naming the obstacle', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [exitS], items: [], agents: [paff] });
    const r = await handleMove({ kind: 'move', actorId: paff.id, direction: 'south' }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toContain('gate');
    expect(r.error).toMatch(/locked/i);
  });
});
```

- [ ] **Step 3: Run — verify failure**

Run: `pnpm test -- move`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `move`**

Create `src/core/engine/actions/move.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { renderMoveSelf } from '../templates';
import { perceive } from '../perception';
import { nextEventId } from '../ids-gen';

export interface ActionOutcome {
  readonly render: string;
  readonly event: DomainEvent;
}

export async function handleMove(
  action: Extract<Action, { kind: 'move' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const exit = view.exits.find((e) => e.direction === action.direction);
  if (!exit) return Err("You can't go that way.");
  if (exit.locked) return Err(`The ${exit.label} is locked.`);

  await repo.moveAgent(action.actorId, exit.to);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'move',
    witnesses,
    createdAt: new Date(),
    from: view.location.id,
    to: exit.to,
    direction: action.direction,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderMoveSelf(action.direction), event });
}
```

- [ ] **Step 5: Run — verify pass**

Run: `pnpm test -- move`
Expected: PASS, 3 tests.

- [ ] **Step 6: `look` handler test + impl**

Create `src/core/engine/actions/look.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Item, Location } from '@core/domain/entities';
import { MemoryRepository } from '@infra/memory-repository';
import { handleLook } from './look';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = { id: A, worldId: W, label: 'The Goblet', shortDescription: 's', longDescription: 'A tavern.' };
const map: Item = { id: asItemId('item_map'), worldId: W, label: 'fire map', shortDescription: 's', longDescription: 'A real-time map.', owner: { kind: 'location', id: A }, weight: 1, hidden: false };
const paff: Agent = { id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false };

describe('handleLook', () => {
  it('with no target, returns the room view', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [map], agents: [paff] });
    const r = await handleLook({ kind: 'look', actorId: paff.id, targetRef: null }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render).toContain('The Goblet');
    expect(r.value.render).toContain('A tavern.');
    expect(r.value.render).toContain('fire map');
  });

  it('with target = fire map, returns its long description', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [map], agents: [paff] });
    const r = await handleLook({ kind: 'look', actorId: paff.id, targetRef: 'fire map' }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('A real-time map.');
  });

  it('with unknown target, returns no_such_target error', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [map], agents: [paff] });
    const r = await handleLook({ kind: 'look', actorId: paff.id, targetRef: 'unicorn' }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/unicorn/);
  });
});
```

Create `src/core/engine/actions/look.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { perceive } from '../perception';
import { renderLook, renderLookTarget, renderParseError } from '../templates';
import { resolveItem } from '../parser';
import { nextEventId } from '../ids-gen';
import type { ActionOutcome } from './move';

export async function handleLook(
  action: Extract<Action, { kind: 'look' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: action.actorId });
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const baseEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    witnesses,
    createdAt: new Date(),
  };

  if (action.targetRef === null) {
    const event: DomainEvent = { ...baseEvent, kind: 'look', locationId: view.location.id, targetItemId: null };
    await repo.appendEvent(event);
    return Ok({ render: renderLook(view), event });
  }

  const candidates = [...view.items, ...inventory];
  const r = resolveItem(action.targetRef, candidates);
  if (!r.ok) return Err(renderParseError(r.error));
  const event: DomainEvent = { ...baseEvent, kind: 'look', locationId: view.location.id, targetItemId: r.item.id };
  await repo.appendEvent(event);
  return Ok({ render: renderLookTarget(r.item), event });
}
```

Run: `pnpm test -- look`
Expected: PASS, 3 tests.

- [ ] **Step 7: `take` handler test + impl**

Create `src/core/engine/actions/take.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Item, Location } from '@core/domain/entities';
import { MemoryRepository } from '@infra/memory-repository';
import { handleTake } from './take';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '' };
const map: Item = { id: asItemId('item_map'), worldId: W, label: 'fire map', shortDescription: '', longDescription: '', owner: { kind: 'location', id: A }, weight: 1, hidden: false };
const heavy: Item = { id: asItemId('item_h'), worldId: W, label: 'anvil', shortDescription: '', longDescription: '', owner: { kind: 'location', id: A }, weight: 99, hidden: false };
const hidden: Item = { id: asItemId('item_box'), worldId: W, label: 'wooden box', shortDescription: '', longDescription: '', owner: { kind: 'location', id: A }, weight: 1, hidden: true };
const paff: Agent = { id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false };

describe('handleTake', () => {
  it('transfers the item to the actor and emits a take event', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [map], agents: [paff] });
    const r = await handleTake({ kind: 'take', actorId: paff.id, itemRef: 'fire map' }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('Taken: fire map.');
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: paff.id });
    expect(owned.map((i) => i.id)).toEqual(['item_map']);
  });

  it('refuses when the item is not in the room', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [], agents: [paff] });
    const r = await handleTake({ kind: 'take', actorId: paff.id, itemRef: 'fire map' }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/fire map/);
  });

  it('refuses to take a hidden item (treated as not present)', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [hidden], agents: [paff] });
    const r = await handleTake({ kind: 'take', actorId: paff.id, itemRef: 'wooden box' }, repo);
    expect(r.ok).toBe(false);
  });

  it('refuses to take an item heavier than capacity', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [heavy], agents: [paff] });
    const r = await handleTake({ kind: 'take', actorId: paff.id, itemRef: 'anvil' }, repo);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/too heavy/i);
  });
});
```

Create `src/core/engine/actions/take.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { perceive } from '../perception';
import { renderTakeSelf, renderParseError } from '../templates';
import { resolveItem } from '../parser';
import { nextEventId } from '../ids-gen';
import type { ActionOutcome } from './move';

export async function handleTake(
  action: Extract<Action, { kind: 'take' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const r = resolveItem(action.itemRef, view.items);
  if (!r.ok) return Err(renderParseError(r.error));
  const item = r.item;

  const carried = await repo.itemsOwnedBy({ kind: 'agent', id: action.actorId });
  const carriedWeight = carried.reduce((sum, i) => sum + i.weight, 0);
  if (carriedWeight + item.weight > view.actor.capacity) {
    return Err(`The ${item.label} is too heavy for you to carry right now.`);
  }

  await repo.transferItem(item.id, { kind: 'agent', id: action.actorId });
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'take',
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    from: view.location.id,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderTakeSelf(item), event });
}
```

Run: `pnpm test -- take`
Expected: PASS, 4 tests.

- [ ] **Step 8: `drop` handler test + impl**

Create `src/core/engine/actions/drop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Item, Location } from '@core/domain/entities';
import { MemoryRepository } from '@infra/memory-repository';
import { handleDrop } from './drop';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const loc: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '' };
const paff: Agent = { id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false };
const heldMap: Item = { id: asItemId('item_map'), worldId: W, label: 'fire map', shortDescription: '', longDescription: '', owner: { kind: 'agent', id: paff.id }, weight: 1, hidden: false };

describe('handleDrop', () => {
  it('transfers the held item to the location', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [heldMap], agents: [paff] });
    const r = await handleDrop({ kind: 'drop', actorId: paff.id, itemRef: 'fire map' }, repo);
    if (!r.ok) throw new Error();
    expect(r.value.render).toBe('Dropped: fire map.');
    const onFloor = await repo.itemsOwnedBy({ kind: 'location', id: A });
    expect(onFloor.map((i) => i.id)).toEqual(['item_map']);
  });

  it('refuses when actor is not holding the item', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [], agents: [paff] });
    const r = await handleDrop({ kind: 'drop', actorId: paff.id, itemRef: 'fire map' }, repo);
    expect(r.ok).toBe(false);
  });
});
```

Create `src/core/engine/actions/drop.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Err, Ok, type Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { renderDropSelf, renderParseError } from '../templates';
import { resolveItem } from '../parser';
import { nextEventId } from '../ids-gen';
import type { ActionOutcome } from './move';

export async function handleDrop(
  action: Extract<Action, { kind: 'drop' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const actor = await repo.getAgent(action.actorId);
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: action.actorId });
  const r = resolveItem(action.itemRef, inventory);
  if (!r.ok) return Err(renderParseError(r.error));
  const item = r.item;

  await repo.transferItem(item.id, { kind: 'location', id: actor.locationId });
  const witnesses = (await repo.agentsAt(actor.locationId)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'drop',
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    to: actor.locationId,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderDropSelf(item), event });
}
```

Run: `pnpm test -- drop`
Expected: PASS, 2 tests.

- [ ] **Step 9: `inventory` handler (no separate test file — covered by integration)**

Create `src/core/engine/actions/inventory.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { Ok, type Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { renderInventory } from '../templates';
import { nextEventId } from '../ids-gen';
import type { ActionOutcome } from './move';

export async function handleInventory(
  action: Extract<Action, { kind: 'inventory' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: action.actorId });
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: 'inventory',
    witnesses: [action.actorId],
    createdAt: new Date(),
  };
  await repo.appendEvent(event);
  return Ok({ render: renderInventory(inventory), event });
}
```

- [ ] **Step 10: Action registry**

Create `src/core/engine/actions/registry.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { Result } from '@core/domain/result';
import type { Repository } from '../repository';
import { handleMove } from './move';
import { handleLook } from './look';
import { handleTake } from './take';
import { handleDrop } from './drop';
import { handleInventory } from './inventory';
import type { ActionOutcome } from './move';

export async function dispatch(
  action: Action,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  switch (action.kind) {
    case 'move': return handleMove(action, repo);
    case 'look': return handleLook(action, repo);
    case 'take': return handleTake(action, repo);
    case 'drop': return handleDrop(action, repo);
    case 'inventory': return handleInventory(action, repo);
  }
}
```

- [ ] **Step 11: Verify everything passes**

Run: `pnpm typecheck && pnpm test`
Expected: ALL GREEN.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Task 7: action handlers (move, look, take, drop, inventory) + registry"
```

---

## Task 8: Turn orchestrator

**Goal:** `runTurn(actorId, text, repo)` ties it together. Parse → dispatch → return rendered string + events.

**Files:**
- Create: `src/core/engine/turn.ts`
- Test: `src/core/engine/turn.test.ts`

- [ ] **Step 1: Failing test**

Create `src/core/engine/turn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { MemoryRepository } from '@infra/memory-repository';
import { runTurn } from './turn';

const W = asWorldId('w');
const A = asLocationId('loc_a'); const B = asLocationId('loc_b');
const locA: Location = { id: A, worldId: W, label: 'Tavern', shortDescription: '', longDescription: 'A tavern.' };
const locB: Location = { id: B, worldId: W, label: 'Street', shortDescription: '', longDescription: 'A street.' };
const door: Exit = { id: asExitId('e'), worldId: W, from: A, to: B, direction: 'south', label: 'door', locked: false, lockedByItem: null };
const map: Item = { id: asItemId('item_map'), worldId: W, label: 'fire map', shortDescription: '', longDescription: 'a map', owner: { kind: 'location', id: A }, weight: 1, hidden: false };
const paff: Agent = { id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, goal: null, autonomous: false };

describe('runTurn', () => {
  it('parses a command, dispatches, and returns rendered text', async () => {
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [door], items: [map], agents: [paff] });
    const r = await runTurn(paff.id, 'take fire map', repo);
    expect(r.render).toBe('Taken: fire map.');
    expect(r.events).toHaveLength(1);
  });

  it('returns a parse-error message for unknown verbs without throwing', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [paff] });
    const r = await runTurn(paff.id, 'frobnicate', repo);
    expect(r.render).toContain('frobnicate');
    expect(r.events).toEqual([]);
  });

  it('returns an action-error message when the action fails', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [paff] });
    const r = await runTurn(paff.id, 'north', repo);
    expect(r.render).toMatch(/can't go that way/i);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm test -- turn`
Expected: FAIL.

- [ ] **Step 3: Implement turn**

Create `src/core/engine/turn.ts`:

```ts
import type { AgentId } from '@core/domain/ids';
import type { DomainEvent } from '@core/domain/events';
import type { Repository } from './repository';
import { parse } from './parser';
import { perceive } from './perception';
import { dispatch } from './actions/registry';
import { renderActionError, renderParseError } from './templates';

export interface TurnResult {
  readonly render: string;
  readonly events: readonly DomainEvent[];
}

export async function runTurn(
  actorId: AgentId,
  text: string,
  repo: Repository,
): Promise<TurnResult> {
  const actor = await repo.getAgent(actorId);
  const view = await perceive(actorId, repo);
  const inventory = await repo.itemsOwnedBy({ kind: 'agent', id: actorId });

  const parsed = parse(text, actor, view, inventory);
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

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- turn`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 8: runTurn orchestrator (parse → dispatch → render)"
```

---

## Task 9: Drizzle schema

**Goal:** SQLite schema mirroring the domain model, plus a migration. Schema is multi-world capable.

**Files:**
- Create: `src/infra/schema.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/0000_initial.sql` (generated, then committed)

- [ ] **Step 1: Schema**

Create `src/infra/schema.ts`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
});

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  worldId: text('world_id').notNull().references(() => worlds.id),
  label: text('label').notNull(),
  shortDescription: text('short_description').notNull(),
  longDescription: text('long_description').notNull(),
});

export const exits = sqliteTable('exits', {
  id: text('id').primaryKey(),
  worldId: text('world_id').notNull().references(() => worlds.id),
  fromLocationId: text('from_location_id').notNull().references(() => locations.id),
  toLocationId: text('to_location_id').notNull().references(() => locations.id),
  direction: text('direction').notNull(),
  label: text('label').notNull(),
  locked: integer('locked', { mode: 'boolean' }).notNull(),
  lockedByItemId: text('locked_by_item_id'),
});

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  worldId: text('world_id').notNull().references(() => worlds.id),
  label: text('label').notNull(),
  shortDescription: text('short_description').notNull(),
  longDescription: text('long_description').notNull(),
  ownerKind: text('owner_kind', { enum: ['location', 'agent', 'item'] }).notNull(),
  ownerId: text('owner_id').notNull(),
  weight: integer('weight').notNull(),
  hidden: integer('hidden', { mode: 'boolean' }).notNull(),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  worldId: text('world_id').notNull().references(() => worlds.id),
  label: text('label').notNull(),
  shortDescription: text('short_description').notNull(),
  longDescription: text('long_description').notNull(),
  locationId: text('location_id').notNull().references(() => locations.id),
  hp: integer('hp').notNull(),
  damage: integer('damage').notNull(),
  defense: integer('defense').notNull(),
  capacity: integer('capacity').notNull(),
  mood: text('mood'),
  goal: text('goal'),
  autonomous: integer('autonomous', { mode: 'boolean' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  worldId: text('world_id').notNull().references(() => worlds.id),
  actorId: text('actor_id').notNull().references(() => agents.id),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  witnesses: text('witnesses', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
```

- [ ] **Step 2: Drizzle config**

Create `drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit';
export default {
  schema: './src/infra/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: './imagined-dungeons.db' },
} satisfies Config;
```

- [ ] **Step 3: Generate migration**

Run:

```bash
pnpm exec drizzle-kit generate
```

Expected: `drizzle/0000_*.sql` written. Inspect briefly to confirm tables match the schema.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 9: Drizzle schema + initial SQLite migration"
```

---

## Task 10: SQLite repository

**Goal:** Concrete `Repository` implementation backed by `better-sqlite3` + Drizzle. Integration-tested against `:memory:`.

**Files:**
- Create: `src/infra/db.ts`
- Create: `src/infra/sqlite-repository.ts`
- Test: `tests/integration/sqlite-repository.test.ts`

- [ ] **Step 1: DB connection helper**

Create `src/infra/db.ts`:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  readonly db: DB;
  close(): void;
}

export function openDb(filename: string): DbHandle {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return { db, close: () => sqlite.close() };
}
```

- [ ] **Step 2: Failing integration test**

Create `tests/integration/sqlite-repository.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { openDb, type DbHandle } from '@infra/db';
import { SqliteRepository } from '@infra/sqlite-repository';
import { asAgentId, asEventId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import * as schema from '@infra/schema';

let handle: DbHandle;
const W = asWorldId('w_test');

beforeEach(async () => {
  handle = openDb(':memory:');
  await handle.db.insert(schema.worlds).values({ id: W, label: 'test' });
  await handle.db.insert(schema.locations).values([
    { id: 'loc_a', worldId: W, label: 'A', shortDescription: 'a', longDescription: 'a' },
    { id: 'loc_b', worldId: W, label: 'B', shortDescription: 'b', longDescription: 'b' },
  ]);
  await handle.db.insert(schema.agents).values({
    id: 'char_p', worldId: W, label: 'Paff',
    shortDescription: '', longDescription: '', locationId: 'loc_a',
    hp: 10, damage: 0, defense: 0, capacity: 10,
    mood: null, goal: null, autonomous: false,
  });
  await handle.db.insert(schema.items).values({
    id: 'item_map', worldId: W, label: 'fire map',
    shortDescription: '', longDescription: '',
    ownerKind: 'location', ownerId: 'loc_a', weight: 1, hidden: false,
  });
});

afterEach(() => handle.close());

describe('SqliteRepository', () => {
  it('moves an agent durably', async () => {
    const repo = new SqliteRepository(handle.db, W);
    await repo.moveAgent(asAgentId('char_p'), asLocationId('loc_b'));
    const a = await repo.getAgent(asAgentId('char_p'));
    expect(a.locationId).toBe('loc_b');
  });

  it('transfers an item between location and agent', async () => {
    const repo = new SqliteRepository(handle.db, W);
    await repo.transferItem(asItemId('item_map'), { kind: 'agent', id: asAgentId('char_p') });
    const owned = await repo.itemsOwnedBy({ kind: 'agent', id: asAgentId('char_p') });
    expect(owned.map((i) => i.id)).toEqual(['item_map']);
  });

  it('appends and reads events', async () => {
    const repo = new SqliteRepository(handle.db, W);
    await repo.appendEvent({
      id: asEventId('evt_1'), worldId: W, actorId: asAgentId('char_p'),
      kind: 'inventory', witnesses: [asAgentId('char_p')], createdAt: new Date(),
    });
    const evs = await repo.recentEvents(10);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.kind).toBe('inventory');
  });
});
```

- [ ] **Step 3: Run — verify failure**

Run: `pnpm test -- sqlite-repository`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement SqliteRepository**

Create `src/infra/sqlite-repository.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { DB } from './db';
import * as schema from './schema';
import type { Repository } from '@core/engine/repository';
import type { Agent, Direction, Exit, Item, Location, Owner } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import {
  type AgentId, type EventId, type ExitId, type ItemId, type LocationId, type WorldId,
  asAgentId, asEventId, asExitId, asItemId, asLocationId,
} from '@core/domain/ids';

const toLocation = (r: typeof schema.locations.$inferSelect, worldId: WorldId): Location => ({
  id: asLocationId(r.id), worldId, label: r.label,
  shortDescription: r.shortDescription, longDescription: r.longDescription,
});

const toAgent = (r: typeof schema.agents.$inferSelect, worldId: WorldId): Agent => ({
  id: asAgentId(r.id), worldId, label: r.label,
  shortDescription: r.shortDescription, longDescription: r.longDescription,
  locationId: asLocationId(r.locationId),
  hp: r.hp, damage: r.damage, defense: r.defense, capacity: r.capacity,
  mood: r.mood, goal: r.goal, autonomous: r.autonomous,
});

const toItem = (r: typeof schema.items.$inferSelect, worldId: WorldId): Item => ({
  id: asItemId(r.id), worldId, label: r.label,
  shortDescription: r.shortDescription, longDescription: r.longDescription,
  owner: ownerOf(r.ownerKind, r.ownerId),
  weight: r.weight, hidden: r.hidden,
});

const ownerOf = (kind: 'location' | 'agent' | 'item', id: string): Owner => {
  if (kind === 'location') return { kind, id: asLocationId(id) };
  if (kind === 'agent') return { kind, id: asAgentId(id) };
  return { kind, id: asItemId(id) };
};

const toExit = (r: typeof schema.exits.$inferSelect, worldId: WorldId): Exit => ({
  id: asExitId(r.id), worldId,
  from: asLocationId(r.fromLocationId), to: asLocationId(r.toLocationId),
  direction: r.direction as Direction, label: r.label,
  locked: r.locked, lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});

export class SqliteRepository implements Repository {
  constructor(private readonly db: DB, private readonly worldId: WorldId) {}

  async getWorldId(): Promise<WorldId> { return this.worldId; }

  async getAgent(id: AgentId): Promise<Agent> {
    const rows = await this.db.select().from(schema.agents).where(eq(schema.agents.id, id));
    if (rows.length === 0) throw new Error(`agent not found: ${id}`);
    return toAgent(rows[0]!, this.worldId);
  }

  async getLocation(id: LocationId): Promise<Location> {
    const rows = await this.db.select().from(schema.locations).where(eq(schema.locations.id, id));
    if (rows.length === 0) throw new Error(`location not found: ${id}`);
    return toLocation(rows[0]!, this.worldId);
  }

  async getItem(id: ItemId): Promise<Item> {
    const rows = await this.db.select().from(schema.items).where(eq(schema.items.id, id));
    if (rows.length === 0) throw new Error(`item not found: ${id}`);
    return toItem(rows[0]!, this.worldId);
  }

  async getExit(id: ExitId): Promise<Exit> {
    const rows = await this.db.select().from(schema.exits).where(eq(schema.exits.id, id));
    if (rows.length === 0) throw new Error(`exit not found: ${id}`);
    return toExit(rows[0]!, this.worldId);
  }

  async itemsOwnedBy(owner: Owner): Promise<readonly Item[]> {
    const rows = await this.db.select().from(schema.items).where(
      and(eq(schema.items.ownerKind, owner.kind), eq(schema.items.ownerId, owner.id))
    );
    return rows.map((r) => toItem(r, this.worldId));
  }

  async agentsAt(loc: LocationId): Promise<readonly Agent[]> {
    const rows = await this.db.select().from(schema.agents).where(eq(schema.agents.locationId, loc));
    return rows.map((r) => toAgent(r, this.worldId));
  }

  async exitsFrom(loc: LocationId): Promise<readonly Exit[]> {
    const rows = await this.db.select().from(schema.exits).where(eq(schema.exits.fromLocationId, loc));
    return rows.map((r) => toExit(r, this.worldId));
  }

  async moveAgent(id: AgentId, to: LocationId): Promise<void> {
    await this.db.update(schema.agents).set({ locationId: to }).where(eq(schema.agents.id, id));
  }

  async transferItem(id: ItemId, to: Owner): Promise<void> {
    await this.db.update(schema.items)
      .set({ ownerKind: to.kind, ownerId: to.id })
      .where(eq(schema.items.id, id));
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    const { id, worldId, actorId, kind, witnesses, createdAt, ...rest } = event;
    await this.db.insert(schema.events).values({
      id, worldId, actorId, kind, witnesses: [...witnesses], createdAt,
      payload: rest,
    });
  }

  async recentEvents(limit: number): Promise<readonly DomainEvent[]> {
    const rows = await this.db.select().from(schema.events).orderBy(schema.events.createdAt);
    const slice = rows.slice(-limit);
    return slice.map((r) => ({
      id: asEventId(r.id),
      worldId: this.worldId,
      actorId: asAgentId(r.actorId),
      kind: r.kind as DomainEvent['kind'],
      witnesses: (r.witnesses as string[]).map(asAgentId),
      createdAt: r.createdAt,
      ...(r.payload as object),
    }) as DomainEvent);
  }
}
```

- [ ] **Step 5: Run — verify pass**

Run: `pnpm test -- sqlite-repository`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Task 10: SqliteRepository implementation + integration tests"
```

---

## Task 11: World seeder from burning-district-data.md

**Goal:** Parse the markdown tables into a typed `WorldData` constant; seeder applies it idempotently on first boot. The parser is build-time; the seeder runs at startup.

**Files:**
- Create: `scripts/parse-world.ts`
- Create: `src/infra/seed/burning-district.ts` (generated, committed)
- Create: `src/infra/seed/seeder.ts`
- Test: `tests/integration/seeder.test.ts`

- [ ] **Step 1: Build-time parser script**

Create `scripts/parse-world.ts`:

```ts
/**
 * Reads burning-district-data.md and emits src/infra/seed/burning-district.ts.
 * Run: `pnpm exec tsx scripts/parse-world.ts`
 *
 * The parser is pragmatic, not general — it knows only about the table layout
 * actually present in the source markdown. If the source markdown changes
 * shape, this script must be updated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve('burning-district-data.md');
const OUT = resolve('src/infra/seed/burning-district.ts');

interface Row { [k: string]: string }

function tablesByHeading(md: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  const lines = md.split('\n');
  let heading = '';
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length < 2 || !heading) { buffer = []; return; }
    const head = buffer[0]!.split('|').map((c) => c.trim()).filter(Boolean);
    const rows = buffer.slice(2).map((line) => {
      const cells = line.split('|').map((c) => c.trim());
      // first/last empties from leading/trailing pipes
      const trimmed = cells[0] === '' ? cells.slice(1, -1) : cells;
      const row: Row = {};
      head.forEach((h, i) => { row[h] = trimmed[i] ?? ''; });
      return row;
    });
    out[heading] = (out[heading] ?? []).concat(rows);
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('### ')) {
      flush();
      heading = line.replace(/^#+\s*/, '').trim();
    } else if (line.startsWith('|') && line.includes('|', 1)) {
      buffer.push(line);
    } else {
      flush();
    }
  }
  flush();
  return out;
}

function backtickInner(s: string): string {
  const m = s.match(/`([^`]+)`/);
  return m ? m[1]! : s;
}

function boolish(s: string): boolean {
  return /^yes$/i.test(s.trim());
}

function num(s: string, fallback = 0): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

const md = readFileSync(SRC, 'utf8');
const tables = tablesByHeading(md);

// Locations: section "Locations"
const rawLocs = tables['Locations'] ?? [];
const locations = rawLocs.map((r) => ({
  id: backtickInner(r['ID']!),
  label: r['Name']!,
  shortDescription: r['Short Description']!,
  longDescription: r['Long Description']!,
}));

// Exits: section "Exits"
const rawExits = tables['Exits'] ?? [];
const exits = rawExits.map((r) => ({
  id: backtickInner(r['ID']!),
  from: backtickInner(r['From']!),
  to: backtickInner(r['To']!),
  direction: r['Direction']!.toLowerCase(),
  label: r['Name']!,
  locked: boolish(r['Locked']!),
  // lockedByItem isn't a table column; encoded in Notes — leave null for now,
  // we only need the locked flag for the slice.
  lockedByItem: null as string | null,
}));

// Items merged from "Key Quest Items", "Tools & Trinkets", "Captain Serena's Ship Items"
const itemSections = ['Key Quest Items', 'Tools & Trinkets', "Captain Serena's Ship Items"];
const items = itemSections.flatMap((sec) => (tables[sec] ?? []).map((r) => {
  const rawOwner = r['Location / Holder'] ?? r['Location'] ?? '';
  const ownerToken = backtickInner(rawOwner);
  // owner could be `loc_*`, `char_*`, or `item_*` (container nesting)
  const ownerKind: 'location' | 'agent' | 'item' =
    ownerToken.startsWith('loc_') ? 'location'
    : ownerToken.startsWith('char_') ? 'agent'
    : ownerToken.startsWith('item_') ? 'item'
    : 'location';
  return {
    id: backtickInner(r['ID']!),
    label: r['Name']!.replace(/\*\*/g, ''),
    shortDescription: r['Notes'] ?? '',
    longDescription: r['Notes'] ?? '',
    ownerKind,
    ownerId: ownerToken,
    weight: num(r['Weight'] ?? '1', 1),
    hidden: boolish(r['Hidden'] ?? 'No'),
  };
}));

// Player + NPCs
const playerRows = tables['Player Character'] ?? [];
const npcRows = tables['NPCs'] ?? [];
const player = playerRows.map((r) => ({
  id: backtickInner(r['ID']!),
  label: r['Name']!.replace(/\*\*/g, ''),
  locationId: backtickInner(r['Location']!),
  hp: num(r['HP']!, 10), damage: num(r['DMG']!, 1), defense: num(r['DEF']!, 10),
  capacity: num(r['Capacity']!, 10),
  mood: null as string | null, goal: null as string | null,
  autonomous: false,
  shortDescription: '', longDescription: '',
}));
const npcs = npcRows
  .filter((r) => backtickInner(r['ID']!) !== 'system')
  .map((r) => ({
    id: backtickInner(r['ID']!),
    label: r['Name']!.replace(/\*\*/g, ''),
    locationId: backtickInner(r['Location']!),
    hp: num(r['HP']!, 10), damage: num(r['DMG']!, 1), defense: num(r['DEF']!, 10),
    capacity: 10,
    mood: r['Mood'] ?? null, goal: r['Goal'] ?? null,
    autonomous: false, // disabled for the mechanical slice
    shortDescription: '', longDescription: '',
  }));

const agents = [...player, ...npcs];

const banner = '// AUTO-GENERATED by scripts/parse-world.ts. Do not edit by hand.\n';
const out = `${banner}
export const BURNING_DISTRICT = ${JSON.stringify({ locations, exits, items, agents }, null, 2)} as const;
`;

writeFileSync(OUT, out);
console.log(`Wrote ${OUT}`);
```

Add `tsx` to devDependencies and an npm script:

Modify `package.json` `devDependencies` to add `"tsx": "^4.19.0"`, and add to `scripts`:

```json
"seed:gen": "tsx scripts/parse-world.ts"
```

- [ ] **Step 2: Run the parser**

Run:

```bash
mkdir -p src/infra/seed
pnpm install
pnpm seed:gen
```

Expected: `src/infra/seed/burning-district.ts` exists, contains 16 locations, ~31 exits, ~14+ items, 16 agents (1 player + 15 NPCs).

Inspect the generated file briefly to sanity-check counts.

- [ ] **Step 3: Seeder + idempotency test**

Create `src/infra/seed/seeder.ts`:

```ts
import * as schema from '../schema';
import type { DB } from '../db';
import { type WorldId, asWorldId } from '@core/domain/ids';
import { BURNING_DISTRICT } from './burning-district';

export const BURNING_DISTRICT_WORLD_ID: WorldId = asWorldId('w_burning_district');

export async function seedIfEmpty(db: DB): Promise<void> {
  const existing = await db.select().from(schema.worlds);
  if (existing.length > 0) return;

  const W = BURNING_DISTRICT_WORLD_ID;
  await db.insert(schema.worlds).values({ id: W, label: 'The Burning District' });

  await db.insert(schema.locations).values(
    BURNING_DISTRICT.locations.map((l) => ({ ...l, worldId: W })),
  );
  await db.insert(schema.agents).values(
    BURNING_DISTRICT.agents.map((a) => ({ ...a, worldId: W })),
  );
  // Items must be inserted before exits that reference lockedByItem, but exits
  // ignore that for now (lockedByItem is null).
  await db.insert(schema.items).values(
    BURNING_DISTRICT.items.map((i) => ({ ...i, worldId: W })),
  );
  await db.insert(schema.exits).values(
    BURNING_DISTRICT.exits.map((e) => ({
      id: e.id, worldId: W,
      fromLocationId: e.from, toLocationId: e.to,
      direction: e.direction, label: e.label,
      locked: e.locked, lockedByItemId: e.lockedByItem,
    })),
  );
}
```

Create `tests/integration/seeder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '@infra/db';
import { seedIfEmpty, BURNING_DISTRICT_WORLD_ID } from '@infra/seed/seeder';
import { SqliteRepository } from '@infra/sqlite-repository';
import { asAgentId, asLocationId } from '@core/domain/ids';

describe('seedIfEmpty', () => {
  it('seeds the burning district once and is a no-op on second call', async () => {
    const h = openDb(':memory:');
    try {
      await seedIfEmpty(h.db);
      await seedIfEmpty(h.db); // should not throw

      const repo = new SqliteRepository(h.db, BURNING_DISTRICT_WORLD_ID);
      const paff = await repo.getAgent(asAgentId('char_39322'));
      expect(paff.label).toBe('Paff Pinkerton');
      expect(paff.locationId).toBe('loc_flaming_goblet');
      const exits = await repo.exitsFrom(asLocationId('loc_flaming_goblet'));
      expect(exits.length).toBeGreaterThanOrEqual(2);
    } finally {
      h.close();
    }
  });
});
```

- [ ] **Step 4: Run integration test**

Run: `pnpm test -- seeder`
Expected: PASS.

If a foreign-key error fires (e.g. an item owned by an agent that doesn't yet exist due to insertion order, or an item-in-item container), reorder inserts: worlds → locations → agents → items → exits, and within items insert location-owned and agent-owned first, then item-owned (containers' contents) last. Adjust `seeder.ts` to do two passes for items if needed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 11: world parser + seeder for burning district"
```

---

## Task 12: TanStack server functions + composition root

**Goal:** Wire engine + repo + DB behind two server functions: `submitCommand(text)` and `getInitialView()`. The page boots, seeds, and runs.

**Files:**
- Create: `app/server/world.ts` (DB singleton + repo factory)
- Create: `app/server/submit.ts`
- Create: `app/server/initial-view.ts`

- [ ] **Step 1: Composition root**

Create `app/server/world.ts`:

```ts
import { openDb, type DbHandle } from '@infra/db';
import { SqliteRepository } from '@infra/sqlite-repository';
import { seedIfEmpty, BURNING_DISTRICT_WORLD_ID } from '@infra/seed/seeder';
import { asAgentId, type AgentId } from '@core/domain/ids';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';
export const PLAYER_ID: AgentId = asAgentId('char_39322'); // Paff Pinkerton

let handle: DbHandle | null = null;

export async function getRepo(): Promise<SqliteRepository> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db);
  }
  return new SqliteRepository(handle.db, BURNING_DISTRICT_WORLD_ID);
}
```

- [ ] **Step 2: `submitCommand` server fn**

Create `app/server/submit.ts`:

```ts
import { createServerFn } from '@tanstack/react-start';
import { runTurn } from '@core/engine/turn';
import { getRepo, PLAYER_ID } from './world';

export const submitCommand = createServerFn({ method: 'POST' })
  .validator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { text?: unknown }).text !== 'string') {
      throw new Error('Expected { text: string }');
    }
    return d as { text: string };
  })
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const result = await runTurn(PLAYER_ID, data.text, repo);
    return { render: result.render };
  });
```

- [ ] **Step 3: `getInitialView` server fn**

Create `app/server/initial-view.ts`:

```ts
import { createServerFn } from '@tanstack/react-start';
import { runTurn } from '@core/engine/turn';
import { getRepo, PLAYER_ID } from './world';

export const getInitialView = createServerFn({ method: 'GET' })
  .handler(async () => {
    const repo = await getRepo();
    const result = await runTurn(PLAYER_ID, 'look', repo);
    return { render: result.render };
  });
```

- [ ] **Step 4: Smoke-check the wiring**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 12: server functions (submitCommand, getInitialView) + composition root"
```

---

## Task 13: UI — transcript + command input

**Goal:** A minimal page: title bar, scrollable transcript, command input, Enter-to-submit. Initial view loaded on mount.

**Files:**
- Modify: `app/routes/index.tsx`

- [ ] **Step 1: Replace the placeholder route**

Replace the contents of `app/routes/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { submitCommand } from '~/server/submit';
import { getInitialView } from '~/server/initial-view';

export const Route = createFileRoute('/')({
  component: Page,
  loader: async () => await getInitialView(),
});

interface Line { id: number; kind: 'system' | 'user'; text: string }

function Page() {
  const initial = Route.useLoaderData();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: 'system', text: initial.render }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setLines((ls) => [...ls, { id: idRef.current++, kind: 'user', text: `> ${text}` }]);
    setInput('');
    try {
      const r = await submitCommand({ data: { text } });
      setLines((ls) => [...ls, { id: idRef.current++, kind: 'system', text: r.render }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16 }}>
      <h1 style={{ fontSize: 14, opacity: 0.6, margin: '0 0 12px' }}>Imagined Dungeons — The Burning District</h1>
      <div style={{ flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {lines.map((l) => (
          <div key={l.id} style={{ color: l.kind === 'user' ? '#9aff9a' : '#cfcfcf', marginBottom: 8 }}>
            {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <span style={{ alignSelf: 'center', color: '#9aff9a' }}>&gt;</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          style={{ flex: 1, background: '#0a0a0a', color: '#cfcfcf', border: '1px solid #333', padding: '6px 8px', fontFamily: 'inherit' }}
          placeholder="What do you do?"
        />
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Run dev server**

Run:

```bash
pnpm dev
```

Expected: server starts, prints a local URL. Open it. Page should render the Flaming Goblet's name, long description, items the player can see (`fire map`), "Also here:" agents (Spark), and a list of exits including a locked Tavern Back Door.

- [ ] **Step 3: Manual sanity check (5 minutes)**

Try the acceptance scenarios from the spec §11:
1. Initial view shows the Goblet, fire map, Spark, exits with locked door.
2. `n` or `north` → "The Tavern Back Door is locked."
3. `s` → moves to Dockside Markets, room rendered.
4. `look fire map` → after returning to the Goblet, returns the map's description.
5. `take fire map` → "Taken: fire map." Then `i` shows it. Then `look` no longer lists it on the floor.
6. `drop fire map` → reverses.
7. Refresh → state persists.

If any fail, debug and fix before committing.

- [ ] **Step 4: Stop dev server, commit**

```bash
git add -A
git commit -m "Task 13: minimal UI — transcript + command input"
```

---

## Task 14: End-to-end verification

**Goal:** Run all checks; the slice is done.

- [ ] **Step 1: Run the full suite**

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

Expected: all green.

- [ ] **Step 2: Resume-from-refresh check**

Delete `imagined-dungeons.db`, run `pnpm dev`, take the fire map, refresh the page; the inventory should still contain the fire map.

```bash
rm -f imagined-dungeons.db
pnpm dev
# in browser: take fire map ; i ; refresh ; i
```

Expected: after refresh, `i` shows the fire map.

- [ ] **Step 3: Commit any small fixes; tag the milestone**

```bash
git add -A
git commit --allow-empty -m "Slice 1 complete: mechanical text adventure"
git tag slice-1
```

---

## Self-review

**Spec coverage**:
- §3.1 domain → Task 2 ✓
- §3.2 engine (parser, perception, templates, actions, turn, repository interface) → Tasks 3–8 ✓
- §3.3 infra (schema, db, repos, seed) → Tasks 9–11 ✓
- §3.4 app (server fns, route) → Tasks 12–13 ✓
- §4 turn flow → Task 8 ✓
- §5 event log → events table in Task 9, append in handlers ✓
- §6 seed strategy → Task 11 ✓
- §7 testing strategy: unit (tasks 2–8), integration (tasks 10–11), no e2e — explicitly deferred per spec ✓
- §8 error boundary → handlers return `Result`, server fn doesn't throw on game errors → Task 12 ✓
- §11 acceptance criteria → Task 13 step 3 + Task 14 ✓

**Placeholder scan**: no TBDs, no "implement later", no "similar to". Code blocks present in every code step. ✓

**Type consistency**: `ActionOutcome` defined once in `move.ts` and re-imported. `Repository` interface used identically in handlers and integration tests. `Direction` literal type imported from domain everywhere. `Owner` discriminator (`'location' | 'agent' | 'item'`) consistent across schema, domain, and repo. ✓

**Known small risks the executing agent should watch for**:
- TanStack Start API surface changes between versions; if `createServerFn` signature differs from what's shown, follow the version's docs and keep the validator/handler intent.
- `routeTree.gen.ts` is generated by the dev server. Initial typecheck may fail until first `pnpm dev` run. Note added in Task 1.
- The build-time markdown parser (Task 11) is intentionally narrow; if `burning-district-data.md` is reshaped, regenerate via `pnpm seed:gen`.
