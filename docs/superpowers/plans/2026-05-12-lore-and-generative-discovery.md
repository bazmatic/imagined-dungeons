# Lore and Generative Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two related capabilities. (1) **Lore** — a world-level `worldOverview` + `storySoFar` plus per-tag descriptions, resolved by tag-union over a subject and its location, supplied to every LLM-backed pass. (2) **Generative discovery** — a new `search` verb and a failed-`look` fall-through that invoke an LLM pass returning `{ narration, spawnedItem?, spawnedAgent? }`. Spawned entities are persisted via the builder repo runtime bypass (mirrors `runSpawnTickPass`). Per-tick discovery is hard-bounded.

**Architecture:** A new pure module `src/core/lore/` owns `loadLoreContext` and per-tick limits. A new `src/core/engine/discovery.ts` runs the LLM pass and returns a uniform response. A new `search` action handler dispatches discovery and turns the response into events + builder upserts. The consequence engine's structured output gains `updatedStorySoFar`, which writes `world_lore.story_so_far` on the live world. `Agent`, `Item`, and `MonsterTemplate` gain `tags`; spawned-from-template agents copy `template.tags` at spawn time (frozen).

**Tech Stack:** TypeScript strict, Drizzle + better-sqlite3, vitest, biome. Reuses the existing `LanguageModel` port and the `FakeLanguageModel` test helper.

**Spec:** [docs/superpowers/specs/2026-05-12-lore-and-generative-discovery-design.md](../specs/2026-05-12-lore-and-generative-discovery-design.md)
**Companion specs (extended):**
- [docs/superpowers/specs/2026-05-08-campaign-builder-design.md](../specs/2026-05-08-campaign-builder-design.md)
- [docs/superpowers/specs/2026-05-09-monster-templates-design.md](../specs/2026-05-09-monster-templates-design.md)

**Style reference:** [docs/superpowers/plans/2026-05-09-monster-templates.md](./2026-05-09-monster-templates.md)

---

## File map

Created:

- `src/core/lore/context.ts` — pure-ish `loadLoreContext(repo, engineRepo, worldId, subject) → LoreContext`.
- `src/core/lore/context.test.ts`
- `src/core/lore/limits.ts` — `MAX_DISCOVERY_CALLS_PER_TICK = 1`.
- `src/core/lore/limits.test.ts`
- `src/core/engine/discovery.ts` — `runDiscovery(req, llm) → DiscoveryResponse` with strict-mode OpenAI schema.
- `src/core/engine/discovery.test.ts`
- `src/core/engine/actions/search.ts` — `Search` action handler invoking discovery and dispatching spawns.
- `src/core/engine/actions/search.test.ts`
- `app/server/admin/lore.ts` — TanStack server fns for lore CRUD.
- `drizzle/0009_lore.sql` — migration adding `world_lore`, `tag_lore`, and `tags` columns to `agents`/`items`/`monster_templates`.
- `tests/integration/lore-discovery.test.ts` — end-to-end search verb fires discovery, response narrated, spawned entity persisted.

Modified:

- `src/core/domain/builder-kinds.ts` — `DiscoverySubjectKind`, `DiscoveryTriggerKind`, new `ProblemKind` codes (`TagLoreTagEmpty`, `TagLoreDuplicate`), extended `EntityKind` with `TagLore`.
- `src/core/domain/builder-types.ts` — `WorldLore`, `TagLore`, `UpsertTagLoreInput`, `LoreContext`, `LoreSubject`, `DiscoverySubject`, `DiscoveryRequest`, `DiscoveryResponse`; extend `Agent`, `Item`, `MonsterTemplate` and their `Upsert*Input` types with `readonly tags`; extend `WorldTree` with `worldLore` and `tagLore`.
- `src/core/domain/ids.ts` — `TagLoreId` brand + `asTagLoreId`.
- `src/core/domain/kinds.ts` — `ActionKind.Search`.
- `src/core/domain/events.ts` — (no new variants; discovery emits a `Look` event with the narration).
- `src/infra/schema.ts` — `worldLore`, `tagLore` tables; additive `tags` column on `agents`, `items`, `monsterTemplates`.
- `src/core/builder/repository.ts` — port additions for `WorldLore` and `TagLore`.
- `src/infra/builder-memory-repository.ts` — implement lore port methods; `tags` on entity upserts; extend `clone`/`restore`.
- `src/infra/builder-sqlite-repository.ts` — implement lore port methods; JSON-stringify/parse `tags`.
- `src/core/builder/validate.ts` + `.test.ts` — `TagLoreTagEmpty`, `TagLoreDuplicate` rules.
- `src/core/builder/index.ts` + `.test.ts` — facade `getWorldLore`/`updateWorldLore`/`upsertTagLore`/`deleteTagLore`; extend `getWorldTree` and `copyTreeIntoWorld` with lore; live-world rejection via `requireDraft`; `expandSpawn` copies `template.tags` to the spawned agent.
- `src/core/spawning/expand.ts` + `.test.ts` — `expandSpawn` writes `tags` field on each produced insert.
- `src/core/engine/consequences.ts` + `.test.ts` — output schema gains `updatedStorySoFar`; engine writes to `world_lore` when non-null; prompt instructs the LLM.
- `src/core/engine/parser.ts` + `parser.test.ts` — `search` verb mapped to `ActionKind.Search`.
- `src/core/engine/actions/registry.ts` — register the `Search` handler.
- `src/core/engine/actions/look.ts` + `.test.ts` — failed-look path returns an `ActionOutcome` carrying a "discovery requested" hint; dispatch lives in `tick.ts`.
- `src/core/engine/tick.ts` + `.test.ts` — per-tick discovery budget; dispatch discovery on `Search` + failed-look paths; turn response into events + builder upserts.
- `src/mcp/tools.ts` + `src/mcp/server.test.ts` — `get_world_lore`, `update_world_lore`, `list_tag_lore`, `upsert_tag_lore`, `delete_tag_lore`. `reset_live_to_draft` remains unexposed.
- `app/routes/admin/$worldId.tsx` — Lore tree node with the two world slots and the per-tag list with edit affordances.

---

## Conventions enforced everywhere

- **No string literals in logic.** Every discriminator (`DiscoverySubjectKind`, `DiscoveryTriggerKind`, etc.) is defined as an `as const` object in `src/core/domain/*-kinds.ts`; its type alias uses `(typeof X)[keyof typeof X]`. Raw `'foo' | 'bar'` unions on domain types are forbidden.
- **Branded ids** (`TagLoreId`, etc.) via `Branded<string, ...>`; assign through `asTagLoreId(...)` helpers only.
- **Type-only imports** (`import type`) for any value never referenced at runtime — `verbatimModuleSyntax` is on.
- **`Result<T, BuilderError>`** from `@core/domain/result` for facade returns. No exceptions cross the facade seam.
- **Composite `(worldId, id)` primary keys** on per-world tables.
- **`requireDraft` gate** on every facade write against authored artefacts. Live-world writes for `world_lore.story_so_far` are reserved to the consequence engine's runtime port bypass (matches `runSpawnTickPass`).
- **MCP server never exposes** `reset_live_to_draft` or any other destructive cross-world op.
- **Biome:** import order, no non-null assertions (`arr[0]!` is forbidden — destructure-with-guard), `useImportType`. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **TDD:** write the failing test, run it, see it fail, then implement, run, see pass, commit.
- **Every commit** passes `pnpm typecheck && pnpm lint && pnpm test`. Frequent, bite-sized commits — one per logical task.
- **Drizzle migrations** via `pnpm exec drizzle-kit generate`, then rename to the next sequential number (`drizzle/0009_lore.sql`).
- **Commit prefix:** `lore: …`.

---

## Task 1: Domain kinds, brand ids, and types (spec §"Components" → builder-types; §"Decisions" #1, #2, #5, #7)

**Files:**
- Modify: `src/core/domain/builder-kinds.ts`
- Modify: `src/core/domain/builder-types.ts`
- Modify: `src/core/domain/ids.ts`
- Modify: `src/core/domain/kinds.ts`
- Modify: `src/core/domain/entities.ts`

- [ ] **Step 1: Brand `TagLoreId` in `ids.ts`**

```ts
// append to src/core/domain/ids.ts
export type TagLoreId = Branded<string, 'TagLoreId'>;
export const asTagLoreId = (s: string): TagLoreId => s as TagLoreId;
```

- [ ] **Step 2: Add `ActionKind.Search` in `kinds.ts`**

```ts
// in src/core/domain/kinds.ts — extend ActionKind
export const ActionKind = {
  Move: 'move',
  Look: 'look',
  Take: 'take',
  Drop: 'drop',
  Give: 'give',
  Inventory: 'inventory',
  Speak: 'speak',
  Emote: 'emote',
  Attack: 'attack',
  UpdateDescription: 'update_description',
  Search: 'search',
} as const;
```

- [ ] **Step 3: Add `DiscoverySubjectKind`, `DiscoveryTriggerKind`, lore `EntityKind` and `ProblemKind`s in `builder-kinds.ts`**

```ts
// in src/core/domain/builder-kinds.ts

export const DiscoverySubjectKind = {
  Location: 'location',
  Item: 'item',
  Agent: 'agent',
} as const;
export type DiscoverySubjectKind =
  (typeof DiscoverySubjectKind)[keyof typeof DiscoverySubjectKind];

export const DiscoveryTriggerKind = {
  FailedLook: 'failed_look',
  Search: 'search',
} as const;
export type DiscoveryTriggerKind =
  (typeof DiscoveryTriggerKind)[keyof typeof DiscoveryTriggerKind];
```

Extend `EntityKind` with `TagLore: 'tag_lore'`. Append to `ProblemKind`:

```ts
  TagLoreTagEmpty: 'tag_lore_tag_empty',
  TagLoreDuplicate: 'tag_lore_duplicate',
```

- [ ] **Step 4: Add `tags` to `Agent` and `Item` in `entities.ts`**

```ts
// in src/core/domain/entities.ts
export interface Item {
  // …existing fields…
  readonly tags: readonly string[];
}

export interface Agent {
  // …existing fields…
  readonly tags: readonly string[];
}
```

(`Location.tags` already exists.)

- [ ] **Step 5: Extend `builder-types.ts` with lore types, `tags`-extended upserts, and `WorldTree`**

```ts
// in src/core/domain/builder-types.ts — imports

import type { TagLoreId } from './ids';
import {
  DiscoverySubjectKind,
  DiscoveryTriggerKind,
} from './builder-kinds';

// new lore types

export interface WorldLore {
  readonly worldId: WorldId;
  readonly worldOverview: string;
  readonly storySoFar: string;
}

export interface TagLore {
  readonly id: TagLoreId;
  readonly worldId: WorldId;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface UpsertTagLoreInput {
  readonly id: TagLoreId;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface LoreContext {
  readonly worldOverview: string;
  readonly storySoFar: string;
  readonly tagDescriptions: Readonly<Record<string, string>>;
}

export interface LoreSubject {
  readonly tags: readonly string[];
  readonly locationId: LocationId | null;
}

export interface DiscoverySubject {
  readonly kind: DiscoverySubjectKind;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
}

export interface DiscoveryRequest {
  readonly trigger: DiscoveryTriggerKind;
  readonly actorId: AgentId;
  readonly locationId: LocationId;
  readonly query: string;
  readonly subject: DiscoverySubject | null;
  readonly loreContext: LoreContext;
  readonly visibleItems: readonly Item[];
  readonly visibleAgents: readonly Agent[];
}

export interface DiscoveryResponse {
  readonly narration: string;
  // When non-null and the id is in the request's visible list, the
  // engine routes through the normal `look <entity>` path and shows
  // the entity's authored description. `narration` and spawn fields
  // are ignored in this case.
  readonly matchedItemId: ItemId | null;
  readonly matchedAgentId: AgentId | null;
  readonly spawnedItem: UpsertItemInput | null;
  readonly spawnedAgent: UpsertAgentInput | null;
}
```

Extend `MonsterTemplate`, `UpsertItemInput`, `UpsertAgentInput`, `UpsertMonsterTemplateInput` with `readonly tags: readonly string[]`.

Extend `WorldTree`:

```ts
export interface WorldTree {
  readonly summary: WorldSummary;
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly templates: readonly MonsterTemplate[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly worldLore: WorldLore;
  readonly tagLore: readonly TagLore[];
}
```

Extend `EntityRef` with `{ kind: typeof EntityKind.TagLore; id: TagLoreId }`.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: downstream callers break (any place constructing an `Agent`/`Item`/`MonsterTemplate`/`WorldTree` literal must now supply `tags` / `worldLore` / `tagLore`). Note locations of the breakage — the next tasks fix them strategically.

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/
git commit -m "lore: domain kinds, brand ids, and types for lore and discovery"
```

---

## Task 2: Schema migration (spec §"Schema changes")

**Files:**
- Modify: `src/infra/schema.ts`
- Create: `drizzle/0009_lore.sql`

- [ ] **Step 1: Add `worldLore` and `tagLore` tables and the additive `tags` columns**

```ts
// append to src/infra/schema.ts

export const worldLore = sqliteTable('world_lore', {
  worldId: text('world_id')
    .primaryKey()
    .references(() => worlds.id),
  worldOverview: text('world_overview').notNull().default(''),
  storySoFar: text('story_so_far').notNull().default(''),
});

export const tagLore = sqliteTable(
  'tag_lore',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    tag: text('tag').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.id] }),
    uniqueIndex('tag_lore_world_tag_unique').on(t.worldId, t.tag),
  ],
);
```

Add `tags: text('tags').notNull().default('[]')` to the `agents`, `items`, and `monsterTemplates` table definitions.

- [ ] **Step 2: Generate the migration**

Run: `pnpm exec drizzle-kit generate`
Expected: a new `drizzle/0009_*.sql` file. Rename to `drizzle/0009_lore.sql`. Inspect: it should contain `CREATE TABLE world_lore`, `CREATE TABLE tag_lore`, `CREATE UNIQUE INDEX tag_lore_world_tag_unique`, and three `ALTER TABLE … ADD COLUMN tags text NOT NULL DEFAULT '[]'` statements.

- [ ] **Step 3: Apply and smoke-test**

Run: `pnpm typecheck && pnpm test tests/integration/builder-sqlite.test.ts`
Expected: existing tests still pass — additive migration applies cleanly to the in-memory schema bootstrapped by `openDb(':memory:')`.

- [ ] **Step 4: Commit**

```bash
git add src/infra/schema.ts drizzle/0009_lore.sql drizzle/meta/
git commit -m "lore: schema migration for world_lore, tag_lore, and tags columns"
```

---

## Task 3: `tags` on `Agent`, `Item`, `MonsterTemplate` everywhere (spec §"Schema changes" — additive `tags` columns; §"Decisions" #7)

**Files:**
- Modify: `src/core/builder/index.ts` and any test fixture builder helpers that construct these entities.

Strategy B: thread an explicit `tags: []` default at every existing call site so the suite stays green between tasks. (Lore content is wired up by Task 8.)

- [ ] **Step 1: Find every literal site**

Run: `pnpm typecheck 2>&1 | head -80`
Expected: a list of TS2741 ("Property 'tags' is missing in type ...") errors for `Agent`, `Item`, `MonsterTemplate`, `UpsertItemInput`, `UpsertAgentInput`, `UpsertMonsterTemplateInput`. Note every file path.

- [ ] **Step 2: Add `tags: []` defaults at each site**

For every reported file, add `tags: []` to the literal — either as a field on the entity object, or as a defaulted property on the `Upsert*Input`. For row-converters (sqlite repo) and adapter writes, defer to Task 5/6 (they get the real JSON read/write); for this task add `tags: []` as a placeholder.

- [ ] **Step 3: Typecheck and run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green. No behavioural changes — every entity now has an empty `tags` array.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "lore: thread empty tags defaults through every entity construction site"
```

---

## Task 4: BuilderRepository port extensions (spec §"Components" → builder facade)

**Files:**
- Modify: `src/core/builder/repository.ts`

- [ ] **Step 1: Extend the port**

```ts
// in src/core/builder/repository.ts — alongside existing methods
import type {
  TagLore,
  UpsertTagLoreInput,
  WorldLore,
} from '@core/domain/builder-types';
import type { TagLoreId, WorldId } from '@core/domain/ids';

  // …existing port methods…

  readWorldLore(worldId: WorldId): Promise<WorldLore>;
  writeWorldLore(
    worldId: WorldId,
    lore: Omit<WorldLore, 'worldId'>,
  ): Promise<void>;

  listTagLore(worldId: WorldId): Promise<readonly TagLore[]>;
  getTagLore(worldId: WorldId, id: TagLoreId): Promise<TagLore | null>;
  getTagLoreByTag(worldId: WorldId, tag: string): Promise<TagLore | null>;
  upsertTagLore(worldId: WorldId, input: UpsertTagLoreInput): Promise<void>;
  deleteTagLore(worldId: WorldId, id: TagLoreId): Promise<void>;
```

`readWorldLore` returns `{ worldId, worldOverview: '', storySoFar: '' }` when no row exists.

- [ ] **Step 2: Typecheck (adapters will fail)**

Run: `pnpm typecheck`
Expected: `MemoryBuilderRepository` and `SqliteBuilderRepository` no longer satisfy the port. Tasks 5 and 6 fix that. Keep the build going by adding throwing stubs to each adapter for typecheck-only progress:

```ts
async readWorldLore() { throw new Error('not implemented'); }
async writeWorldLore() { throw new Error('not implemented'); }
async listTagLore() { throw new Error('not implemented'); }
async getTagLore() { throw new Error('not implemented'); }
async getTagLoreByTag() { throw new Error('not implemented'); }
async upsertTagLore() { throw new Error('not implemented'); }
async deleteTagLore() { throw new Error('not implemented'); }
```

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green — existing tests don't call the new methods.

- [ ] **Step 3: Commit**

```bash
git add src/core/builder/repository.ts src/infra/builder-memory-repository.ts src/infra/builder-sqlite-repository.ts
git commit -m "lore: BuilderRepository port adds world_lore + tag_lore CRUD"
```

---

## Task 5: MemoryBuilderRepository implements lore + tags (spec §"Architecture")

**Files:**
- Modify: `src/infra/builder-memory-repository.ts`
- Modify: `src/infra/builder-memory-repository.test.ts` (or the dedicated test file if it exists; if not, exercise via `core/builder/index.test.ts` round-trips)

- [ ] **Step 1: Failing test — world-lore default + round-trip**

Add a test that constructs a `MemoryBuilderRepository`, calls `readWorldLore(W)` (expects defaults), then `writeWorldLore(W, { worldOverview: 'overview', storySoFar: 'story' })`, then reads back the values.

Run: `pnpm test src/infra/builder-memory-repository.test.ts`
Expected: fails — current impl throws.

- [ ] **Step 2: Implement lore Maps and methods**

```ts
// in MemoryBuilderRepository — add private state and methods.

import type {
  TagLore,
  UpsertTagLoreInput,
  WorldLore,
} from '@core/domain/builder-types';
import {
  asTagLoreId,
  type TagLoreId,
} from '@core/domain/ids';

  private worldLore = new Map<WorldId, Omit<WorldLore, 'worldId'>>();
  private tagLore = new Map<WorldId, Map<TagLoreId, TagLore>>();

  async readWorldLore(w: WorldId): Promise<WorldLore> {
    const row = this.worldLore.get(w);
    return {
      worldId: w,
      worldOverview: row?.worldOverview ?? '',
      storySoFar: row?.storySoFar ?? '',
    };
  }
  async writeWorldLore(
    w: WorldId,
    lore: Omit<WorldLore, 'worldId'>,
  ): Promise<void> {
    this.worldLore.set(w, { ...lore });
  }

  async listTagLore(w: WorldId): Promise<readonly TagLore[]> {
    return [...this.bucket(this.tagLore, w).values()];
  }
  async getTagLore(w: WorldId, id: TagLoreId): Promise<TagLore | null> {
    return this.bucket(this.tagLore, w).get(id) ?? null;
  }
  async getTagLoreByTag(w: WorldId, tag: string): Promise<TagLore | null> {
    for (const row of this.bucket(this.tagLore, w).values()) {
      if (row.tag === tag) return row;
    }
    return null;
  }
  async upsertTagLore(w: WorldId, i: UpsertTagLoreInput): Promise<void> {
    this.bucket(this.tagLore, w).set(i.id, {
      id: asTagLoreId(i.id),
      worldId: w,
      tag: i.tag,
      title: i.title,
      description: i.description,
    });
  }
  async deleteTagLore(w: WorldId, id: TagLoreId): Promise<void> {
    this.bucket(this.tagLore, w).delete(id);
  }
```

Extend `upsertItem`, `upsertAgent`, `upsertMonsterTemplate` to copy `input.tags` onto the stored entity.

Extend `clone()` / `restore()` to include `worldLore`, `tagLore` Maps in the snapshot tuple (deep-copy).

- [ ] **Step 3: See the test pass; run the full suite**

Run: `pnpm test src/infra/builder-memory-repository.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/infra/builder-memory-repository.ts src/infra/builder-memory-repository.test.ts
git commit -m "lore: MemoryBuilderRepository implements world_lore + tag_lore CRUD and tags"
```

---

## Task 6: SqliteBuilderRepository implements lore + tags (spec §"Schema changes"; §"Components" → SqliteBuilderRepository)

**Files:**
- Modify: `src/infra/builder-sqlite-repository.ts`

- [ ] **Step 1: Failing integration test**

Add to `tests/integration/builder-sqlite.test.ts`: open an in-memory db; instantiate the repo; `writeWorldLore`; `readWorldLore`; upsert two `TagLore` rows and read by id, tag, and via `listTagLore`.

Run: `pnpm test tests/integration/builder-sqlite.test.ts`
Expected: fails (`not implemented`).

- [ ] **Step 2: Implement the methods**

```ts
// in src/infra/builder-sqlite-repository.ts

import type {
  TagLore,
  UpsertTagLoreInput,
  WorldLore,
} from '@core/domain/builder-types';
import {
  asTagLoreId,
  type TagLoreId,
} from '@core/domain/ids';

  async readWorldLore(w: WorldId): Promise<WorldLore> {
    const rows = await this.db
      .select()
      .from(schema.worldLore)
      .where(eq(schema.worldLore.worldId, w));
    const [row] = rows;
    if (!row) return { worldId: w, worldOverview: '', storySoFar: '' };
    return {
      worldId: w,
      worldOverview: row.worldOverview,
      storySoFar: row.storySoFar,
    };
  }
  async writeWorldLore(
    w: WorldId,
    lore: Omit<WorldLore, 'worldId'>,
  ): Promise<void> {
    await this.db
      .insert(schema.worldLore)
      .values({
        worldId: w,
        worldOverview: lore.worldOverview,
        storySoFar: lore.storySoFar,
      })
      .onConflictDoUpdate({
        target: [schema.worldLore.worldId],
        set: {
          worldOverview: lore.worldOverview,
          storySoFar: lore.storySoFar,
        },
      });
  }

  async listTagLore(w: WorldId): Promise<readonly TagLore[]> {
    const rows = await this.db
      .select()
      .from(schema.tagLore)
      .where(eq(schema.tagLore.worldId, w));
    return rows.map(toTagLore);
  }
  async getTagLore(w: WorldId, id: TagLoreId): Promise<TagLore | null> {
    const rows = await this.db
      .select()
      .from(schema.tagLore)
      .where(and(eq(schema.tagLore.worldId, w), eq(schema.tagLore.id, id)));
    const [row] = rows;
    return row ? toTagLore(row) : null;
  }
  async getTagLoreByTag(w: WorldId, tag: string): Promise<TagLore | null> {
    const rows = await this.db
      .select()
      .from(schema.tagLore)
      .where(and(eq(schema.tagLore.worldId, w), eq(schema.tagLore.tag, tag)));
    const [row] = rows;
    return row ? toTagLore(row) : null;
  }
  async upsertTagLore(w: WorldId, i: UpsertTagLoreInput): Promise<void> {
    await this.db
      .insert(schema.tagLore)
      .values({
        id: i.id,
        worldId: w,
        tag: i.tag,
        title: i.title,
        description: i.description,
      })
      .onConflictDoUpdate({
        target: [schema.tagLore.worldId, schema.tagLore.id],
        set: { tag: i.tag, title: i.title, description: i.description },
      });
  }
  async deleteTagLore(w: WorldId, id: TagLoreId): Promise<void> {
    await this.db
      .delete(schema.tagLore)
      .where(and(eq(schema.tagLore.worldId, w), eq(schema.tagLore.id, id)));
  }
```

Add the row-converter helper at the bottom of the file:

```ts
function toTagLore(r: typeof schema.tagLore.$inferSelect): TagLore {
  return {
    id: asTagLoreId(r.id),
    worldId: r.worldId as WorldId,
    tag: r.tag,
    title: r.title,
    description: r.description,
  };
}
```

Extend `upsertItem`, `upsertAgent`, `upsertMonsterTemplate` to write `tags: JSON.stringify(i.tags)` into the new column (both in `.values(...)` and the `onConflictDoUpdate.set` block). Extend the corresponding row-converters (`toItem`, `toAgent`, `toMonsterTemplate`) to parse `JSON.parse(r.tags) as string[]` into `tags`.

- [ ] **Step 3: See the test pass**

Run: `pnpm test tests/integration/builder-sqlite.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/infra/builder-sqlite-repository.ts tests/integration/builder-sqlite.test.ts
git commit -m "lore: SqliteBuilderRepository implements world_lore + tag_lore CRUD and tags"
```

---

## Task 7: Validator extensions (spec §"Components" → validate.ts; §"Data flow" — authoring)

**Files:**
- Modify: `src/core/builder/validate.ts`
- Modify: `src/core/builder/validate.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// in validate.test.ts
import { asTagLoreId } from '@core/domain/ids';

it('reports TagLoreTagEmpty', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    tagLore: [
      {
        id: asTagLoreId('tlr_a'),
        worldId: W,
        tag: '',
        title: 'untitled',
        description: 'desc',
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.TagLoreTagEmpty,
  );
});

it('reports TagLoreDuplicate when two rows share a tag', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    tagLore: [
      {
        id: asTagLoreId('tlr_a'),
        worldId: W,
        tag: 'cult',
        title: 'A',
        description: '…',
      },
      {
        id: asTagLoreId('tlr_b'),
        worldId: W,
        tag: 'cult',
        title: 'B',
        description: '…',
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.TagLoreDuplicate,
  );
});
```

Run: `pnpm test src/core/builder/validate.test.ts`
Expected: fails (`TagLoreTagEmpty`/`TagLoreDuplicate` codes not emitted).

- [ ] **Step 2: Implement the validator rules**

```ts
// in validate.ts — add to validateWorld
for (const row of tree.tagLore) {
  if (row.tag.trim().length === 0) {
    problems.push({
      kind: ProblemKind.TagLoreTagEmpty,
      ref: { kind: EntityKind.TagLore, id: row.id },
    });
  }
}

const tagSeen = new Map<string, TagLoreId>();
for (const row of tree.tagLore) {
  const existing = tagSeen.get(row.tag);
  if (existing) {
    problems.push({
      kind: ProblemKind.TagLoreDuplicate,
      ref: { kind: EntityKind.TagLore, id: row.id },
    });
  } else {
    tagSeen.set(row.tag, row.id);
  }
}
```

(Import `EntityKind` from `builder-kinds` and `TagLoreId` from `ids`.)

- [ ] **Step 3: See tests pass, run suite, commit**

Run: `pnpm test src/core/builder/validate.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add src/core/builder/validate.ts src/core/builder/validate.test.ts
git commit -m "lore: validator rejects empty and duplicate tag_lore"
```

---

## Task 8: Builder facade — lore CRUD + tag propagation on spawn (spec §"Components" → builder facade; §"Decisions" #3, #7; §"Data flow" — publish)

**Files:**
- Modify: `src/core/builder/index.ts`
- Modify: `src/core/builder/index.test.ts`
- Modify: `src/core/spawning/expand.ts`
- Modify: `src/core/spawning/expand.test.ts`

- [ ] **Step 1: Failing facade tests**

```ts
// in src/core/builder/index.test.ts
it('getWorldLore returns defaults for a fresh world', async () => {
  const { repo, draft } = await fresh();
  const r = await getWorldLore(repo, draft.summary.id);
  assertOk(r);
  expect(r.value).toEqual({
    worldId: draft.summary.id,
    worldOverview: '',
    storySoFar: '',
  });
});

it('updateWorldLore round-trips on a draft', async () => {
  const { repo, draft } = await fresh();
  await assertOk(
    await updateWorldLore(repo, draft.summary.id, {
      worldOverview: 'a',
      storySoFar: 'b',
    }),
  );
  const r = await getWorldLore(repo, draft.summary.id);
  assertOk(r);
  expect(r.value.worldOverview).toBe('a');
  expect(r.value.storySoFar).toBe('b');
});

it('updateWorldLore rejects on a live world (requireDraft)', async () => {
  const { repo, live } = await freshLive();
  const r = await updateWorldLore(repo, live.summary.id, {
    worldOverview: 'x',
  });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe(BuilderErrorKind.NotADraft);
});

it('upsertTagLore round-trips and is visible in getWorldTree', async () => {
  const { repo, draft } = await fresh();
  const id = asTagLoreId('tlr_cult');
  await assertOk(
    await upsertTagLore(repo, draft.summary.id, {
      id,
      tag: 'cult',
      title: 'Cult of Embers',
      description: 'A secretive faction…',
    }),
  );
  const tree = await getWorldTree(repo, draft.summary.id);
  assertOk(tree);
  expect(tree.value.tagLore).toHaveLength(1);
  expect(tree.value.tagLore[0]?.tag).toBe('cult');
});
```

Run: `pnpm test src/core/builder/index.test.ts`
Expected: fails — facade functions don't exist.

- [ ] **Step 2: Implement the facade exports**

```ts
// in src/core/builder/index.ts

export async function getWorldLore(
  repo: BuilderRepository,
  worldId: WorldId,
): Promise<Result<WorldLore, BuilderError>> {
  return ok(await repo.readWorldLore(worldId));
}

export async function updateWorldLore(
  repo: BuilderRepository,
  worldId: WorldId,
  patch: { worldOverview?: string; storySoFar?: string },
): Promise<Result<void, BuilderError>> {
  const gate = await requireDraft(repo, worldId);
  if (!gate.ok) return gate;
  const current = await repo.readWorldLore(worldId);
  await repo.writeWorldLore(worldId, {
    worldOverview: patch.worldOverview ?? current.worldOverview,
    storySoFar: patch.storySoFar ?? current.storySoFar,
  });
  return ok(undefined);
}

export async function upsertTagLore(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertTagLoreInput,
): Promise<Result<TagLoreId, BuilderError>> {
  const gate = await requireDraft(repo, worldId);
  if (!gate.ok) return gate;
  await repo.upsertTagLore(worldId, input);
  return ok(input.id);
}

export async function deleteTagLore(
  repo: BuilderRepository,
  worldId: WorldId,
  id: TagLoreId,
): Promise<Result<void, BuilderError>> {
  const gate = await requireDraft(repo, worldId);
  if (!gate.ok) return gate;
  await repo.deleteTagLore(worldId, id);
  return ok(undefined);
}
```

Extend `getWorldTree`:

```ts
const worldLore = await repo.readWorldLore(worldId);
const tagLore = await repo.listTagLore(worldId);
return ok({
  summary, locations, exits, items, agents,
  templates, triggers, worldLore, tagLore,
});
```

Extend `copyTreeIntoWorld` (the publish/reset wholesale copier) to also copy lore:

```ts
await targetRepo.writeWorldLore(targetId, {
  worldOverview: source.worldLore.worldOverview,
  storySoFar: source.worldLore.storySoFar,
});
// clear existing tagLore on target then re-upsert each row from source
const existing = await targetRepo.listTagLore(targetId);
for (const row of existing) await targetRepo.deleteTagLore(targetId, row.id);
for (const row of source.tagLore) {
  await targetRepo.upsertTagLore(targetId, {
    id: row.id,
    tag: row.tag,
    title: row.title,
    description: row.description,
  });
}
```

- [ ] **Step 3: Failing test for `expandSpawn` copying template tags**

```ts
// in src/core/spawning/expand.test.ts
it('copies template.tags onto the spawned agent insert', () => {
  const tpl = {
    ...baseTemplate(),
    tags: ['goblin', 'cult'] as const,
  };
  const out = expandSpawn(tpl, asLocationId('loc_a'), 1, () => 'agt_x');
  expect(out).toHaveLength(1);
  expect(out[0]?.tags).toEqual(['goblin', 'cult']);
});
```

Run: `pnpm test src/core/spawning/expand.test.ts`
Expected: fails — `tags` not on the produced insert.

- [ ] **Step 4: Implement in `expandSpawn`**

```ts
// in src/core/spawning/expand.ts — inside the per-instance loop
const insert: UpsertAgentInput = {
  // …existing fields…
  tags: [...template.tags],
};
```

Run: `pnpm test src/core/spawning/expand.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/core/builder/index.ts src/core/builder/index.test.ts \
        src/core/spawning/expand.ts src/core/spawning/expand.test.ts
git commit -m "lore: facade lore CRUD + getWorldTree carries lore + spawn copies template tags"
```

---

## Task 9: Lore context resolver (spec §"Components" → `src/core/lore/context.ts`; §"Data flow" — runtime)

**Files:**
- Create: `src/core/lore/context.ts`
- Create: `src/core/lore/context.test.ts`

- [ ] **Step 1: Failing tests — table-driven**

```ts
// src/core/lore/context.test.ts
import { describe, expect, it } from 'vitest';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { MemoryRepository } from '@infra/memory-repository';
import { loadLoreContext } from './context';
import { asLocationId, asTagLoreId, asWorldId } from '@core/domain/ids';

const W = asWorldId('w_test');

const setUp = async () => {
  const repo = new MemoryBuilderRepository();
  const engine = new MemoryRepository();
  await repo.writeWorldLore(W, {
    worldOverview: 'overview',
    storySoFar: 'story',
  });
  await repo.upsertTagLore(W, {
    id: asTagLoreId('tlr_cult'),
    tag: 'cult',
    title: 'Cult',
    description: 'cult-desc',
  });
  await repo.upsertTagLore(W, {
    id: asTagLoreId('tlr_sewer'),
    tag: 'sewer',
    title: 'Sewers',
    description: 'sewer-desc',
  });
  return { repo, engine };
};

it('returns slots only when subject has no tags and no location', async () => {
  const { repo, engine } = await setUp();
  const ctx = await loadLoreContext(repo, engine, W, {
    tags: [],
    locationId: null,
  });
  expect(ctx.worldOverview).toBe('overview');
  expect(ctx.storySoFar).toBe('story');
  expect(ctx.tagDescriptions).toEqual({});
});

it('resolves subject own tags', async () => {
  const { repo, engine } = await setUp();
  const ctx = await loadLoreContext(repo, engine, W, {
    tags: ['cult'],
    locationId: null,
  });
  expect(ctx.tagDescriptions).toEqual({ cult: 'cult-desc' });
});

it('resolves location tags when subject has no own tags', async () => {
  const { repo, engine } = await setUp();
  // location has tag 'sewer'
  await engine.upsertLocation(/* helper inserting loc_a with tags=['sewer'] */);
  const ctx = await loadLoreContext(repo, engine, W, {
    tags: [],
    locationId: asLocationId('loc_a'),
  });
  expect(ctx.tagDescriptions).toEqual({ sewer: 'sewer-desc' });
});

it('unions subject and location tags', async () => {
  const { repo, engine } = await setUp();
  await engine.upsertLocation(/* loc_a tags=['sewer'] */);
  const ctx = await loadLoreContext(repo, engine, W, {
    tags: ['cult'],
    locationId: asLocationId('loc_a'),
  });
  expect(ctx.tagDescriptions).toEqual({
    cult: 'cult-desc',
    sewer: 'sewer-desc',
  });
});

it('tags without lore contribute nothing', async () => {
  const { repo, engine } = await setUp();
  const ctx = await loadLoreContext(repo, engine, W, {
    tags: ['unknown'],
    locationId: null,
  });
  expect(ctx.tagDescriptions).toEqual({});
});
```

Replace the `/* helper */` stub with whatever location-insertion helper the test corpus already uses (`MemoryRepository.upsertLocation({ id, worldId, tags: ['sewer'], ... })` — adapt to current shape).

Run: `pnpm test src/core/lore/context.test.ts`
Expected: fails — file does not yet exist.

- [ ] **Step 2: Implement `loadLoreContext`**

```ts
// src/core/lore/context.ts
import type { BuilderRepository } from '@core/builder/repository';
import type { Repository } from '@core/engine/repository';
import type {
  LoreContext,
  LoreSubject,
} from '@core/domain/builder-types';
import type { WorldId } from '@core/domain/ids';

export async function loadLoreContext(
  repo: BuilderRepository,
  engineRepo: Repository,
  worldId: WorldId,
  subject: LoreSubject,
): Promise<LoreContext> {
  const world = await repo.readWorldLore(worldId);

  const tagSet = new Set<string>(subject.tags);
  if (subject.locationId) {
    const loc = await engineRepo.getLocation(subject.locationId);
    if (loc) for (const tag of loc.tags) tagSet.add(tag);
  }

  const tagDescriptions: Record<string, string> = {};
  for (const tag of tagSet) {
    const row = await repo.getTagLoreByTag(worldId, tag);
    if (row) tagDescriptions[tag] = row.description;
  }

  return {
    worldOverview: world.worldOverview,
    storySoFar: world.storySoFar,
    tagDescriptions,
  };
}
```

Run: `pnpm test src/core/lore/context.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/core/lore/context.ts src/core/lore/context.test.ts
git commit -m "lore: pure loadLoreContext resolves tag union and pulls per-tag descriptions"
```

---

## Task 10: Discovery limits constant (spec §"Components" → discovery; §"Integrity invariants" #7)

**Files:**
- Create: `src/core/lore/limits.ts`
- Create: `src/core/lore/limits.test.ts`

- [ ] **Step 1: Failing trivial test**

```ts
// src/core/lore/limits.test.ts
import { expect, it } from 'vitest';
import { MAX_DISCOVERY_CALLS_PER_TICK } from './limits';

it('caps discovery LLM calls per tick at 1', () => {
  expect(MAX_DISCOVERY_CALLS_PER_TICK).toBe(1);
});
```

Run: `pnpm test src/core/lore/limits.test.ts`
Expected: fails — module missing.

- [ ] **Step 2: Implement**

```ts
// src/core/lore/limits.ts
/**
 * Hard cap on discovery LLM calls per tick. A discovery is a single
 * round-trip and will not naturally fire multiple times per turn, but the
 * cap exists to prevent pathological loops (search → spawned agent →
 * narrate → ...).
 */
export const MAX_DISCOVERY_CALLS_PER_TICK = 1;
```

Run: `pnpm test src/core/lore/limits.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/core/lore/limits.ts src/core/lore/limits.test.ts
git commit -m "lore: MAX_DISCOVERY_CALLS_PER_TICK constant"
```

---

## Task 11: Consequence engine emits `updatedStorySoFar` (spec §"Schema changes" — consequence schema; §"Data flow" — consequence update)

**Files:**
- Modify: `src/core/engine/consequences.ts`
- Modify: `src/core/engine/consequences.test.ts`

- [ ] **Step 1: Failing test using `FakeLanguageModel`**

```ts
// in consequences.test.ts
it('writes updatedStorySoFar to world_lore when LLM returns one', async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        // …existing required output fields with minimal values…
        updatedStorySoFar: 'The cultist guildmaster has fallen.',
      }),
    },
  ]);
  const { repo, engineRepo, world } = await scenarioWithCombat();
  await runConsequencePass({ repo, engineRepo, llm: fake, worldId: world.id, /* … */ });
  const lore = await repo.readWorldLore(world.id);
  expect(lore.storySoFar).toBe('The cultist guildmaster has fallen.');
});

it('leaves storySoFar unchanged when updatedStorySoFar is null', async () => {
  const fake = new FakeLanguageModel([
    { content: JSON.stringify({ /* …required fields…, */ updatedStorySoFar: null }) },
  ]);
  const { repo, engineRepo, world } = await scenarioWithCombat();
  await repo.writeWorldLore(world.id, { worldOverview: '', storySoFar: 'unchanged' });
  await runConsequencePass({ repo, engineRepo, llm: fake, worldId: world.id, /* … */ });
  const lore = await repo.readWorldLore(world.id);
  expect(lore.storySoFar).toBe('unchanged');
});
```

Run: `pnpm test src/core/engine/consequences.test.ts`
Expected: fails — the schema doesn't yet include the field.

- [ ] **Step 2: Extend the structured-output schema and dispatch**

In `consequences.ts`:
1. Add `updatedStorySoFar: { type: 'string', nullable: true }` to the JSON schema sent to the LLM.
2. Append a sentence to the system prompt: *"Only set `updatedStorySoFar` for events that meaningfully change the campaign — a major character dying, a quest resolving, a faction shifting. Routine moves, conversations, and inventory changes leave it null."*
3. After parsing the structured output, if `parsed.updatedStorySoFar !== null && typeof parsed.updatedStorySoFar === 'string'`:
   ```ts
   const current = await repo.readWorldLore(worldId);
   await repo.writeWorldLore(worldId, {
     worldOverview: current.worldOverview,
     storySoFar: parsed.updatedStorySoFar,
   });
   ```
4. Wrap the write in a try/catch — log on failure, do not abort the tick (spec §"Error handling").

Run: `pnpm test src/core/engine/consequences.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/consequences.ts src/core/engine/consequences.test.ts
git commit -m "lore: consequence engine writes updatedStorySoFar to world_lore"
```

---

## Task 12: Generative discovery pass (spec §"Components" → `src/core/engine/discovery.ts`; §"Data flow" — discovery)

**Files:**
- Create: `src/core/engine/discovery.ts`
- Create: `src/core/engine/discovery.test.ts`

- [ ] **Step 1: Failing tests with `FakeLanguageModel`**

```ts
// src/core/engine/discovery.test.ts
import { describe, expect, it } from 'vitest';
import { FakeLanguageModel } from '../../../tests/helpers/fake-language-model';
import { runDiscovery } from './discovery';
import { DiscoveryTriggerKind, DiscoverySubjectKind } from '@core/domain/builder-kinds';
import { asAgentId, asLocationId } from '@core/domain/ids';

const baseReq = () => ({
  trigger: DiscoveryTriggerKind.Search,
  actorId: asAgentId('agt_player'),
  locationId: asLocationId('loc_a'),
  query: 'dusty corner',
  subject: null,
  loreContext: {
    worldOverview: 'noir city',
    storySoFar: '',
    tagDescriptions: { sewer: 'tunnels under the city' },
  },
  visibleItems: [],
  visibleAgents: [],
});

it('returns flavour-only narration when LLM emits all optional fields null', async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'You search the dusty corner — only cobwebs.',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  const out = await runDiscovery(baseReq(), fake);
  expect(out.narration).toContain('cobwebs');
  expect(out.matchedItemId).toBeNull();
  expect(out.matchedAgentId).toBeNull();
  expect(out.spawnedItem).toBeNull();
  expect(out.spawnedAgent).toBeNull();
});

it('returns a spawnedItem when the LLM produces one', async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'Hidden in the dust: a tarnished locket.',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: {
          id: 'itm_locket',
          label: 'tarnished locket',
          shortDescription: 'a tarnished locket',
          longDescription: 'silver, blackened with age',
          owner: { kind: 'location', id: 'loc_a' },
          weight: 0,
          hidden: false,
          tags: ['cult'],
        },
        spawnedAgent: null,
      }),
    },
  ]);
  const out = await runDiscovery(baseReq(), fake);
  expect(out.spawnedItem?.label).toBe('tarnished locket');
});

it('returns a spawnedAgent when the LLM produces one', async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'A rat scurries out.',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: {
          id: 'agt_rat',
          label: 'rat',
          shortDescription: 'a rat',
          longDescription: 'a grey sewer rat',
          locationId: 'loc_a',
          hp: 1,
          damage: 1,
          defense: 0,
          capacity: 0,
          mood: null,
          shortTermIntent: null,
          goal: null,
          autonomous: false,
          awake: false,
          tags: ['vermin'],
        },
      }),
    },
  ]);
  const out = await runDiscovery(baseReq(), fake);
  expect(out.spawnedAgent?.label).toBe('rat');
});

it('returns a matchedItemId when the LLM resolves the query to a visible item', async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'A silver pendant on a chain.',
        matchedItemId: 'itm_pendant',
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  const out = await runDiscovery(baseReq(), fake);
  expect(out.matchedItemId).toBe('itm_pendant');
  // Note: runDiscovery does NOT validate that the id is in the visible
  // list — that's the dispatcher's job (tested in search.test.ts). The
  // unit test for the pass itself only confirms the field round-trips.
});

it('falls back to a generic narration when the LLM throws', async () => {
  const fake = new FakeLanguageModel([{ error: new Error('network') }]);
  const out = await runDiscovery(baseReq(), fake);
  expect(out.narration).toMatch(/nothing of note/i);
  expect(out.matchedItemId).toBeNull();
  expect(out.matchedAgentId).toBeNull();
  expect(out.spawnedItem).toBeNull();
  expect(out.spawnedAgent).toBeNull();
});

it('mentions the four valid outcomes in the system prompt', async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: '.',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  await runDiscovery(baseReq(), fake);
  const sys = fake.calls.at(-1)?.systemPrompt ?? '';
  expect(sys.toLowerCase()).toMatch(/match/);
  expect(sys.toLowerCase()).toMatch(/spawn/);
  expect(sys.toLowerCase()).toMatch(/narration/);
});

it("includes the subject's descriptions in the prompt when subject is non-null", async () => {
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'cold iron bands',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  const req = {
    ...baseReq(),
    subject: {
      kind: DiscoverySubjectKind.Item,
      label: 'iron chest',
      shortDescription: 'an iron chest',
      longDescription: 'an iron-bound chest, cold to the touch',
    },
  };
  await runDiscovery(req, fake);
  const lastPrompt = fake.calls.at(-1)?.prompt ?? '';
  expect(lastPrompt).toContain('iron chest');
  expect(lastPrompt).toContain('cold to the touch');
});
```

Run: `pnpm test src/core/engine/discovery.test.ts`
Expected: fails — module missing.

- [ ] **Step 2: Implement `runDiscovery`**

```ts
// src/core/engine/discovery.ts
import type { LanguageModel } from './language-model';
import type {
  DiscoveryRequest,
  DiscoveryResponse,
} from '@core/domain/builder-types';
import { log } from '@core/util/log';

const FALLBACK_NARRATION = 'You find nothing of note.';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'narration',
    'matchedItemId',
    'matchedAgentId',
    'spawnedItem',
    'spawnedAgent',
  ],
  properties: {
    narration: { type: 'string' },
    matchedItemId: { type: ['string', 'null'] },
    matchedAgentId: { type: ['string', 'null'] },
    spawnedItem: {
      type: ['object', 'null'],
      // structural — follows UpsertItemInput shape; nullable per OpenAI strict mode
      additionalProperties: true,
    },
    spawnedAgent: {
      type: ['object', 'null'],
      additionalProperties: true,
    },
  },
} as const;

const FALLBACK_RESPONSE: DiscoveryResponse = {
  narration: FALLBACK_NARRATION,
  matchedItemId: null,
  matchedAgentId: null,
  spawnedItem: null,
  spawnedAgent: null,
};

export async function runDiscovery(
  req: DiscoveryRequest,
  llm: LanguageModel,
): Promise<DiscoveryResponse> {
  const prompt = buildPrompt(req);
  try {
    const raw = await llm.generate({
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      responseSchema: RESPONSE_SCHEMA,
    });
    const parsed = JSON.parse(raw.content) as Partial<DiscoveryResponse>;
    if (typeof parsed.narration !== 'string') {
      return FALLBACK_RESPONSE;
    }
    return {
      narration: parsed.narration,
      matchedItemId: (parsed.matchedItemId ?? null) as ItemId | null,
      matchedAgentId: (parsed.matchedAgentId ?? null) as AgentId | null,
      spawnedItem: parsed.spawnedItem ?? null,
      spawnedAgent: parsed.spawnedAgent ?? null,
    };
  } catch (err) {
    log.warn(`[discovery] LLM error: ${String(err)}`);
    return FALLBACK_RESPONSE;
  }
}

function buildPrompt(req: DiscoveryRequest): string {
  const parts: string[] = [];
  parts.push(`World overview: ${req.loreContext.worldOverview}`);
  parts.push(`Story so far: ${req.loreContext.storySoFar}`);
  if (Object.keys(req.loreContext.tagDescriptions).length > 0) {
    parts.push('Tag context:');
    for (const [tag, desc] of Object.entries(req.loreContext.tagDescriptions)) {
      parts.push(`- ${tag}: ${desc}`);
    }
  }
  parts.push(`Trigger: ${req.trigger}`);
  parts.push(`Player query: ${req.query}`);
  if (req.subject) {
    parts.push(`Subject kind: ${req.subject.kind}`);
    parts.push(`Subject label: ${req.subject.label}`);
    parts.push(`Subject short description: ${req.subject.shortDescription}`);
    parts.push(`Subject long description: ${req.subject.longDescription}`);
    parts.push(
      'The subject is an authored entity. Augment, do not invent a replacement.',
    );
  }
  parts.push(`Visible items: ${req.visibleItems.map((i) => i.label).join(', ') || '(none)'}`);
  parts.push(`Visible agents: ${req.visibleAgents.map((a) => a.label).join(', ') || '(none)'}`);
  return parts.join('\n');
}

const SYSTEM_PROMPT = `You are the generative-discovery pass for a text adventure.

You have four valid outcomes, in priority order:
1. MATCH an existing visible entity — when the player's query plausibly refers to an item or agent already in the visible list (typo, synonym, descriptive phrase), set matchedItemId or matchedAgentId to that entity's id. The engine will route the response through the normal look path and ignore narration/spawn fields.
2. NARRATE flavour only — say what the player sees with no new entity. Leave spawn fields null.
3. SPAWN A NEW ITEM — when the lore context invites a concrete object and no authored entity fills the role.
4. SPAWN A NEW AGENT — same, for a creature or person.

Always return a JSON object with all five fields: narration, matchedItemId, matchedAgentId, spawnedItem, spawnedAgent. Set unused fields to null.

When matchedItemId or matchedAgentId is set, leave spawn fields null (the engine ignores them anyway).
Prefer matching over spawning when the query plausibly refers to something already visible.
Prefer flavour over spawning when the situation doesn't clearly invite a new entity.
If a subject is provided, your narration should augment its existing description rather than invent a replacement.`;
```

Run: `pnpm test src/core/engine/discovery.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/discovery.ts src/core/engine/discovery.test.ts
git commit -m "lore: runDiscovery LLM pass with subject-aware prompt and fallback"
```

---

## Task 13: Parser learns `search`; `Search` action handler; tick dispatch + budget (spec §"Components" → `actions/search.ts`, parser, tick; §"Integrity invariants" #7)

**Note on architecture (resolves a loose thread from the spec):** the engine `Repository` port stays read-mostly. Discovery-spawned items/agents are inserted via `builderRepo.upsertItem` / `builderRepo.upsertAgent` — the same intentional runtime bypass that `runSpawnTickPass` uses for trigger spawns. The facade's `requireDraft` gate covers author writes; runtime ports do not gate.

**Files:**
- Modify: `src/core/engine/parser.ts`
- Modify: `src/core/engine/parser.test.ts`
- Create: `src/core/engine/actions/search.ts`
- Create: `src/core/engine/actions/search.test.ts`
- Modify: `src/core/engine/actions/registry.ts`
- Modify: `src/core/engine/actions/look.ts` (failed-look path emits a "discovery requested" signal)
- Modify: `src/core/engine/actions/look.test.ts`
- Modify: `src/core/engine/tick.ts`
- Modify: `src/core/engine/tick.test.ts`

- [ ] **Step 1: Failing parser test for `search`**

```ts
// in parser.test.ts
it('parses "search dusty corner" as ActionKind.Search with query', () => {
  const r = parse('search dusty corner', /* actor */, /* view */, /* inventory */);
  expect('kind' in r && r.kind === ActionKind.Search).toBe(true);
  if (r.kind === ActionKind.Search) {
    expect(r.query).toBe('dusty corner');
  }
});

it('parses bare "search" with empty query', () => {
  const r = parse('search', /* … */);
  expect('kind' in r && r.kind === ActionKind.Search).toBe(true);
});
```

Run: `pnpm test src/core/engine/parser.test.ts`
Expected: fails.

- [ ] **Step 2: Implement the `search` verb in `parser.ts`**

Add a case alongside `'look'`:

```ts
case 'search': {
  const query = rest.join(' ').trim();
  return {
    kind: ActionKind.Search,
    actorId: actor.id,
    query,
  };
}
```

Extend the parser's `ParseResult` action union with the `Search` shape:

```ts
| {
    kind: typeof ActionKind.Search;
    actorId: AgentId;
    query: string;
  }
```

Run: `pnpm test src/core/engine/parser.test.ts`
Expected: green.

- [ ] **Step 3: Failing handler test**

```ts
// src/core/engine/actions/search.test.ts
import { describe, expect, it, vi } from 'vitest';
import { handleSearch } from './search';
import { DiscoveryTriggerKind } from '@core/domain/builder-kinds';
import { FakeLanguageModel } from '../../../../tests/helpers/fake-language-model';

it('returns an outcome carrying a discovery hint when called', async () => {
  // …set up MemoryRepository + MemoryBuilderRepository with one location, one
  // player agent, no items / agents in the location; an LLM that returns
  // flavour-only narration.
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'cobwebs only',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  const result = await handleSearch(
    { kind: ActionKind.Search, actorId: player.id, query: 'corner' },
    { repo, builderRepo, llm: fake, worldId: W },
  );
  expect(result.events.some((e) => e.kind === EventKind.Look)).toBe(true);
  expect(result.discoveryCalled).toBe(true);
});

it('spawns an item via builderRepo.upsertItem when LLM returns one', async () => {
  // …LLM returns spawnedItem
  await handleSearch({ kind: ActionKind.Search, actorId: player.id, query: '' }, deps);
  const items = await builderRepo.listItems(W);
  expect(items.some((i) => i.label === 'tarnished locket')).toBe(true);
});

it('routes through the normal look path when LLM matches a visible item', async () => {
  // Seed the room with an authored item 'silver pendant'.
  await builderRepo.upsertItem(W, {
    id: 'itm_pendant',
    label: 'silver pendant',
    shortDescription: 'a tarnished silver pendant',
    longDescription: 'a tarnished silver pendant on a chain',
    owner: { kind: 'location', id: 'loc_a' },
    weight: 0,
    hidden: false,
    tags: [],
  });
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        // The LLM tries to invent narration AND match — the dispatcher
        // honours the match and discards the narration + spawn fields.
        narration: 'You find a brass amulet.',
        matchedItemId: 'itm_pendant',
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  const result = await handleSearch(
    { kind: ActionKind.Search, actorId: player.id, query: 'pendant' },
    { repo, builderRepo, llm: fake, worldId: W },
  );
  const lookEvent = result.events.find((e) => e.kind === EventKind.Look);
  expect(lookEvent?.narration ?? '').toContain('silver pendant');
  // No brass amulet appears.
  const items = await builderRepo.listItems(W);
  expect(items.some((i) => i.label === 'brass amulet')).toBe(false);
});

it('ignores a hallucinated matchedItemId and falls through to the spawn/flavour path', async () => {
  // The room has NO matching item.
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'You find only dust.',
        matchedItemId: 'itm_nonexistent',
        matchedAgentId: null,
        spawnedItem: null,
        spawnedAgent: null,
      }),
    },
  ]);
  const result = await handleSearch(
    { kind: ActionKind.Search, actorId: player.id, query: 'pendant' },
    { repo, builderRepo, llm: fake, worldId: W },
  );
  // Fell through to narration; nothing crashed.
  const lookEvent = result.events.find((e) => e.kind === EventKind.Look);
  expect(lookEvent?.narration ?? '').toContain('dust');
});
```

Run: `pnpm test src/core/engine/actions/search.test.ts`
Expected: fails — handler missing.

- [ ] **Step 4: Implement `handleSearch`**

```ts
// src/core/engine/actions/search.ts
import { ActionKind, EventKind } from '@core/domain/kinds';
import { DiscoveryTriggerKind } from '@core/domain/builder-kinds';
import { loadLoreContext } from '@core/lore/context';
import { runDiscovery } from '../discovery';
import type { LanguageModel } from '../language-model';
import type { BuilderRepository } from '@core/builder/repository';
import type { Repository } from '../repository';
// …

export interface SearchDeps {
  readonly repo: Repository;
  readonly builderRepo: BuilderRepository;
  readonly llm: LanguageModel;
  readonly worldId: WorldId;
}

export interface SearchOutcome {
  readonly events: readonly DomainEvent[];
  readonly discoveryCalled: boolean;
}

export async function handleSearch(
  action: { kind: typeof ActionKind.Search; actorId: AgentId; query: string },
  deps: SearchDeps,
): Promise<SearchOutcome> {
  const actor = await deps.repo.getAgent(action.actorId);
  if (!actor) return { events: [], discoveryCalled: false };

  const loreContext = await loadLoreContext(deps.builderRepo, deps.repo, deps.worldId, {
    tags: [],
    locationId: actor.locationId,
  });
  const visibleItems = await deps.repo.listItemsAtLocation(actor.locationId);
  const visibleAgents = await deps.repo.listAgentsAtLocation(actor.locationId);

  const response = await runDiscovery(
    {
      trigger: DiscoveryTriggerKind.Search,
      actorId: actor.id,
      locationId: actor.locationId,
      query: action.query,
      subject: null,
      loreContext,
      visibleItems,
      visibleAgents,
    },
    deps.llm,
  );

  // --- Match path (highest priority) ---
  // If the LLM resolved the query to a visible entity, route through
  // the normal look path. Hallucinated ids (not in the visible list)
  // are silently discarded; we fall through to the spawn/flavour path.
  if (response.matchedItemId !== null) {
    const matched = visibleItems.find((i) => i.id === response.matchedItemId);
    if (matched) {
      return {
        events: [renderLookEventForItem(actor, matched)],
        discoveryCalled: true,
      };
    }
  }
  if (response.matchedAgentId !== null) {
    const matched = visibleAgents.find((a) => a.id === response.matchedAgentId);
    if (matched) {
      return {
        events: [renderLookEventForAgent(actor, matched)],
        discoveryCalled: true,
      };
    }
  }

  // --- Spawn / flavour path ---
  const events: DomainEvent[] = [
    {
      kind: EventKind.Look,
      actorId: actor.id,
      locationId: actor.locationId,
      narration: response.narration,
      // …other look-event fields per current shape
    },
  ];

  if (response.spawnedItem) {
    await deps.builderRepo.upsertItem(deps.worldId, response.spawnedItem);
  }
  if (response.spawnedAgent) {
    await deps.builderRepo.upsertAgent(deps.worldId, response.spawnedAgent);
  }

  return { events, discoveryCalled: true };
}

// `renderLookEventForItem` and `renderLookEventForAgent` produce a
// look-event whose `narration` is the entity's authored long
// description, mirroring what the normal look action would emit. If
// the existing look-action code path is factored to expose this
// helper, reuse it; otherwise duplicate the small composition here.
```

Register the handler in `actions/registry.ts`.

Run: `pnpm test src/core/engine/actions/search.test.ts`
Expected: green.

- [ ] **Step 5: Failed-look fall-through emits a discovery hint**

In `look.ts`, when the `look <target>` resolves no entity, return an outcome whose payload carries the original query string and a `discoveryRequested: true` flag (without itself calling the LLM — that keeps `look.ts` synchronous and side-effect-free). The dispatch in `tick.ts` consumes the flag.

Update `look.test.ts` to assert the outcome carries `discoveryRequested: true` and `query` when target was unresolved.

- [ ] **Step 6: Tick dispatch + per-tick budget**

In `tick.ts`:

```ts
// near top
import { MAX_DISCOVERY_CALLS_PER_TICK } from '@core/lore/limits';
import { DiscoveryTriggerKind } from '@core/domain/builder-kinds';

// inside tick(), establish a counter
let discoveryCalls = 0;

// when the action is ActionKind.Search:
if (action.kind === ActionKind.Search) {
  if (discoveryCalls >= MAX_DISCOVERY_CALLS_PER_TICK) {
    // budget exhausted — fall back to a generic narration event
  } else {
    discoveryCalls += 1;
    const out = await handleSearch(action, { repo, builderRepo, llm, worldId });
    events.push(...out.events);
  }
}

// when look returns discoveryRequested:
if (lookOutcome.discoveryRequested && discoveryCalls < MAX_DISCOVERY_CALLS_PER_TICK) {
  discoveryCalls += 1;
  // build DiscoveryRequest with trigger = FailedLook and dispatch via runDiscovery
  // (or reuse handleSearch's helper extracted into a shared dispatcher).
}
```

Add a tick test that asserts `discoveryCalls` is capped: queue both a `search` and a `look unknown` in one turn; the `FakeLanguageModel` should be invoked exactly once.

Run: `pnpm test src/core/engine/tick.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/core/engine/parser.ts src/core/engine/parser.test.ts \
        src/core/engine/actions/search.ts src/core/engine/actions/search.test.ts \
        src/core/engine/actions/registry.ts \
        src/core/engine/actions/look.ts src/core/engine/actions/look.test.ts \
        src/core/engine/tick.ts src/core/engine/tick.test.ts
git commit -m "lore: search verb + discovery dispatch in tick with per-tick budget"
```

---

## Task 14: Server functions for lore (spec §"Components" → server functions)

**Files:**
- Create: `app/server/admin/lore.ts`
- Modify: `app/server/admin/repo.ts` (only if needed to expose the builder repo; otherwise reuse the existing accessor)

- [ ] **Step 1: Implement the thin wrappers** (mirror `app/server/admin/templates.ts`)

```ts
// app/server/admin/lore.ts
import { createServerFn } from '@tanstack/start';
import {
  getWorldLore as facadeGetWorldLore,
  updateWorldLore as facadeUpdateWorldLore,
  upsertTagLore as facadeUpsertTagLore,
  deleteTagLore as facadeDeleteTagLore,
} from '@core/builder';
import { getBuilderRepo } from './repo';
import { asTagLoreId, asWorldId } from '@core/domain/ids';

export const getWorldLore = createServerFn('GET', async ({ id }: { id: string }) => {
  return facadeGetWorldLore(getBuilderRepo(), asWorldId(id));
});

export const updateWorldLore = createServerFn(
  'POST',
  async (input: { id: string; worldOverview?: string; storySoFar?: string }) => {
    return facadeUpdateWorldLore(getBuilderRepo(), asWorldId(input.id), {
      worldOverview: input.worldOverview,
      storySoFar: input.storySoFar,
    });
  },
);

export const listTagLore = createServerFn('GET', async ({ worldId }: { worldId: string }) => {
  return getBuilderRepo().listTagLore(asWorldId(worldId));
});

export const upsertTagLore = createServerFn(
  'POST',
  async (input: {
    worldId: string;
    payload: { id: string; tag: string; title: string; description: string };
  }) => {
    return facadeUpsertTagLore(getBuilderRepo(), asWorldId(input.worldId), {
      id: asTagLoreId(input.payload.id),
      tag: input.payload.tag,
      title: input.payload.title,
      description: input.payload.description,
    });
  },
);

export const deleteTagLore = createServerFn(
  'POST',
  async (input: { worldId: string; id: string }) => {
    return facadeDeleteTagLore(
      getBuilderRepo(),
      asWorldId(input.worldId),
      asTagLoreId(input.id),
    );
  },
);
```

- [ ] **Step 2: Suite + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add app/server/admin/lore.ts
git commit -m "lore: server functions for world_lore and tag_lore CRUD"
```

---

## Task 15: MCP tools for lore (spec §"Components" → MCP tools)

**Files:**
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/server.test.ts`

- [ ] **Step 1: Failing smoke test**

```ts
// in src/mcp/server.test.ts
it('exposes get_world_lore / update_world_lore tools', async () => {
  const tools = listTools();
  expect(tools.map((t) => t.name)).toEqual(
    expect.arrayContaining([
      'get_world_lore',
      'update_world_lore',
      'list_tag_lore',
      'upsert_tag_lore',
      'delete_tag_lore',
    ]),
  );
});

it('does NOT expose reset_live_to_draft', async () => {
  const tools = listTools();
  expect(tools.map((t) => t.name)).not.toContain('reset_live_to_draft');
});

it('round-trips world lore through MCP', async () => {
  // call update_world_lore then get_world_lore; assert the round-trip
});
```

Run: `pnpm test src/mcp/server.test.ts`
Expected: fails.

- [ ] **Step 2: Implement the tools in `src/mcp/tools.ts`**

Append five tool definitions following the existing `upsert_monster_template` shape. Each one validates input via the existing JSON-schema helper, calls the builder facade, and returns the `Result`.

Run: `pnpm test src/mcp/server.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools.ts src/mcp/server.test.ts
git commit -m "lore: MCP tools for world_lore and tag_lore"
```

---

## Task 16: Admin UI — Lore tree node and form (spec §"Components" → Admin UI; §"Data flow" — authoring)

**Files:**
- Modify: `app/routes/admin/$worldId.tsx`

- [ ] **Step 1: Add the Lore top-level tree node**

In the `CategoryRouter` config (rewired in commit `b2a6917`), add a new entry:

```ts
{
  key: 'lore',
  label: 'Lore',
  // master pane: a static list with one row "World lore" and one row per tag in the world
  master: LoreMasterList,
  // detail pane: the lore form
  detail: LoreDetailForm,
},
```

`LoreMasterList` derives the tag union from `tree.locations`, `tree.items`, `tree.agents`, `tree.templates` (flat-map each `.tags` array, union via `Set`). Each tag row shows whether a `TagLore` exists; "+ add description" if not.

`LoreDetailForm` has two modes:
1. The "World lore" mode: two textareas (`worldOverview`, `storySoFar`) wired to `updateWorldLore`. The `storySoFar` field carries a helper note: *"Auto-updated by the engine. You can edit freely."*
2. The "Tag lore" mode (per-tag): three text fields (`tag` read-only, `title`, `description`) wired to `upsertTagLore` / `deleteTagLore`. For tags with no existing row, the form opens with `id = generateTagLoreId()` and an empty title/description.

Reuse the existing JSON-fallback editor pattern for the description textarea (matches the v1 simplicity noted in the spec).

- [ ] **Step 2: Suite + smoke render**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: green; admin route compiles.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/$worldId.tsx
git commit -m "lore: admin Lore node with world slots and per-tag descriptions"
```

---

## Task 17: End-to-end integration test (spec §"Testing" — final bullet)

**Files:**
- Create: `tests/integration/lore-discovery.test.ts`

- [ ] **Step 1: Author lore + tags, publish, search**

```ts
// tests/integration/lore-discovery.test.ts
import { describe, expect, it } from 'vitest';
import { openDb } from '@infra/db';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { SqliteRepository } from '@infra/sqlite-repository';
import {
  createDraft,
  upsertLocation,
  upsertAgent,
  upsertTagLore,
  updateWorldLore,
  publishDraft,
} from '@core/builder';
import { FakeLanguageModel } from '../helpers/fake-language-model';
import { tick } from '@core/engine/tick';
import { ActionKind } from '@core/domain/kinds';

it('search verb fires discovery using lore context and spawns an item', async () => {
  const db = await openDb(':memory:');
  const builderRepo = new SqliteBuilderRepository(db);
  const engineRepo = new SqliteRepository(db);

  // Author a draft with a tagged location + lore.
  const draft = await createDraft(builderRepo, { label: 'demo' });
  const W = draft.summary.id;
  await updateWorldLore(builderRepo, W, {
    worldOverview: 'sewers under a noir city',
    storySoFar: '',
  });
  await upsertTagLore(builderRepo, W, {
    id: asTagLoreId('tlr_sewer'),
    tag: 'sewer',
    title: 'Sewers',
    description: 'maze of tunnels haunted by cultists',
  });
  await upsertLocation(builderRepo, W, {
    id: asLocationId('loc_sewer'),
    label: 'Drainage hub',
    shortDescription: '…',
    longDescription: '…',
    tags: ['sewer'],
  });
  await upsertAgent(builderRepo, W, {
    id: asAgentId('agt_player'),
    label: 'player',
    locationId: asLocationId('loc_sewer'),
    /* …other required fields, tags: [] */
  });

  // Publish.
  const publishResult = await publishDraft(builderRepo, W);
  expect(publishResult.ok).toBe(true);
  const liveId = publishResult.value.liveWorldId;

  // Stub LLM with a spawn payload referencing the location.
  const fake = new FakeLanguageModel([
    {
      content: JSON.stringify({
        narration: 'You find a tarnished locket among the cobwebs.',
        matchedItemId: null,
        matchedAgentId: null,
        spawnedItem: {
          id: 'itm_locket',
          label: 'tarnished locket',
          shortDescription: 'a tarnished locket',
          longDescription: 'silver, blackened with age',
          owner: { kind: 'location', id: 'loc_sewer' },
          weight: 0,
          hidden: false,
          tags: ['cult'],
        },
        spawnedAgent: null,
      }),
    },
  ]);

  // Run one tick with a search input.
  await tick({
    repo: engineRepo,
    builderRepo,
    llm: fake,
    worldId: liveId,
    actorId: asAgentId('agt_player'),
    input: 'search the drain',
  });

  // Assertions:
  // 1. LLM was called once with a prompt containing the lore.
  const lastCall = fake.calls.at(-1);
  expect(lastCall?.prompt).toContain('sewers under a noir city');
  expect(lastCall?.prompt).toContain('maze of tunnels haunted by cultists');

  // 2. The spawned item is now in the live world.
  const items = await builderRepo.listItems(liveId);
  expect(items.some((i) => i.label === 'tarnished locket')).toBe(true);
});
```

Run: `pnpm test tests/integration/lore-discovery.test.ts`
Expected: green.

- [ ] **Step 2: Commit**

```bash
git add tests/integration/lore-discovery.test.ts
git commit -m "lore: end-to-end integration — search verb fires discovery and persists spawn"
```

---

## Task 18: Final pass

- [ ] **Step 1: Full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 2: Walk the spec sections one more time**

Open the spec; tick off each section against this plan. If anything is uncovered, file a follow-up task. The expected outcome is zero gaps.

- [ ] **Step 3: No documentation file unless requested**

Do not create a README blurb for this slice unless the user asks.
