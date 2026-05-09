# Campaign Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a campaign builder that lets an admin create, edit, and extend worlds and all their components (locations, exits, items, agents) — surfaced through a web UI, an HTTP API, and an MCP server.

**Architecture:** A new pure module `src/core/builder/` exposes the operations. Drafts and live worlds share the existing tables, separated by a `kind` column on `worlds`. Publish runs a three-way structural merge against a `world_snapshots` row so authored changes apply while gameplay drift is preserved. Three sibling adapters wrap the same core: TanStack server functions + admin routes, an HTTP API at `/api/admin/*`, and an MCP server under `src/mcp/`.

**Tech Stack:** TypeScript strict, TanStack Start (Vite), Drizzle + better-sqlite3, React 19, vitest, biome. MCP via `@modelcontextprotocol/sdk` (new dependency).

**Spec:** [docs/superpowers/specs/2026-05-08-campaign-builder-design.md](../specs/2026-05-08-campaign-builder-design.md)

---

## File map

Created:

- `src/core/domain/builder-kinds.ts` — `WorldKind`, `BuilderErrorKind`, `ProblemKind`, `EntityKind` const objects.
- `src/core/domain/builder-types.ts` — `Problem`, `BuilderError`, `MergePlan`, `PublishResult`, `WorldTree`, `DraftEntityInputs`.
- `src/core/builder/repository.ts` — `BuilderRepository` port (extends the engine's read surface with structural writes the engine doesn't need).
- `src/core/builder/diff.ts` — pure `computeMergePlan(snapshot, draft, live)`.
- `src/core/builder/diff.test.ts`
- `src/core/builder/validate.ts` — pure `validateWorld(tree)`.
- `src/core/builder/validate.test.ts`
- `src/core/builder/index.ts` — `createDraft`, `cloneLiveAsDraft`, `upsert*`, `delete*`, `getWorldTree`, `validateWorld`, `publish`, `resetLiveToDraft`.
- `src/core/builder/index.test.ts`
- `src/infra/builder-memory-repository.ts` — `MemoryBuilderRepository` for tests.
- `src/infra/builder-sqlite-repository.ts` — `SqliteBuilderRepository`.
- `app/server/admin/worlds.ts` — TanStack server fns: `listWorlds`, `createDraft`, `cloneLiveAsDraft`, `getWorld`.
- `app/server/admin/entities.ts` — `saveEntity`, `deleteEntity`.
- `app/server/admin/validate.ts` — `validateWorld`.
- `app/server/admin/publish.ts` — `publish`, `resetLiveToDraft`.
- `app/server/admin/repo.ts` — composition root: `getBuilderRepo()` returning a `SqliteBuilderRepository`.
- `app/routes/api/admin/worlds.ts` — HTTP `GET/POST /api/admin/worlds`.
- `app/routes/api/admin/worlds.$worldId.ts` — `GET/POST` clone, validate, publish, reset; full tree.
- `app/routes/api/admin/worlds.$worldId.entities.ts` — `PUT/DELETE` entity routes.
- `app/routes/admin/index.tsx` — list view.
- `app/routes/admin/$worldId.tsx` — tree + form editor.
- `src/mcp/server.ts` — MCP entry point.
- `src/mcp/tools.ts` — tool definitions wrapping the builder.
- `src/mcp/server.test.ts` — wiring smoke test.
- `drizzle/0005_campaign_builder.sql` — migration for `worlds` columns and `world_snapshots`.
- `tests/integration/builder-sqlite.test.ts` — integration smoke for the SQLite adapter.
- `tests/integration/admin-http.test.ts` — HTTP route happy-path + one validation-failure test per route family.
- `scripts/migrate-worlds.ts` — one-shot data migration backfilling `kind`, `displayName`, `playerAgentId` for existing rows.

Modified:

- `src/infra/schema.ts` — add `kind`, `parentDraftId`, `displayName`, `playerAgentId` to `worlds`; add `worldSnapshots` table.
- `src/core/domain/kinds.ts` — re-export `WorldKind` for convenience.
- `app/routes/__root.tsx` — no change (admin uses its own layout).
- `package.json` — add `@modelcontextprotocol/sdk`, add `mcp` script, add `migrate:worlds` script.

---

## Conventions enforced everywhere

- No raw string literals in logic. Discriminator and enum values come from `as const` objects in `src/core/domain/*-kinds.ts`. Type aliases use `(typeof X)[keyof typeof X]`.
- Branded ids (`WorldId`, `LocationId`, etc.) — never assign a raw `string` to one without going through `as*Id`.
- All builder errors are `Result<T, BuilderError>` — no thrown exceptions for expected failures.
- Tests live next to source: `foo.ts` + `foo.test.ts`. Integration tests live under `tests/integration/`.
- Run after every code change: `pnpm typecheck && pnpm lint && pnpm test`.
- Frequent commits: every task ends in a commit.

---

## Task 1: Domain kinds and types

**Files:**
- Create: `src/core/domain/builder-kinds.ts`
- Create: `src/core/domain/builder-types.ts`

- [ ] **Step 1: Write `builder-kinds.ts`**

```ts
// src/core/domain/builder-kinds.ts
/**
 * Discriminator values for the campaign builder. Following the no-string-
 * literals rule, every code path that branches on these values goes through
 * the const objects rather than a raw string.
 */

export const WorldKind = {
  Draft: 'draft',
  Live: 'live',
} as const;
export type WorldKind = (typeof WorldKind)[keyof typeof WorldKind];

export const EntityKind = {
  Location: 'location',
  Exit: 'exit',
  Item: 'item',
  Agent: 'agent',
} as const;
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

export const ProblemKind = {
  ExitFromMissing: 'exit_from_missing',
  ExitToMissing: 'exit_to_missing',
  ExitLockedByItemMissing: 'exit_locked_by_item_missing',
  ItemOwnerMissing: 'item_owner_missing',
  ItemOwnerKindMismatch: 'item_owner_kind_mismatch',
  AgentLocationMissing: 'agent_location_missing',
  PlayerAgentNotSet: 'player_agent_not_set',
  PlayerAgentMissing: 'player_agent_missing',
  DuplicateId: 'duplicate_id',
} as const;
export type ProblemKind = (typeof ProblemKind)[keyof typeof ProblemKind];

export const BuilderErrorKind = {
  WorldNotFound: 'world_not_found',
  WorldKindMismatch: 'world_kind_mismatch',
  EntityNotFound: 'entity_not_found',
  ValidationFailed: 'validation_failed',
  SnapshotConflict: 'snapshot_conflict',
  NoLiveWorldForDraft: 'no_live_world_for_draft',
  IdAlreadyExists: 'id_already_exists',
} as const;
export type BuilderErrorKind = (typeof BuilderErrorKind)[keyof typeof BuilderErrorKind];

export const PublishOutcomeKind = {
  Created: 'created',
  Merged: 'merged',
} as const;
export type PublishOutcomeKind =
  (typeof PublishOutcomeKind)[keyof typeof PublishOutcomeKind];

export const SkipReasonKind = {
  LiveDivergedFromSnapshot: 'live_diverged_from_snapshot',
  LiveDeletedRow: 'live_deleted_row',
} as const;
export type SkipReasonKind = (typeof SkipReasonKind)[keyof typeof SkipReasonKind];
```

- [ ] **Step 2: Write `builder-types.ts`**

```ts
// src/core/domain/builder-types.ts
import type { Agent, Exit, Item, Location } from './entities';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from './ids';
import type {
  BuilderErrorKind,
  EntityKind,
  ProblemKind,
  PublishOutcomeKind,
  SkipReasonKind,
  WorldKind,
} from './builder-kinds';

export interface WorldSummary {
  readonly id: WorldId;
  readonly kind: WorldKind;
  readonly label: string;
  readonly displayName: string;
  readonly parentDraftId: WorldId | null;
  readonly playerAgentId: AgentId | null;
}

export interface WorldTree {
  readonly summary: WorldSummary;
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
}

export interface Problem {
  readonly kind: ProblemKind;
  readonly entity: EntityKind;
  readonly entityId: string;
  readonly message: string;
}

export interface BuilderError {
  readonly kind: BuilderErrorKind;
  readonly message: string;
  readonly problems?: readonly Problem[];
}

export type EntityRef =
  | { kind: 'location'; id: LocationId }
  | { kind: 'exit'; id: ExitId }
  | { kind: 'item'; id: ItemId }
  | { kind: 'agent'; id: AgentId };

export interface SkipReport {
  readonly ref: EntityRef;
  readonly reason: SkipReasonKind;
}

export interface MergePlan {
  readonly inserts: {
    readonly locations: readonly Location[];
    readonly exits: readonly Exit[];
    readonly items: readonly Item[];
    readonly agents: readonly Agent[];
  };
  readonly updates: {
    readonly locations: readonly Location[];
    readonly exits: readonly Exit[];
    readonly items: readonly Item[];
    readonly agents: readonly Agent[];
  };
  readonly deletes: readonly EntityRef[];
  readonly skipped: readonly SkipReport[];
}

export interface PublishResult {
  readonly outcome: PublishOutcomeKind;
  readonly liveWorldId: WorldId;
  readonly applied: {
    readonly inserts: number;
    readonly updates: number;
    readonly deletes: number;
  };
  readonly skipped: readonly SkipReport[];
}

export interface CreateDraftInput {
  readonly displayName: string;
  readonly label: string;
}

export interface UpsertLocationInput {
  readonly id: LocationId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
}

export interface UpsertExitInput {
  readonly id: ExitId;
  readonly from: LocationId;
  readonly to: LocationId;
  readonly direction: string;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}

export interface UpsertItemInput {
  readonly id: ItemId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly ownerKind: 'location' | 'agent' | 'item';
  readonly ownerId: string;
  readonly weight: number;
  readonly hidden: boolean;
}

export interface UpsertAgentInput {
  readonly id: AgentId;
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

- [ ] **Step 3: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/core/domain/builder-kinds.ts src/core/domain/builder-types.ts
git commit -m "builder: domain kinds and types"
```

---

## Task 2: Schema migration

**Files:**
- Modify: `src/infra/schema.ts`
- Create: `drizzle/0005_campaign_builder.sql`
- Create: `scripts/migrate-worlds.ts`
- Modify: `package.json` (add `migrate:worlds` script)

- [ ] **Step 1: Update `src/infra/schema.ts`**

Add columns to `worlds` and a new `worldSnapshots` table. Replace the existing `worlds` definition and append the snapshot table.

```ts
// src/infra/schema.ts — top of file unchanged
export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  rngSeed: integer('rng_seed').notNull().default(1),
  kind: text('kind', { enum: ['draft', 'live'] }).notNull().default('live'),
  parentDraftId: text('parent_draft_id'),
  displayName: text('display_name').notNull().default(''),
  playerAgentId: text('player_agent_id'),
});

// ... existing tables unchanged ...

export const worldSnapshots = sqliteTable('world_snapshots', {
  worldId: text('world_id')
    .primaryKey()
    .references(() => worlds.id),
  snapshotJson: text('snapshot_json').notNull(),
  takenAt: integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm exec drizzle-kit generate`
Expected: a new file `drizzle/0005_*.sql` is created. Inspect it; rename to `drizzle/0005_campaign_builder.sql` if drizzle-kit named it differently. Verify it contains `ALTER TABLE worlds ADD ...` for each new column and `CREATE TABLE world_snapshots`. If drizzle-kit complains about non-null columns added to an existing table, the defaults above (`'live'`, empty string) prevent that.

- [ ] **Step 3: Write the data migration script**

```ts
// scripts/migrate-worlds.ts
import 'dotenv/config';
import { BURNING_DISTRICT_CAMPAIGN } from '@campaigns/burning-district';
import { openDb } from '@infra/db';
import * as schema from '@infra/schema';
import { eq } from 'drizzle-orm';

/**
 * One-shot: backfill displayName and playerAgentId on rows that pre-date
 * the campaign-builder migration. Idempotent.
 */
async function main() {
  const path = process.env.DB_PATH ?? './imagined-dungeons.db';
  const handle = openDb(path);
  const rows = await handle.db.select().from(schema.worlds);
  for (const row of rows) {
    const patch: Partial<typeof schema.worlds.$inferInsert> = {};
    if (!row.displayName) patch.displayName = row.label;
    if (!row.playerAgentId && row.id === BURNING_DISTRICT_CAMPAIGN.worldId) {
      patch.playerAgentId = BURNING_DISTRICT_CAMPAIGN.playerId;
    }
    if (Object.keys(patch).length > 0) {
      await handle.db.update(schema.worlds).set(patch).where(eq(schema.worlds.id, row.id));
    }
  }
  handle.close();
  // biome-ignore lint/suspicious/noConsole: one-shot script
  console.log(`Migrated ${rows.length} world row(s).`);
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: one-shot script
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Add the script entry**

In `package.json`, add to `scripts`:

```
"migrate:worlds": "tsx scripts/migrate-worlds.ts"
```

- [ ] **Step 5: Verify typecheck and existing tests still pass**

Run: `pnpm typecheck && pnpm test`
Expected: all green. The schema change is additive; existing seeder paths set `kind` to its default `'live'` automatically.

- [ ] **Step 6: Commit**

```bash
git add src/infra/schema.ts drizzle/0005_campaign_builder.sql scripts/migrate-worlds.ts package.json
git commit -m "builder: schema migration for draft/live worlds and snapshots"
```

---

## Task 3: BuilderRepository port

**Files:**
- Create: `src/core/builder/repository.ts`

- [ ] **Step 1: Write the port interface**

```ts
// src/core/builder/repository.ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import type { AgentId, ExitId, ItemId, LocationId, WorldId } from '@core/domain/ids';
import type { WorldKind } from '@core/domain/builder-kinds';
import type {
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  WorldSummary,
} from '@core/domain/builder-types';

/**
 * Structural-write port for the campaign builder. The engine's `Repository`
 * is read-mostly with narrow runtime mutations; the builder needs broad
 * structural CRUD over locations/exits/items/agents plus world-level admin
 * (create/clone/list, snapshot read/write, transactional publish).
 *
 * Implemented by `MemoryBuilderRepository` (tests) and
 * `SqliteBuilderRepository` (production).
 */
export interface BuilderRepository {
  listWorlds(): Promise<readonly WorldSummary[]>;
  getWorldSummary(id: WorldId): Promise<WorldSummary | null>;
  createWorld(summary: WorldSummary): Promise<void>;
  updateWorldSummary(
    id: WorldId,
    patch: Partial<Omit<WorldSummary, 'id' | 'kind'>>,
  ): Promise<void>;

  listLocations(worldId: WorldId): Promise<readonly Location[]>;
  listExits(worldId: WorldId): Promise<readonly Exit[]>;
  listItems(worldId: WorldId): Promise<readonly Item[]>;
  listAgents(worldId: WorldId): Promise<readonly Agent[]>;

  upsertLocation(worldId: WorldId, input: UpsertLocationInput): Promise<void>;
  upsertExit(worldId: WorldId, input: UpsertExitInput): Promise<void>;
  upsertItem(worldId: WorldId, input: UpsertItemInput): Promise<void>;
  upsertAgent(worldId: WorldId, input: UpsertAgentInput): Promise<void>;

  deleteLocation(worldId: WorldId, id: LocationId): Promise<void>;
  deleteExit(worldId: WorldId, id: ExitId): Promise<void>;
  deleteItem(worldId: WorldId, id: ItemId): Promise<void>;
  deleteAgent(worldId: WorldId, id: AgentId): Promise<void>;

  /** Snapshot of last published draft state for a live world (or null). */
  readSnapshot(worldId: WorldId): Promise<{
    json: string;
    takenAt: number;
  } | null>;
  writeSnapshot(worldId: WorldId, json: string, takenAt: number): Promise<void>;

  /**
   * Run `fn` inside a single transaction. Implementations must guarantee
   * either every write inside `fn` lands or none does.
   */
  transaction<T>(fn: (tx: BuilderRepository) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/core/builder/repository.ts
git commit -m "builder: BuilderRepository port"
```

---

## Task 4: MemoryBuilderRepository

**Files:**
- Create: `src/infra/builder-memory-repository.ts`

- [ ] **Step 1: Implement the in-memory adapter**

```ts
// src/infra/builder-memory-repository.ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type WorldId,
} from '@core/domain/ids';
import type { Direction } from '@core/domain/kinds';
import type { BuilderRepository } from '@core/builder/repository';
import type {
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  WorldSummary,
} from '@core/domain/builder-types';

interface Snapshot {
  json: string;
  takenAt: number;
}

/**
 * Test-only in-memory `BuilderRepository`. Holds plain Maps. Transactions
 * snapshot-and-restore on failure so tests for atomicity work.
 */
export class MemoryBuilderRepository implements BuilderRepository {
  private worlds = new Map<WorldId, WorldSummary>();
  private locations = new Map<WorldId, Map<LocationId, Location>>();
  private exits = new Map<WorldId, Map<ExitId, Exit>>();
  private items = new Map<WorldId, Map<ItemId, Item>>();
  private agents = new Map<WorldId, Map<AgentId, Agent>>();
  private snapshots = new Map<WorldId, Snapshot>();

  private bucket<K, V>(map: Map<WorldId, Map<K, V>>, world: WorldId): Map<K, V> {
    let b = map.get(world);
    if (!b) {
      b = new Map<K, V>();
      map.set(world, b);
    }
    return b;
  }

  async listWorlds() {
    return [...this.worlds.values()];
  }
  async getWorldSummary(id: WorldId) {
    return this.worlds.get(id) ?? null;
  }
  async createWorld(s: WorldSummary) {
    this.worlds.set(s.id, s);
  }
  async updateWorldSummary(id: WorldId, patch: Partial<Omit<WorldSummary, 'id' | 'kind'>>) {
    const cur = this.worlds.get(id);
    if (!cur) return;
    this.worlds.set(id, { ...cur, ...patch });
  }

  async listLocations(w: WorldId) {
    return [...this.bucket(this.locations, w).values()];
  }
  async listExits(w: WorldId) {
    return [...this.bucket(this.exits, w).values()];
  }
  async listItems(w: WorldId) {
    return [...this.bucket(this.items, w).values()];
  }
  async listAgents(w: WorldId) {
    return [...this.bucket(this.agents, w).values()];
  }

  async upsertLocation(w: WorldId, i: UpsertLocationInput) {
    this.bucket(this.locations, w).set(i.id, {
      id: asLocationId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
    });
  }
  async upsertExit(w: WorldId, i: UpsertExitInput) {
    this.bucket(this.exits, w).set(i.id, {
      id: asExitId(i.id),
      worldId: w,
      from: i.from,
      to: i.to,
      direction: i.direction as Direction,
      label: i.label,
      locked: i.locked,
      lockedByItem: i.lockedByItem,
    });
  }
  async upsertItem(w: WorldId, i: UpsertItemInput) {
    const owner =
      i.ownerKind === 'location'
        ? { kind: 'location' as const, id: asLocationId(i.ownerId) }
        : i.ownerKind === 'agent'
          ? { kind: 'agent' as const, id: asAgentId(i.ownerId) }
          : { kind: 'item' as const, id: asItemId(i.ownerId) };
    this.bucket(this.items, w).set(i.id, {
      id: asItemId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      owner,
      weight: i.weight,
      hidden: i.hidden,
    });
  }
  async upsertAgent(w: WorldId, i: UpsertAgentInput) {
    this.bucket(this.agents, w).set(i.id, {
      id: asAgentId(i.id),
      worldId: w,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      locationId: i.locationId,
      hp: i.hp,
      damage: i.damage,
      defense: i.defense,
      capacity: i.capacity,
      mood: i.mood,
      shortTermIntent: null,
      goal: i.goal,
      autonomous: i.autonomous,
      awake: false,
    });
  }

  async deleteLocation(w: WorldId, id: LocationId) {
    this.bucket(this.locations, w).delete(id);
  }
  async deleteExit(w: WorldId, id: ExitId) {
    this.bucket(this.exits, w).delete(id);
  }
  async deleteItem(w: WorldId, id: ItemId) {
    this.bucket(this.items, w).delete(id);
  }
  async deleteAgent(w: WorldId, id: AgentId) {
    this.bucket(this.agents, w).delete(id);
  }

  async readSnapshot(w: WorldId) {
    return this.snapshots.get(w) ?? null;
  }
  async writeSnapshot(w: WorldId, json: string, takenAt: number) {
    this.snapshots.set(w, { json, takenAt });
  }

  async transaction<T>(fn: (tx: BuilderRepository) => Promise<T>): Promise<T> {
    const backup = this.clone();
    try {
      return await fn(this);
    } catch (err) {
      this.restore(backup);
      throw err;
    }
  }

  private clone() {
    const dup = <K, V>(m: Map<WorldId, Map<K, V>>) => {
      const out = new Map<WorldId, Map<K, V>>();
      for (const [k, v] of m) out.set(k, new Map(v));
      return out;
    };
    return {
      worlds: new Map(this.worlds),
      locations: dup(this.locations),
      exits: dup(this.exits),
      items: dup(this.items),
      agents: dup(this.agents),
      snapshots: new Map(this.snapshots),
    };
  }
  private restore(b: ReturnType<MemoryBuilderRepository['clone']>) {
    this.worlds = b.worlds;
    this.locations = b.locations;
    this.exits = b.exits;
    this.items = b.items;
    this.agents = b.agents;
    this.snapshots = b.snapshots;
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/infra/builder-memory-repository.ts
git commit -m "builder: in-memory repository for tests"
```

---

## Task 5: Validator — table-driven

**Files:**
- Create: `src/core/builder/validate.ts`
- Create: `src/core/builder/validate.test.ts`

- [ ] **Step 1: Write failing tests for each problem code**

```ts
// src/core/builder/validate.test.ts
import { OwnerKind } from '@core/domain/kinds';
import { ProblemKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { asAgentId, asExitId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { validateWorld } from './validate';

const W = asWorldId('w_test');

const baseTree = (): WorldTree => ({
  summary: {
    id: W,
    kind: WorldKind.Draft,
    label: 'L',
    displayName: 'D',
    parentDraftId: null,
    playerAgentId: asAgentId('char_p'),
  },
  locations: [
    {
      id: asLocationId('loc_a'),
      worldId: W,
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
    },
    {
      id: asLocationId('loc_b'),
      worldId: W,
      label: 'B',
      shortDescription: 'b',
      longDescription: 'b',
    },
  ],
  exits: [],
  items: [],
  agents: [
    {
      id: asAgentId('char_p'),
      worldId: W,
      label: 'Player',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 0,
      defense: 0,
      capacity: 10,
      mood: null,
      shortTermIntent: null,
      goal: null,
      autonomous: false,
      awake: false,
    },
  ],
});

describe('validateWorld', () => {
  it('returns no problems for a clean tree', () => {
    expect(validateWorld(baseTree())).toEqual([]);
  });

  it('reports ExitFromMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      exits: [
        {
          id: asExitId('ex_1'),
          worldId: W,
          from: asLocationId('loc_missing'),
          to: asLocationId('loc_b'),
          direction: 'north' as never,
          label: 'n',
          locked: false,
          lockedByItem: null,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ExitFromMissing);
  });

  it('reports ExitToMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      exits: [
        {
          id: asExitId('ex_1'),
          worldId: W,
          from: asLocationId('loc_a'),
          to: asLocationId('loc_missing'),
          direction: 'north' as never,
          label: 'n',
          locked: false,
          lockedByItem: null,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ExitToMissing);
  });

  it('reports ExitLockedByItemMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      exits: [
        {
          id: asExitId('ex_1'),
          worldId: W,
          from: asLocationId('loc_a'),
          to: asLocationId('loc_b'),
          direction: 'north' as never,
          label: 'n',
          locked: true,
          lockedByItem: asItemId('item_missing'),
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(
      ProblemKind.ExitLockedByItemMissing,
    );
  });

  it('reports ItemOwnerMissing for a location owner', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      items: [
        {
          id: asItemId('item_x'),
          worldId: W,
          label: 'x',
          shortDescription: '',
          longDescription: '',
          owner: { kind: OwnerKind.Location, id: asLocationId('loc_missing') },
          weight: 1,
          hidden: false,
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.ItemOwnerMissing);
  });

  it('reports AgentLocationMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      agents: [
        {
          ...t.agents[0]!,
          locationId: asLocationId('loc_missing'),
        },
      ],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.AgentLocationMissing);
  });

  it('reports PlayerAgentNotSet', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      summary: { ...t.summary, playerAgentId: null },
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.PlayerAgentNotSet);
  });

  it('reports PlayerAgentMissing', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      summary: { ...t.summary, playerAgentId: asAgentId('char_nope') },
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.PlayerAgentMissing);
  });

  it('reports DuplicateId', () => {
    const t = baseTree();
    const dirty: WorldTree = {
      ...t,
      locations: [...t.locations, { ...t.locations[0]! }],
    };
    expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.DuplicateId);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/builder/validate.test.ts`
Expected: all FAIL — `validate.ts` does not exist yet.

- [ ] **Step 3: Implement `validate.ts`**

```ts
// src/core/builder/validate.ts
import type { WorldTree, Problem } from '@core/domain/builder-types';
import { EntityKind, ProblemKind } from '@core/domain/builder-kinds';
import { OwnerKind } from '@core/domain/kinds';

/**
 * Pure structural validator. Catches every constraint the engine assumes
 * holds at runtime: referential integrity for exits/items/agents and the
 * presence + resolvability of the player agent. Returns an empty array for
 * a clean tree; non-empty results are the publish gate.
 */
export function validateWorld(tree: WorldTree): Problem[] {
  const problems: Problem[] = [];
  const locIds = new Set(tree.locations.map((l) => l.id as string));
  const itemIds = new Set(tree.items.map((i) => i.id as string));
  const agentIds = new Set(tree.agents.map((a) => a.id as string));

  // Duplicate ids (within entity kind).
  const checkDup = (ids: readonly string[], entity: typeof EntityKind[keyof typeof EntityKind]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        problems.push({
          kind: ProblemKind.DuplicateId,
          entity,
          entityId: id,
          message: `duplicate ${entity} id: ${id}`,
        });
      }
      seen.add(id);
    }
  };
  checkDup(tree.locations.map((l) => l.id as string), EntityKind.Location);
  checkDup(tree.exits.map((e) => e.id as string), EntityKind.Exit);
  checkDup(tree.items.map((i) => i.id as string), EntityKind.Item);
  checkDup(tree.agents.map((a) => a.id as string), EntityKind.Agent);

  // Exits.
  for (const e of tree.exits) {
    if (!locIds.has(e.from as string)) {
      problems.push({
        kind: ProblemKind.ExitFromMissing,
        entity: EntityKind.Exit,
        entityId: e.id as string,
        message: `exit ${e.id} from missing location ${e.from}`,
      });
    }
    if (!locIds.has(e.to as string)) {
      problems.push({
        kind: ProblemKind.ExitToMissing,
        entity: EntityKind.Exit,
        entityId: e.id as string,
        message: `exit ${e.id} to missing location ${e.to}`,
      });
    }
    if (e.lockedByItem !== null && !itemIds.has(e.lockedByItem as string)) {
      problems.push({
        kind: ProblemKind.ExitLockedByItemMissing,
        entity: EntityKind.Exit,
        entityId: e.id as string,
        message: `exit ${e.id} locked by missing item ${e.lockedByItem}`,
      });
    }
  }

  // Items.
  for (const it of tree.items) {
    const ownerKind = it.owner.kind;
    const ownerId = it.owner.id as string;
    const set =
      ownerKind === OwnerKind.Location
        ? locIds
        : ownerKind === OwnerKind.Agent
          ? agentIds
          : itemIds;
    if (!set.has(ownerId)) {
      problems.push({
        kind: ProblemKind.ItemOwnerMissing,
        entity: EntityKind.Item,
        entityId: it.id as string,
        message: `item ${it.id} owner ${ownerKind}:${ownerId} not found`,
      });
    }
  }

  // Agents.
  for (const a of tree.agents) {
    if (!locIds.has(a.locationId as string)) {
      problems.push({
        kind: ProblemKind.AgentLocationMissing,
        entity: EntityKind.Agent,
        entityId: a.id as string,
        message: `agent ${a.id} at missing location ${a.locationId}`,
      });
    }
  }

  // Player agent.
  const player = tree.summary.playerAgentId;
  if (player === null) {
    problems.push({
      kind: ProblemKind.PlayerAgentNotSet,
      entity: EntityKind.Agent,
      entityId: '',
      message: 'world has no player agent set',
    });
  } else if (!agentIds.has(player as string)) {
    problems.push({
      kind: ProblemKind.PlayerAgentMissing,
      entity: EntityKind.Agent,
      entityId: player as string,
      message: `player agent ${player} not found`,
    });
  }

  return problems;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/core/builder/validate.test.ts`
Expected: all PASS.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

```bash
git add src/core/builder/validate.ts src/core/builder/validate.test.ts
git commit -m "builder: structural validator with table-driven tests"
```

---

## Task 6: Three-way diff — table-driven

**Files:**
- Create: `src/core/builder/diff.ts`
- Create: `src/core/builder/diff.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/core/builder/diff.test.ts
import { SkipReasonKind } from '@core/domain/builder-kinds';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { computeMergePlan } from './diff';
import type { WorldTree } from '@core/domain/builder-types';
import { WorldKind } from '@core/domain/builder-kinds';

const W = asWorldId('w_live');
const D = asWorldId('w_draft');

const emptyTree = (id = W, kind: WorldKind = WorldKind.Live): WorldTree => ({
  summary: {
    id,
    kind,
    label: 'L',
    displayName: 'D',
    parentDraftId: null,
    playerAgentId: null,
  },
  locations: [],
  exits: [],
  items: [],
  agents: [],
});

const loc = (id: string, label: string) => ({
  id: asLocationId(id),
  worldId: W,
  label,
  shortDescription: '',
  longDescription: '',
});

describe('computeMergePlan', () => {
  it('inserts rows present only in the draft', () => {
    const draft = { ...emptyTree(D, WorldKind.Draft), locations: [loc('loc_a', 'A')] };
    const plan = computeMergePlan(emptyTree(), draft, emptyTree());
    expect(plan.inserts.locations.map((l) => l.id as string)).toEqual(['loc_a']);
    expect(plan.skipped).toEqual([]);
  });

  it('updates a row when the draft differs from snapshot but live equals snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const draft = {
      ...emptyTree(D, WorldKind.Draft),
      locations: [loc('loc_a', 'A renamed')],
    };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.locations.map((l) => l.label)).toEqual(['A renamed']);
    expect(plan.skipped).toEqual([]);
  });

  it('skips updates when live diverged from snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A from gameplay')] };
    const draft = {
      ...emptyTree(D, WorldKind.Draft),
      locations: [loc('loc_a', 'A from author')],
    };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.locations).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]!.reason).toBe(SkipReasonKind.LiveDivergedFromSnapshot);
  });

  it('deletes a row dropped from the draft when live still equals snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const draft = emptyTree(D, WorldKind.Draft);
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.deletes.map((r) => r.id as string)).toEqual(['loc_a']);
  });

  it('skips deletes when live diverged from snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A drifted')] };
    const draft = emptyTree(D, WorldKind.Draft);
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.deletes).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]!.reason).toBe(SkipReasonKind.LiveDivergedFromSnapshot);
  });

  it('ignores runtime-only fields on agents', () => {
    const baseAgent = {
      id: asAgentId('char_x'),
      worldId: W,
      label: 'X',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      shortTermIntent: null,
      goal: null,
      autonomous: false,
      awake: false,
    };
    const snap = { ...emptyTree(), agents: [{ ...baseAgent }] };
    // Live diverges only on runtime fields (hp, mood, shortTermIntent, awake).
    const live = {
      ...emptyTree(),
      agents: [
        { ...baseAgent, hp: 3, mood: 'wounded', shortTermIntent: 'flee', awake: true },
      ],
    };
    const draft = {
      ...emptyTree(D, WorldKind.Draft),
      agents: [{ ...baseAgent, label: 'X renamed' }],
    };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.agents).toHaveLength(1);
    expect(plan.updates.agents[0]!.label).toBe('X renamed');
    expect(plan.skipped).toEqual([]);
  });

  it('reports no-op when draft equals snapshot', () => {
    const snap = { ...emptyTree(), locations: [loc('loc_a', 'A')] };
    const live = { ...emptyTree(), locations: [loc('loc_a', 'A drifted')] };
    const draft = { ...emptyTree(D, WorldKind.Draft), locations: [loc('loc_a', 'A')] };
    const plan = computeMergePlan(snap, draft, live);
    expect(plan.updates.locations).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/builder/diff.test.ts`
Expected: all FAIL.

- [ ] **Step 3: Implement `diff.ts`**

```ts
// src/core/builder/diff.ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import type { EntityRef, MergePlan, SkipReport, WorldTree } from '@core/domain/builder-types';
import { SkipReasonKind } from '@core/domain/builder-kinds';

/**
 * Three-way structural merge. Inputs are the last-published snapshot, the
 * current draft, and the current live world. Output is a plan of
 * inserts/updates/deletes plus a skip list for rows where applying the
 * authored change would clobber gameplay drift.
 *
 * Runtime-only fields on agents (`hp`, `mood`, `shortTermIntent`, `awake`)
 * are excluded from the comparison: they belong to gameplay, not authoring.
 */
export function computeMergePlan(
  snapshot: WorldTree,
  draft: WorldTree,
  live: WorldTree,
): MergePlan {
  const skipped: SkipReport[] = [];
  const inserts = blank();
  const updates = blank();
  const deletes: EntityRef[] = [];

  diffEntity('location', snapshot.locations, draft.locations, live.locations, locEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });
  diffEntity('exit', snapshot.exits, draft.exits, live.exits, exitEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });
  diffEntity('item', snapshot.items, draft.items, live.items, itemEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });
  diffEntity('agent', snapshot.agents, draft.agents, live.agents, agentStructEq, {
    inserts,
    updates,
    deletes,
    skipped,
  });

  return { inserts, updates, deletes, skipped };
}

interface Acc {
  inserts: ReturnType<typeof blank>;
  updates: ReturnType<typeof blank>;
  deletes: EntityRef[];
  skipped: SkipReport[];
}

function blank() {
  return {
    locations: [] as Location[],
    exits: [] as Exit[],
    items: [] as Item[],
    agents: [] as Agent[],
  };
}

function diffEntity<T extends { id: unknown }>(
  kind: 'location' | 'exit' | 'item' | 'agent',
  snap: readonly T[],
  draft: readonly T[],
  live: readonly T[],
  eq: (a: T, b: T) => boolean,
  acc: Acc,
): void {
  const snapMap = new Map(snap.map((r) => [r.id as string, r]));
  const draftMap = new Map(draft.map((r) => [r.id as string, r]));
  const liveMap = new Map(live.map((r) => [r.id as string, r]));

  // Inserts and updates.
  for (const [id, dRow] of draftMap) {
    const sRow = snapMap.get(id);
    const lRow = liveMap.get(id);
    if (!sRow && !lRow) {
      pushTo(acc.inserts, kind, dRow);
      continue;
    }
    if (sRow && !lRow) {
      // Was in the last publish, gone from live. Treat as re-insert; report skip.
      pushTo(acc.inserts, kind, dRow);
      acc.skipped.push({
        ref: refOf(kind, id),
        reason: SkipReasonKind.LiveDeletedRow,
      });
      continue;
    }
    if (!sRow && lRow) {
      // Created in both branches with the same id. Treat divergence cautiously.
      if (eq(dRow, lRow)) continue;
      acc.skipped.push({
        ref: refOf(kind, id),
        reason: SkipReasonKind.LiveDivergedFromSnapshot,
      });
      continue;
    }
    // Both sides present; have a snapshot to compare against.
    if (sRow && lRow) {
      const draftEqualsSnap = eq(dRow, sRow);
      const liveEqualsSnap = eq(lRow, sRow);
      if (draftEqualsSnap) continue; // author changed nothing
      if (liveEqualsSnap) {
        pushTo(acc.updates, kind, dRow);
      } else {
        acc.skipped.push({
          ref: refOf(kind, id),
          reason: SkipReasonKind.LiveDivergedFromSnapshot,
        });
      }
    }
  }

  // Deletes.
  for (const [id, sRow] of snapMap) {
    if (draftMap.has(id)) continue;
    const lRow = liveMap.get(id);
    if (!lRow) continue; // already gone from live
    if (eq(lRow, sRow)) {
      acc.deletes.push(refOf(kind, id));
    } else {
      acc.skipped.push({
        ref: refOf(kind, id),
        reason: SkipReasonKind.LiveDivergedFromSnapshot,
      });
    }
  }
}

function pushTo(
  bucket: ReturnType<typeof blank>,
  kind: 'location' | 'exit' | 'item' | 'agent',
  row: unknown,
): void {
  if (kind === 'location') bucket.locations.push(row as Location);
  else if (kind === 'exit') bucket.exits.push(row as Exit);
  else if (kind === 'item') bucket.items.push(row as Item);
  else bucket.agents.push(row as Agent);
}

function refOf(kind: 'location' | 'exit' | 'item' | 'agent', id: string): EntityRef {
  if (kind === 'location') return { kind, id: id as never };
  if (kind === 'exit') return { kind, id: id as never };
  if (kind === 'item') return { kind, id: id as never };
  return { kind, id: id as never };
}

const locEq = (a: Location, b: Location) =>
  a.label === b.label &&
  a.shortDescription === b.shortDescription &&
  a.longDescription === b.longDescription;

const exitEq = (a: Exit, b: Exit) =>
  a.from === b.from &&
  a.to === b.to &&
  a.direction === b.direction &&
  a.label === b.label &&
  a.locked === b.locked &&
  a.lockedByItem === b.lockedByItem;

const itemEq = (a: Item, b: Item) =>
  a.label === b.label &&
  a.shortDescription === b.shortDescription &&
  a.longDescription === b.longDescription &&
  a.owner.kind === b.owner.kind &&
  a.owner.id === b.owner.id &&
  a.weight === b.weight &&
  a.hidden === b.hidden;

// Structural-only agent equality: ignores hp, mood, shortTermIntent, awake.
const agentStructEq = (a: Agent, b: Agent) =>
  a.label === b.label &&
  a.shortDescription === b.shortDescription &&
  a.longDescription === b.longDescription &&
  a.locationId === b.locationId &&
  a.damage === b.damage &&
  a.defense === b.defense &&
  a.capacity === b.capacity &&
  a.goal === b.goal &&
  a.autonomous === b.autonomous;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/core/builder/diff.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

```bash
git add src/core/builder/diff.ts src/core/builder/diff.test.ts
git commit -m "builder: three-way merge plan with runtime-field exclusion"
```

---

## Task 7: Builder facade — create/upsert/delete/get

**Files:**
- Create: `src/core/builder/index.ts` (initial subset)
- Create: `src/core/builder/index.test.ts`

This task implements only the simple facade methods (no publish/reset yet). Publish lands in Task 8 because it has more moving parts.

- [ ] **Step 1: Write failing tests for the simple operations**

```ts
// src/core/builder/index.test.ts
import { WorldKind } from '@core/domain/builder-kinds';
import { asAgentId, asLocationId, asWorldId } from '@core/domain/ids';
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import {
  createDraft,
  deleteLocation,
  getWorldTree,
  upsertAgent,
  upsertLocation,
} from './index';

describe('builder facade — simple ops', () => {
  it('creates a draft world', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await createDraft(repo, { displayName: 'My Draft', label: 'Draft' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const summary = await repo.getWorldSummary(r.value);
      expect(summary?.kind).toBe(WorldKind.Draft);
      expect(summary?.displayName).toBe('My Draft');
    }
  });

  it('upserts a location into a draft and reads it back via getWorldTree', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const W = created.value;
    const r = await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
    });
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, W);
    expect(tree.ok).toBe(true);
    if (tree.ok) {
      expect(tree.value.locations).toHaveLength(1);
      expect(tree.value.locations[0]!.label).toBe('A');
    }
  });

  it('deletes a location', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error('create failed');
    const W = created.value;
    await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: 'a',
      longDescription: 'a',
    });
    const r = await deleteLocation(repo, W, asLocationId('loc_a'));
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, W);
    if (tree.ok) expect(tree.value.locations).toEqual([]);
  });

  it('getWorldTree errors on a missing world', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await getWorldTree(repo, asWorldId('w_nope'));
    expect(r.ok).toBe(false);
  });

  it('upsertAgent rejects when the parent world is missing', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await upsertAgent(repo, asWorldId('w_nope'), {
      id: asAgentId('char_x'),
      label: 'X',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 0,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
    });
    expect(r.ok).toBe(false);
  });

  it('upsertLocation refuses to write directly to a live world', async () => {
    const repo = new MemoryBuilderRepository();
    const liveId = asWorldId('w_live_direct');
    await repo.createWorld({
      id: liveId,
      kind: WorldKind.Live,
      label: 'L',
      displayName: 'L',
      parentDraftId: null,
      playerAgentId: null,
    });
    const r = await upsertLocation(repo, liveId, {
      id: asLocationId('loc_x'),
      label: 'X',
      shortDescription: '',
      longDescription: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('world_kind_mismatch');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/core/builder/index.test.ts`
Expected: FAIL (`index.ts` doesn't exist).

- [ ] **Step 3: Implement the facade subset**

```ts
// src/core/builder/index.ts
import { BuilderErrorKind, WorldKind } from '@core/domain/builder-kinds';
import type {
  BuilderError,
  CreateDraftInput,
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  WorldTree,
} from '@core/domain/builder-types';
import {
  asWorldId,
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type WorldId,
} from '@core/domain/ids';
import { Err, Ok, type Result } from '@core/domain/result';
import type { BuilderRepository } from './repository';

const newDraftId = (): WorldId =>
  asWorldId(`w_draft_${Math.random().toString(36).slice(2, 10)}`);

const err = (kind: BuilderErrorKind, message: string): BuilderError => ({ kind, message });

async function requireWorld(repo: BuilderRepository, id: WorldId) {
  const s = await repo.getWorldSummary(id);
  if (!s) return Err(err(BuilderErrorKind.WorldNotFound, `world not found: ${id}`));
  return Ok(s);
}

/**
 * Integrity gate for direct structural writes (upsert*/delete*). Live worlds
 * are read-only from outside the publish flow; the only mutators are
 * `publish` and `resetLiveToDraft`. This prevents an MCP/HTTP client from
 * bypassing validation by writing straight at a live world id.
 */
async function requireDraft(repo: BuilderRepository, id: WorldId) {
  const s = await requireWorld(repo, id);
  if (!s.ok) return s;
  if (s.value.kind !== WorldKind.Draft) {
    return Err(
      err(BuilderErrorKind.WorldKindMismatch, `world ${id} is live; direct writes go through publish`),
    );
  }
  return s;
}

export async function createDraft(
  repo: BuilderRepository,
  input: CreateDraftInput,
): Promise<Result<WorldId, BuilderError>> {
  const id = newDraftId();
  await repo.createWorld({
    id,
    kind: WorldKind.Draft,
    label: input.label,
    displayName: input.displayName,
    parentDraftId: null,
    playerAgentId: null,
  });
  return Ok(id);
}

export async function getWorldTree(
  repo: BuilderRepository,
  id: WorldId,
): Promise<Result<WorldTree, BuilderError>> {
  const s = await requireWorld(repo, id);
  if (!s.ok) return s;
  const [locations, exits, items, agents] = await Promise.all([
    repo.listLocations(id),
    repo.listExits(id),
    repo.listItems(id),
    repo.listAgents(id),
  ]);
  return Ok({ summary: s.value, locations, exits, items, agents });
}

export async function upsertLocation(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertLocationInput,
): Promise<Result<LocationId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertLocation(worldId, input);
  return Ok(input.id);
}

export async function upsertExit(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertExitInput,
): Promise<Result<ExitId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertExit(worldId, input);
  return Ok(input.id);
}

export async function upsertItem(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertItemInput,
): Promise<Result<ItemId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertItem(worldId, input);
  return Ok(input.id);
}

export async function upsertAgent(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertAgentInput,
): Promise<Result<AgentId, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertAgent(worldId, input);
  return Ok(input.id);
}

export async function deleteLocation(
  repo: BuilderRepository,
  worldId: WorldId,
  id: LocationId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteLocation(worldId, id);
  return Ok(undefined);
}

export async function deleteExit(
  repo: BuilderRepository,
  worldId: WorldId,
  id: ExitId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteExit(worldId, id);
  return Ok(undefined);
}

export async function deleteItem(
  repo: BuilderRepository,
  worldId: WorldId,
  id: ItemId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteItem(worldId, id);
  return Ok(undefined);
}

export async function deleteAgent(
  repo: BuilderRepository,
  worldId: WorldId,
  id: AgentId,
): Promise<Result<void, BuilderError>> {
  const s = await requireWorld(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteAgent(worldId, id);
  return Ok(undefined);
}

export async function listWorlds(repo: BuilderRepository) {
  return repo.listWorlds();
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test src/core/builder/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add src/core/builder/index.ts src/core/builder/index.test.ts
git commit -m "builder: facade for create/upsert/delete/get"
```

---

## Task 8: Publish, clone-live-as-draft, and reset-live-to-draft

**Files:**
- Modify: `src/core/builder/index.ts`
- Modify: `src/core/builder/index.test.ts`

- [ ] **Step 1: Add failing tests for publish flows**

Append to `src/core/builder/index.test.ts`:

```ts
import { PublishOutcomeKind } from '@core/domain/builder-kinds';
import {
  cloneLiveAsDraft,
  publish,
  resetLiveToDraft,
  upsertAgent as upsertAgentFn,
} from './index';

const seedMinimalDraft = async (repo: MemoryBuilderRepository) => {
  const created = await createDraft(repo, { displayName: 'D', label: 'L' });
  if (!created.ok) throw new Error('create');
  const W = created.value;
  await upsertLocation(repo, W, {
    id: asLocationId('loc_a'),
    label: 'A',
    shortDescription: '',
    longDescription: '',
  });
  await upsertAgentFn(repo, W, {
    id: asAgentId('char_p'),
    label: 'P',
    shortDescription: '',
    longDescription: '',
    locationId: asLocationId('loc_a'),
    hp: 10,
    damage: 0,
    defense: 0,
    capacity: 10,
    mood: null,
    goal: null,
    autonomous: false,
  });
  await repo.updateWorldSummary(W, { playerAgentId: asAgentId('char_p') });
  return W;
};

describe('publish', () => {
  it('refuses to publish a draft with validation problems', async () => {
    const repo = new MemoryBuilderRepository();
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error();
    const r = await publish(repo, created.value);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('validation_failed');
      expect((r.error.problems ?? []).length).toBeGreaterThan(0);
    }
  });

  it('creates a live world on first publish', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const r = await publish(repo, draftId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.outcome).toBe(PublishOutcomeKind.Created);
      const live = await repo.getWorldSummary(r.value.liveWorldId);
      expect(live?.kind).toBe('live');
      expect(live?.parentDraftId).toBe(draftId);
      const snap = await repo.readSnapshot(r.value.liveWorldId);
      expect(snap).not.toBeNull();
    }
  });

  it('merges the second publish without clobbering live drift', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const first = await publish(repo, draftId);
    if (!first.ok) throw new Error();
    const liveId = first.value.liveWorldId;

    // Simulate gameplay drift on a structural field.
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_a'),
      label: 'A from gameplay',
      shortDescription: '',
      longDescription: '',
    });
    // Author edits the same location.
    await upsertLocation(repo, draftId, {
      id: asLocationId('loc_a'),
      label: 'A from author',
      shortDescription: '',
      longDescription: '',
    });

    const second = await publish(repo, draftId);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.outcome).toBe(PublishOutcomeKind.Merged);
      expect(second.value.skipped).toHaveLength(1);
      const liveLocs = await repo.listLocations(liveId);
      expect(liveLocs[0]!.label).toBe('A from gameplay');
    }
  });
});

describe('cloneLiveAsDraft', () => {
  it('copies a live world into a fresh draft', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const first = await publish(repo, draftId);
    if (!first.ok) throw new Error();
    const liveId = first.value.liveWorldId;
    const cloned = await cloneLiveAsDraft(repo, liveId);
    expect(cloned.ok).toBe(true);
    if (cloned.ok) {
      const tree = await getWorldTree(repo, cloned.value);
      if (!tree.ok) throw new Error();
      expect(tree.value.summary.kind).toBe('draft');
      expect(tree.value.locations.map((l) => l.id)).toEqual(['loc_a']);
    }
  });
});

describe('resetLiveToDraft', () => {
  it('replaces live rows with the draft', async () => {
    const repo = new MemoryBuilderRepository();
    const draftId = await seedMinimalDraft(repo);
    const first = await publish(repo, draftId);
    if (!first.ok) throw new Error();
    const liveId = first.value.liveWorldId;
    // Drift live.
    await repo.upsertLocation(liveId, {
      id: asLocationId('loc_a'),
      label: 'A drifted',
      shortDescription: '',
      longDescription: '',
    });
    const r = await resetLiveToDraft(repo, draftId);
    expect(r.ok).toBe(true);
    const liveLocs = await repo.listLocations(liveId);
    expect(liveLocs[0]!.label).toBe('A');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/core/builder/index.test.ts`
Expected: new tests FAIL, others still pass.

- [ ] **Step 3: Implement publish/clone/reset**

Append to `src/core/builder/index.ts`:

```ts
import {
  BuilderErrorKind,
  PublishOutcomeKind,
  WorldKind,
} from '@core/domain/builder-kinds';
import type {
  PublishResult,
  WorldTree,
} from '@core/domain/builder-types';
import { computeMergePlan } from './diff';
import { validateWorld } from './validate';

const newLiveId = (): WorldId =>
  asWorldId(`w_live_${Math.random().toString(36).slice(2, 10)}`);

async function findLiveForDraft(
  repo: BuilderRepository,
  draftId: WorldId,
): Promise<WorldId | null> {
  const all = await repo.listWorlds();
  const hit = all.find((w) => w.kind === WorldKind.Live && w.parentDraftId === draftId);
  return hit?.id ?? null;
}

async function copyTreeIntoWorld(
  repo: BuilderRepository,
  source: WorldTree,
  destWorldId: WorldId,
): Promise<void> {
  for (const l of source.locations) {
    await repo.upsertLocation(destWorldId, {
      id: l.id,
      label: l.label,
      shortDescription: l.shortDescription,
      longDescription: l.longDescription,
    });
  }
  for (const a of source.agents) {
    await repo.upsertAgent(destWorldId, {
      id: a.id,
      label: a.label,
      shortDescription: a.shortDescription,
      longDescription: a.longDescription,
      locationId: a.locationId,
      hp: a.hp,
      damage: a.damage,
      defense: a.defense,
      capacity: a.capacity,
      mood: a.mood,
      goal: a.goal,
      autonomous: a.autonomous,
    });
  }
  for (const it of source.items) {
    await repo.upsertItem(destWorldId, {
      id: it.id,
      label: it.label,
      shortDescription: it.shortDescription,
      longDescription: it.longDescription,
      ownerKind: it.owner.kind,
      ownerId: it.owner.id as string,
      weight: it.weight,
      hidden: it.hidden,
    });
  }
  for (const e of source.exits) {
    await repo.upsertExit(destWorldId, {
      id: e.id,
      from: e.from,
      to: e.to,
      direction: e.direction,
      label: e.label,
      locked: e.locked,
      lockedByItem: e.lockedByItem,
    });
  }
}

function snapshotJson(tree: WorldTree): string {
  return JSON.stringify({
    locations: tree.locations,
    exits: tree.exits,
    items: tree.items,
    agents: tree.agents,
  });
}

export async function publish(
  repo: BuilderRepository,
  draftId: WorldId,
): Promise<Result<PublishResult, BuilderError>> {
  const draftSummary = await requireWorld(repo, draftId);
  if (!draftSummary.ok) return draftSummary;
  if (draftSummary.value.kind !== WorldKind.Draft) {
    return Err(err(BuilderErrorKind.WorldKindMismatch, `world ${draftId} is not a draft`));
  }
  const draftTree = await getWorldTree(repo, draftId);
  if (!draftTree.ok) return draftTree;

  const problems = validateWorld(draftTree.value);
  if (problems.length > 0) {
    return Err({
      kind: BuilderErrorKind.ValidationFailed,
      message: 'draft has validation problems',
      problems,
    });
  }

  const liveId = await findLiveForDraft(repo, draftId);
  return repo.transaction(async (tx) => {
    if (!liveId) {
      const newId = newLiveId();
      await tx.createWorld({
        id: newId,
        kind: WorldKind.Live,
        label: draftSummary.value.label,
        displayName: draftSummary.value.displayName,
        parentDraftId: draftId,
        playerAgentId: draftSummary.value.playerAgentId,
      });
      await copyTreeIntoWorld(tx, draftTree.value, newId);
      await tx.writeSnapshot(newId, snapshotJson(draftTree.value), Date.now());
      return Ok<PublishResult, BuilderError>({
        outcome: PublishOutcomeKind.Created,
        liveWorldId: newId,
        applied: {
          inserts:
            draftTree.value.locations.length +
            draftTree.value.exits.length +
            draftTree.value.items.length +
            draftTree.value.agents.length,
          updates: 0,
          deletes: 0,
        },
        skipped: [],
      });
    }

    const snap = await tx.readSnapshot(liveId);
    const liveTree = await getWorldTree(tx, liveId);
    if (!liveTree.ok) return liveTree;
    const snapTree: WorldTree = snap
      ? {
          summary: liveTree.value.summary,
          ...(JSON.parse(snap.json) as Pick<
            WorldTree,
            'locations' | 'exits' | 'items' | 'agents'
          >),
        }
      : { ...liveTree.value };
    const plan = computeMergePlan(snapTree, draftTree.value, liveTree.value);

    for (const l of plan.inserts.locations) await tx.upsertLocation(liveId, asLocInput(l));
    for (const a of plan.inserts.agents) await tx.upsertAgent(liveId, asAgentInput(a));
    for (const it of plan.inserts.items) await tx.upsertItem(liveId, asItemInput(it));
    for (const e of plan.inserts.exits) await tx.upsertExit(liveId, asExitInput(e));
    for (const l of plan.updates.locations) await tx.upsertLocation(liveId, asLocInput(l));
    for (const a of plan.updates.agents) await tx.upsertAgent(liveId, asAgentInput(a));
    for (const it of plan.updates.items) await tx.upsertItem(liveId, asItemInput(it));
    for (const e of plan.updates.exits) await tx.upsertExit(liveId, asExitInput(e));
    for (const ref of plan.deletes) {
      if (ref.kind === 'location') await tx.deleteLocation(liveId, ref.id);
      else if (ref.kind === 'exit') await tx.deleteExit(liveId, ref.id);
      else if (ref.kind === 'item') await tx.deleteItem(liveId, ref.id);
      else await tx.deleteAgent(liveId, ref.id);
    }
    await tx.writeSnapshot(liveId, snapshotJson(draftTree.value), Date.now());

    return Ok<PublishResult, BuilderError>({
      outcome: PublishOutcomeKind.Merged,
      liveWorldId: liveId,
      applied: {
        inserts:
          plan.inserts.locations.length +
          plan.inserts.exits.length +
          plan.inserts.items.length +
          plan.inserts.agents.length,
        updates:
          plan.updates.locations.length +
          plan.updates.exits.length +
          plan.updates.items.length +
          plan.updates.agents.length,
        deletes: plan.deletes.length,
      },
      skipped: plan.skipped,
    });
  });
}

const asLocInput = (l: import('@core/domain/entities').Location): UpsertLocationInput => ({
  id: l.id,
  label: l.label,
  shortDescription: l.shortDescription,
  longDescription: l.longDescription,
});
const asExitInput = (e: import('@core/domain/entities').Exit): UpsertExitInput => ({
  id: e.id,
  from: e.from,
  to: e.to,
  direction: e.direction,
  label: e.label,
  locked: e.locked,
  lockedByItem: e.lockedByItem,
});
const asItemInput = (i: import('@core/domain/entities').Item): UpsertItemInput => ({
  id: i.id,
  label: i.label,
  shortDescription: i.shortDescription,
  longDescription: i.longDescription,
  ownerKind: i.owner.kind,
  ownerId: i.owner.id as string,
  weight: i.weight,
  hidden: i.hidden,
});
const asAgentInput = (a: import('@core/domain/entities').Agent): UpsertAgentInput => ({
  id: a.id,
  label: a.label,
  shortDescription: a.shortDescription,
  longDescription: a.longDescription,
  locationId: a.locationId,
  hp: a.hp,
  damage: a.damage,
  defense: a.defense,
  capacity: a.capacity,
  mood: a.mood,
  goal: a.goal,
  autonomous: a.autonomous,
});

export async function cloneLiveAsDraft(
  repo: BuilderRepository,
  liveWorldId: WorldId,
): Promise<Result<WorldId, BuilderError>> {
  const live = await requireWorld(repo, liveWorldId);
  if (!live.ok) return live;
  if (live.value.kind !== WorldKind.Live) {
    return Err(err(BuilderErrorKind.WorldKindMismatch, `world ${liveWorldId} is not live`));
  }
  const liveTree = await getWorldTree(repo, liveWorldId);
  if (!liveTree.ok) return liveTree;

  const draftId = newDraftId();
  await repo.createWorld({
    id: draftId,
    kind: WorldKind.Draft,
    label: live.value.label,
    displayName: live.value.displayName,
    parentDraftId: null,
    playerAgentId: live.value.playerAgentId,
  });
  await copyTreeIntoWorld(repo, liveTree.value, draftId);
  await repo.updateWorldSummary(liveWorldId, { parentDraftId: draftId });
  return Ok(draftId);
}

export async function resetLiveToDraft(
  repo: BuilderRepository,
  draftId: WorldId,
): Promise<Result<void, BuilderError>> {
  const draft = await requireWorld(repo, draftId);
  if (!draft.ok) return draft;
  if (draft.value.kind !== WorldKind.Draft) {
    return Err(err(BuilderErrorKind.WorldKindMismatch, `world ${draftId} is not a draft`));
  }
  const liveId = await findLiveForDraft(repo, draftId);
  if (!liveId) {
    return Err(
      err(BuilderErrorKind.NoLiveWorldForDraft, `no live world published from ${draftId}`),
    );
  }
  const draftTree = await getWorldTree(repo, draftId);
  if (!draftTree.ok) return draftTree;
  const problems = validateWorld(draftTree.value);
  if (problems.length > 0) {
    return Err({
      kind: BuilderErrorKind.ValidationFailed,
      message: 'draft has validation problems',
      problems,
    });
  }

  return repo.transaction(async (tx) => {
    const live = await getWorldTree(tx, liveId);
    if (!live.ok) return live;
    for (const e of live.value.exits) await tx.deleteExit(liveId, e.id);
    for (const it of live.value.items) await tx.deleteItem(liveId, it.id);
    for (const a of live.value.agents) await tx.deleteAgent(liveId, a.id);
    for (const l of live.value.locations) await tx.deleteLocation(liveId, l.id);
    await copyTreeIntoWorld(tx, draftTree.value, liveId);
    await tx.writeSnapshot(liveId, snapshotJson(draftTree.value), Date.now());
    return Ok<void, BuilderError>(undefined);
  });
}
```

- [ ] **Step 4: Run all builder tests**

Run: `pnpm test src/core/builder/`
Expected: all PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add src/core/builder/index.ts src/core/builder/index.test.ts
git commit -m "builder: publish, clone-live-as-draft, reset-live-to-draft"
```

---

## Task 9: SqliteBuilderRepository

**Files:**
- Create: `src/infra/builder-sqlite-repository.ts`
- Create: `tests/integration/builder-sqlite.test.ts`

- [ ] **Step 1: Implement the SQLite adapter**

```ts
// src/infra/builder-sqlite-repository.ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  type AgentId,
  type ExitId,
  type ItemId,
  type LocationId,
  type WorldId,
} from '@core/domain/ids';
import { OwnerKind, type Direction } from '@core/domain/kinds';
import type { BuilderRepository } from '@core/builder/repository';
import {
  type WorldKind,
  WorldKind as WorldKindConst,
} from '@core/domain/builder-kinds';
import type {
  UpsertAgentInput,
  UpsertExitInput,
  UpsertItemInput,
  UpsertLocationInput,
  WorldSummary,
} from '@core/domain/builder-types';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import * as schema from './schema';

export class SqliteBuilderRepository implements BuilderRepository {
  constructor(private readonly db: DB) {}

  async listWorlds(): Promise<readonly WorldSummary[]> {
    const rows = await this.db.select().from(schema.worlds);
    return rows.map(toSummary);
  }
  async getWorldSummary(id: WorldId): Promise<WorldSummary | null> {
    const rows = await this.db.select().from(schema.worlds).where(eq(schema.worlds.id, id));
    const row = rows[0];
    return row ? toSummary(row) : null;
  }
  async createWorld(s: WorldSummary): Promise<void> {
    await this.db.insert(schema.worlds).values({
      id: s.id,
      label: s.label,
      kind: s.kind,
      parentDraftId: s.parentDraftId,
      displayName: s.displayName,
      playerAgentId: s.playerAgentId,
      rngSeed: 1,
    });
  }
  async updateWorldSummary(
    id: WorldId,
    patch: Partial<Omit<WorldSummary, 'id' | 'kind'>>,
  ): Promise<void> {
    const update: Partial<typeof schema.worlds.$inferInsert> = {};
    if (patch.label !== undefined) update.label = patch.label;
    if (patch.displayName !== undefined) update.displayName = patch.displayName;
    if (patch.parentDraftId !== undefined) update.parentDraftId = patch.parentDraftId;
    if (patch.playerAgentId !== undefined) update.playerAgentId = patch.playerAgentId;
    if (Object.keys(update).length === 0) return;
    await this.db.update(schema.worlds).set(update).where(eq(schema.worlds.id, id));
  }

  async listLocations(w: WorldId) {
    const rows = await this.db.select().from(schema.locations).where(eq(schema.locations.worldId, w));
    return rows.map((r) => toLocation(r, w));
  }
  async listExits(w: WorldId) {
    const rows = await this.db.select().from(schema.exits).where(eq(schema.exits.worldId, w));
    return rows.map((r) => toExit(r, w));
  }
  async listItems(w: WorldId) {
    const rows = await this.db.select().from(schema.items).where(eq(schema.items.worldId, w));
    return rows.map((r) => toItem(r, w));
  }
  async listAgents(w: WorldId) {
    const rows = await this.db.select().from(schema.agents).where(eq(schema.agents.worldId, w));
    return rows.map((r) => toAgent(r, w));
  }

  async upsertLocation(w: WorldId, i: UpsertLocationInput): Promise<void> {
    await this.db
      .insert(schema.locations)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
      })
      .onConflictDoUpdate({
        target: schema.locations.id,
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
        },
      });
  }
  async upsertExit(w: WorldId, i: UpsertExitInput): Promise<void> {
    await this.db
      .insert(schema.exits)
      .values({
        id: i.id,
        worldId: w,
        fromLocationId: i.from,
        toLocationId: i.to,
        direction: i.direction,
        label: i.label,
        locked: i.locked,
        lockedByItemId: i.lockedByItem,
      })
      .onConflictDoUpdate({
        target: schema.exits.id,
        set: {
          fromLocationId: i.from,
          toLocationId: i.to,
          direction: i.direction,
          label: i.label,
          locked: i.locked,
          lockedByItemId: i.lockedByItem,
        },
      });
  }
  async upsertItem(w: WorldId, i: UpsertItemInput): Promise<void> {
    await this.db
      .insert(schema.items)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        ownerKind: i.ownerKind,
        ownerId: i.ownerId,
        weight: i.weight,
        hidden: i.hidden,
      })
      .onConflictDoUpdate({
        target: schema.items.id,
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          ownerKind: i.ownerKind,
          ownerId: i.ownerId,
          weight: i.weight,
          hidden: i.hidden,
        },
      });
  }
  async upsertAgent(w: WorldId, i: UpsertAgentInput): Promise<void> {
    // Insert path: full row with runtime defaults.
    // Update path: structural fields only — never touches hp/mood/short_term_intent/awake.
    await this.db
      .insert(schema.agents)
      .values({
        id: i.id,
        worldId: w,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        locationId: i.locationId,
        hp: i.hp,
        damage: i.damage,
        defense: i.defense,
        capacity: i.capacity,
        mood: i.mood,
        shortTermIntent: null,
        goal: i.goal,
        autonomous: i.autonomous,
        awake: false,
      })
      .onConflictDoUpdate({
        target: schema.agents.id,
        set: {
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          locationId: i.locationId,
          damage: i.damage,
          defense: i.defense,
          capacity: i.capacity,
          goal: i.goal,
          autonomous: i.autonomous,
        },
      });
  }

  async deleteLocation(_w: WorldId, id: LocationId) {
    await this.db.delete(schema.locations).where(eq(schema.locations.id, id));
  }
  async deleteExit(_w: WorldId, id: ExitId) {
    await this.db.delete(schema.exits).where(eq(schema.exits.id, id));
  }
  async deleteItem(_w: WorldId, id: ItemId) {
    await this.db.delete(schema.items).where(eq(schema.items.id, id));
  }
  async deleteAgent(_w: WorldId, id: AgentId) {
    await this.db.delete(schema.agents).where(eq(schema.agents.id, id));
  }

  async readSnapshot(w: WorldId) {
    const rows = await this.db
      .select()
      .from(schema.worldSnapshots)
      .where(eq(schema.worldSnapshots.worldId, w));
    const row = rows[0];
    if (!row) return null;
    return { json: row.snapshotJson, takenAt: row.takenAt.getTime() };
  }
  async writeSnapshot(w: WorldId, json: string, takenAt: number) {
    await this.db
      .insert(schema.worldSnapshots)
      .values({ worldId: w, snapshotJson: json, takenAt: new Date(takenAt) })
      .onConflictDoUpdate({
        target: schema.worldSnapshots.worldId,
        set: { snapshotJson: json, takenAt: new Date(takenAt) },
      });
  }

  async transaction<T>(fn: (tx: BuilderRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(async (txDb) =>
      fn(new SqliteBuilderRepository(txDb as unknown as DB)),
    );
  }
}

const toSummary = (r: typeof schema.worlds.$inferSelect): WorldSummary => ({
  id: r.id as WorldId,
  kind: r.kind as WorldKind,
  label: r.label,
  displayName: r.displayName || r.label,
  parentDraftId: (r.parentDraftId as WorldId | null) ?? null,
  playerAgentId: (r.playerAgentId as AgentId | null) ?? null,
});

const toLocation = (r: typeof schema.locations.$inferSelect, w: WorldId): Location => ({
  id: asLocationId(r.id),
  worldId: w,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
});

const toExit = (r: typeof schema.exits.$inferSelect, w: WorldId): Exit => ({
  id: asExitId(r.id),
  worldId: w,
  from: asLocationId(r.fromLocationId),
  to: asLocationId(r.toLocationId),
  direction: r.direction as Direction,
  label: r.label,
  locked: r.locked,
  lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});

const toItem = (r: typeof schema.items.$inferSelect, w: WorldId): Item => ({
  id: asItemId(r.id),
  worldId: w,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  owner:
    r.ownerKind === OwnerKind.Location
      ? { kind: OwnerKind.Location, id: asLocationId(r.ownerId) }
      : r.ownerKind === OwnerKind.Agent
        ? { kind: OwnerKind.Agent, id: asAgentId(r.ownerId) }
        : { kind: OwnerKind.Item, id: asItemId(r.ownerId) },
  weight: r.weight,
  hidden: r.hidden,
});

const toAgent = (r: typeof schema.agents.$inferSelect, w: WorldId): Agent => ({
  id: asAgentId(r.id),
  worldId: w,
  label: r.label,
  shortDescription: r.shortDescription,
  longDescription: r.longDescription,
  locationId: asLocationId(r.locationId),
  hp: r.hp,
  damage: r.damage,
  defense: r.defense,
  capacity: r.capacity,
  mood: r.mood,
  shortTermIntent: r.shortTermIntent,
  goal: r.goal,
  autonomous: r.autonomous,
  awake: r.awake,
});

// `WorldKindConst` is exported so callers using the const path keep working.
export { WorldKindConst };
```

- [ ] **Step 2: Write integration test**

```ts
// tests/integration/builder-sqlite.test.ts
import {
  cloneLiveAsDraft,
  createDraft,
  publish,
  upsertAgent,
  upsertLocation,
} from '@core/builder/index';
import { asAgentId, asLocationId } from '@core/domain/ids';
import { type DbHandle, openDb } from '@infra/db';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;
let repo: SqliteBuilderRepository;

beforeEach(() => {
  handle = openDb(':memory:');
  repo = new SqliteBuilderRepository(handle.db);
});
afterEach(() => handle.close());

describe('SqliteBuilderRepository (via builder facade)', () => {
  it('round-trips a draft → publish → clone cycle', async () => {
    const created = await createDraft(repo, { displayName: 'D', label: 'L' });
    if (!created.ok) throw new Error();
    const W = created.value;
    await upsertLocation(repo, W, {
      id: asLocationId('loc_a'),
      label: 'A',
      shortDescription: '',
      longDescription: '',
    });
    await upsertAgent(repo, W, {
      id: asAgentId('char_p'),
      label: 'P',
      shortDescription: '',
      longDescription: '',
      locationId: asLocationId('loc_a'),
      hp: 10,
      damage: 0,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
    });
    await repo.updateWorldSummary(W, { playerAgentId: asAgentId('char_p') });
    const pub = await publish(repo, W);
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      const cloned = await cloneLiveAsDraft(repo, pub.value.liveWorldId);
      expect(cloned.ok).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test tests/integration/builder-sqlite.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, full test run, commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

```bash
git add src/infra/builder-sqlite-repository.ts tests/integration/builder-sqlite.test.ts
git commit -m "builder: SQLite repository + integration smoke"
```

---

## Task 10: Server functions for the admin UI

**Files:**
- Create: `app/server/admin/repo.ts`
- Create: `app/server/admin/worlds.ts`
- Create: `app/server/admin/entities.ts`
- Create: `app/server/admin/validate.ts`
- Create: `app/server/admin/publish.ts`

- [ ] **Step 1: Composition root**

```ts
// app/server/admin/repo.ts
import 'dotenv/config';
import { type DbHandle, openDb } from '@infra/db';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';
let handle: DbHandle | null = null;

export function getBuilderRepo(): SqliteBuilderRepository {
  if (!handle) handle = openDb(DB_PATH);
  return new SqliteBuilderRepository(handle.db);
}
```

- [ ] **Step 2: Worlds server functions**

```ts
// app/server/admin/worlds.ts
import {
  cloneLiveAsDraft as cloneLiveAsDraftCore,
  createDraft as createDraftCore,
  getWorldTree,
  listWorlds as listWorldsCore,
} from '@core/builder/index';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const listWorlds = createServerFn({ method: 'GET' }).handler(async () => {
  return listWorldsCore(getBuilderRepo());
});

export const createDraft = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { displayName?: unknown }).displayName !== 'string' ||
      typeof (d as { label?: unknown }).label !== 'string'
    ) {
      throw new Error('Expected { displayName: string, label: string }');
    }
    return d as { displayName: string; label: string };
  })
  .handler(async ({ data }) => createDraftCore(getBuilderRepo(), data));

export const cloneLive = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => cloneLiveAsDraftCore(getBuilderRepo(), asWorldId(data.id)));

export const getWorld = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => getWorldTree(getBuilderRepo(), asWorldId(data.id)));
```

- [ ] **Step 3: Entities, validate, publish server functions**

```ts
// app/server/admin/entities.ts
import {
  deleteAgent as deleteAgentCore,
  deleteExit as deleteExitCore,
  deleteItem as deleteItemCore,
  deleteLocation as deleteLocationCore,
  upsertAgent as upsertAgentCore,
  upsertExit as upsertExitCore,
  upsertItem as upsertItemCore,
  upsertLocation as upsertLocationCore,
} from '@core/builder/index';
import { EntityKind } from '@core/domain/builder-kinds';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asWorldId,
} from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

interface SaveInput {
  worldId: string;
  entity: typeof EntityKind[keyof typeof EntityKind];
  payload: unknown;
}

export const saveEntity = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string' ||
      typeof (d as { entity?: unknown }).entity !== 'string'
    ) {
      throw new Error('Expected { worldId, entity, payload }');
    }
    return d as SaveInput;
  })
  .handler(async ({ data }) => {
    const repo = getBuilderRepo();
    const W = asWorldId(data.worldId);
    const p = data.payload as Record<string, unknown>;
    if (data.entity === EntityKind.Location) {
      return upsertLocationCore(repo, W, {
        id: asLocationId(p.id as string),
        label: p.label as string,
        shortDescription: p.shortDescription as string,
        longDescription: p.longDescription as string,
      });
    }
    if (data.entity === EntityKind.Exit) {
      return upsertExitCore(repo, W, {
        id: asExitId(p.id as string),
        from: asLocationId(p.from as string),
        to: asLocationId(p.to as string),
        direction: p.direction as string,
        label: p.label as string,
        locked: Boolean(p.locked),
        lockedByItem:
          typeof p.lockedByItem === 'string' && p.lockedByItem.length > 0
            ? asItemId(p.lockedByItem)
            : null,
      });
    }
    if (data.entity === EntityKind.Item) {
      return upsertItemCore(repo, W, {
        id: asItemId(p.id as string),
        label: p.label as string,
        shortDescription: p.shortDescription as string,
        longDescription: p.longDescription as string,
        ownerKind: p.ownerKind as 'location' | 'agent' | 'item',
        ownerId: p.ownerId as string,
        weight: p.weight as number,
        hidden: Boolean(p.hidden),
      });
    }
    return upsertAgentCore(repo, W, {
      id: asAgentId(p.id as string),
      label: p.label as string,
      shortDescription: p.shortDescription as string,
      longDescription: p.longDescription as string,
      locationId: asLocationId(p.locationId as string),
      hp: p.hp as number,
      damage: p.damage as number,
      defense: p.defense as number,
      capacity: p.capacity as number,
      mood: (p.mood as string | null) ?? null,
      goal: (p.goal as string | null) ?? null,
      autonomous: Boolean(p.autonomous),
    });
  });

interface DeleteInput {
  worldId: string;
  entity: typeof EntityKind[keyof typeof EntityKind];
  id: string;
}

export const deleteEntity = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (
      typeof d !== 'object' ||
      d === null ||
      typeof (d as { worldId?: unknown }).worldId !== 'string' ||
      typeof (d as { entity?: unknown }).entity !== 'string' ||
      typeof (d as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Expected { worldId, entity, id }');
    }
    return d as DeleteInput;
  })
  .handler(async ({ data }) => {
    const repo = getBuilderRepo();
    const W = asWorldId(data.worldId);
    if (data.entity === EntityKind.Location)
      return deleteLocationCore(repo, W, asLocationId(data.id));
    if (data.entity === EntityKind.Exit) return deleteExitCore(repo, W, asExitId(data.id));
    if (data.entity === EntityKind.Item) return deleteItemCore(repo, W, asItemId(data.id));
    return deleteAgentCore(repo, W, asAgentId(data.id));
  });
```

```ts
// app/server/admin/validate.ts
import { getWorldTree } from '@core/builder/index';
import { validateWorld as validateCore } from '@core/builder/validate';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const validate = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
      throw new Error('Expected { id: string }');
    }
    return d as { id: string };
  })
  .handler(async ({ data }) => {
    const tree = await getWorldTree(getBuilderRepo(), asWorldId(data.id));
    if (!tree.ok) return { ok: false as const, error: tree.error };
    return { ok: true as const, value: validateCore(tree.value) };
  });
```

```ts
// app/server/admin/publish.ts
import { publish as publishCore, resetLiveToDraft as resetCore } from '@core/builder/index';
import { asWorldId } from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

const idInput = (d: unknown) => {
  if (typeof d !== 'object' || d === null || typeof (d as { id?: unknown }).id !== 'string') {
    throw new Error('Expected { id: string }');
  }
  return d as { id: string };
};

export const publish = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(async ({ data }) => publishCore(getBuilderRepo(), asWorldId(data.id)));

export const resetLive = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(async ({ data }) => resetCore(getBuilderRepo(), asWorldId(data.id)));
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add app/server/admin/
git commit -m "builder: TanStack server functions for admin UI"
```

---

## Task 11: HTTP API routes

**Files:**
- Create: `app/routes/api/admin/worlds.ts`
- Create: `app/routes/api/admin/worlds.$worldId.ts`
- Create: `app/routes/api/admin/worlds.$worldId.entities.ts`
- Create: `tests/integration/admin-http.test.ts`

> **Note on the routing API:** TanStack Start exposes API routes via `createAPIFileRoute`. The exact import path is `@tanstack/react-start/api` in the project's pinned version. If the import fails, check `node_modules/@tanstack/react-start/dist/esm/api*` for the actual export, and prefer the path that matches what the existing `createServerFn` import resolves from.

- [ ] **Step 1: Worlds collection route**

```ts
// app/routes/api/admin/worlds.ts
import { getBuilderRepo } from '@/server/admin/repo';
import { createDraft, listWorlds } from '@core/builder/index';
import { json } from '@tanstack/react-start';
import { createAPIFileRoute } from '@tanstack/react-start/api';

export const APIRoute = createAPIFileRoute('/api/admin/worlds')({
  GET: async () => {
    const worlds = await listWorlds(getBuilderRepo());
    return json({ worlds });
  },
  POST: async ({ request }) => {
    const body = (await request.json()) as { displayName?: unknown; label?: unknown };
    if (typeof body.displayName !== 'string' || typeof body.label !== 'string') {
      return json({ ok: false, error: 'expected { displayName, label }' }, { status: 400 });
    }
    const r = await createDraft(getBuilderRepo(), {
      displayName: body.displayName,
      label: body.label,
    });
    if (!r.ok) return json(r, { status: 400 });
    return json(r, { status: 201 });
  },
});
```

> **Note on path alias:** if `@/server/admin/repo` doesn't resolve, use a relative path (`../../../../app/server/admin/repo`) — the alias mapping is in `tsconfig.json`. Confirm by reading `tsconfig.json` for the `paths` block.

- [ ] **Step 2: Per-world routes**

```ts
// app/routes/api/admin/worlds.$worldId.ts
import { getBuilderRepo } from '@/server/admin/repo';
import {
  cloneLiveAsDraft,
  getWorldTree,
  publish,
  resetLiveToDraft,
} from '@core/builder/index';
import { validateWorld } from '@core/builder/validate';
import { asWorldId } from '@core/domain/ids';
import { json } from '@tanstack/react-start';
import { createAPIFileRoute } from '@tanstack/react-start/api';

export const APIRoute = createAPIFileRoute('/api/admin/worlds/$worldId')({
  GET: async ({ params }) => {
    const tree = await getWorldTree(getBuilderRepo(), asWorldId(params.worldId));
    if (!tree.ok) return json(tree, { status: 404 });
    return json(tree);
  },
  POST: async ({ params, request }) => {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const W = asWorldId(params.worldId);
    const repo = getBuilderRepo();
    if (action === 'clone') return json(await cloneLiveAsDraft(repo, W));
    if (action === 'publish') {
      const r = await publish(repo, W);
      return json(r, { status: r.ok ? 200 : 400 });
    }
    if (action === 'reset-live') {
      const r = await resetLiveToDraft(repo, W);
      return json(r, { status: r.ok ? 200 : 400 });
    }
    if (action === 'validate') {
      const tree = await getWorldTree(repo, W);
      if (!tree.ok) return json(tree, { status: 404 });
      return json({ ok: true, problems: validateWorld(tree.value) });
    }
    return json({ ok: false, error: 'unknown action' }, { status: 400 });
  },
});
```

- [ ] **Step 3: Entity sub-routes**

```ts
// app/routes/api/admin/worlds.$worldId.entities.ts
import { getBuilderRepo } from '@/server/admin/repo';
import {
  deleteAgent,
  deleteExit,
  deleteItem,
  deleteLocation,
  upsertAgent,
  upsertExit,
  upsertItem,
  upsertLocation,
} from '@core/builder/index';
import { EntityKind } from '@core/domain/builder-kinds';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asWorldId,
} from '@core/domain/ids';
import { json } from '@tanstack/react-start';
import { createAPIFileRoute } from '@tanstack/react-start/api';

export const APIRoute = createAPIFileRoute('/api/admin/worlds/$worldId/entities')({
  PUT: async ({ params, request }) => {
    const body = (await request.json()) as { entity?: string; payload?: Record<string, unknown> };
    if (!body.entity || !body.payload) {
      return json({ ok: false, error: 'expected { entity, payload }' }, { status: 400 });
    }
    const repo = getBuilderRepo();
    const W = asWorldId(params.worldId);
    const p = body.payload;
    if (body.entity === EntityKind.Location) {
      return json(
        await upsertLocation(repo, W, {
          id: asLocationId(p.id as string),
          label: p.label as string,
          shortDescription: p.shortDescription as string,
          longDescription: p.longDescription as string,
        }),
      );
    }
    if (body.entity === EntityKind.Exit) {
      return json(
        await upsertExit(repo, W, {
          id: asExitId(p.id as string),
          from: asLocationId(p.from as string),
          to: asLocationId(p.to as string),
          direction: p.direction as string,
          label: p.label as string,
          locked: Boolean(p.locked),
          lockedByItem:
            typeof p.lockedByItem === 'string' && p.lockedByItem.length > 0
              ? asItemId(p.lockedByItem)
              : null,
        }),
      );
    }
    if (body.entity === EntityKind.Item) {
      return json(
        await upsertItem(repo, W, {
          id: asItemId(p.id as string),
          label: p.label as string,
          shortDescription: p.shortDescription as string,
          longDescription: p.longDescription as string,
          ownerKind: p.ownerKind as 'location' | 'agent' | 'item',
          ownerId: p.ownerId as string,
          weight: p.weight as number,
          hidden: Boolean(p.hidden),
        }),
      );
    }
    return json(
      await upsertAgent(repo, W, {
        id: asAgentId(p.id as string),
        label: p.label as string,
        shortDescription: p.shortDescription as string,
        longDescription: p.longDescription as string,
        locationId: asLocationId(p.locationId as string),
        hp: p.hp as number,
        damage: p.damage as number,
        defense: p.defense as number,
        capacity: p.capacity as number,
        mood: (p.mood as string | null) ?? null,
        goal: (p.goal as string | null) ?? null,
        autonomous: Boolean(p.autonomous),
      }),
    );
  },
  DELETE: async ({ params, request }) => {
    const body = (await request.json()) as { entity?: string; id?: string };
    if (!body.entity || !body.id) {
      return json({ ok: false, error: 'expected { entity, id }' }, { status: 400 });
    }
    const repo = getBuilderRepo();
    const W = asWorldId(params.worldId);
    if (body.entity === EntityKind.Location)
      return json(await deleteLocation(repo, W, asLocationId(body.id)));
    if (body.entity === EntityKind.Exit)
      return json(await deleteExit(repo, W, asExitId(body.id)));
    if (body.entity === EntityKind.Item)
      return json(await deleteItem(repo, W, asItemId(body.id)));
    return json(await deleteAgent(repo, W, asAgentId(body.id)));
  },
});
```

- [ ] **Step 4: Integration test for the HTTP routes**

The existing test setup uses an in-memory DB by setting `DB_PATH=:memory:` and importing the repo function. The test below exercises the route handlers directly (not via fetch) — this matches the project's existing convention of testing core through the data access path rather than booting the HTTP server.

```ts
// tests/integration/admin-http.test.ts
import { APIRoute as worldsRoute } from '@/routes/api/admin/worlds';
import { APIRoute as worldByIdRoute } from '@/routes/api/admin/worlds.$worldId';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
});
afterEach(() => {
  delete process.env.DB_PATH;
});

describe('admin HTTP API', () => {
  it('lists worlds (empty initially)', async () => {
    const res = await worldsRoute.methods.GET!({ request: new Request('http://x/'), params: {} } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.worlds)).toBe(true);
  });

  it('creates a draft via POST', async () => {
    const req = new Request('http://x/', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'D', label: 'L' }),
    });
    const res = await worldsRoute.methods.POST!({ request: req, params: {} } as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('rejects malformed POST body', async () => {
    const req = new Request('http://x/', { method: 'POST', body: '{}' });
    const res = await worldsRoute.methods.POST!({ request: req, params: {} } as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown world id', async () => {
    const res = await worldByIdRoute.methods.GET!({
      request: new Request('http://x/'),
      params: { worldId: 'w_nope' },
    } as never);
    expect(res.status).toBe(404);
  });
});
```

> **Note:** if `APIRoute.methods.GET` is not the right way to invoke handlers in this version of TanStack Start, check `node_modules/@tanstack/react-start/dist/esm/api*` for the actual handler-invocation shape and adjust. Falling back to fetch against a booted server is acceptable but slower.

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/integration/admin-http.test.ts`
Expected: PASS. If TanStack's API surface differs in this pinned version, adjust the test to match — but the route files themselves should still typecheck without changes.

- [ ] **Step 6: Typecheck, lint, full test, commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add app/routes/api tests/integration/admin-http.test.ts
git commit -m "builder: HTTP API routes mirroring the builder facade"
```

---

## Task 12: Admin UI — list view

**Files:**
- Create: `app/routes/admin/index.tsx`

- [ ] **Step 1: Implement the list page**

```tsx
// app/routes/admin/index.tsx
import { cloneLive, createDraft, listWorlds } from '@/server/admin/worlds';
import { WorldKind } from '@core/domain/builder-kinds';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
  loader: async () => ({ worlds: await listWorlds() }),
});

function AdminIndex() {
  const { worlds } = Route.useLoaderData();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [label, setLabel] = useState('');

  const onCreate = async () => {
    if (!displayName || !label) return;
    await createDraft({ data: { displayName, label } });
    router.invalidate();
    setDisplayName('');
    setLabel('');
  };

  const drafts = worlds.filter((w) => w.kind === WorldKind.Draft);
  const liveWorlds = worlds.filter((w) => w.kind === WorldKind.Live);

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Campaign Builder</h1>
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Drafts</h2>
        {drafts.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No drafts yet.</p>
        ) : (
          <ul>
            {drafts.map((w) => (
              <li key={w.id as string}>
                <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                  {w.displayName || w.label} ({w.id as string})
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            style={{ background: '#111', color: '#cfcfcf', border: '1px solid #333', padding: 4 }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="World label"
            style={{ background: '#111', color: '#cfcfcf', border: '1px solid #333', padding: 4 }}
          />
          <button type="button" onClick={onCreate}>
            New draft
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Live worlds</h2>
        {liveWorlds.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No live worlds.</p>
        ) : (
          <ul>
            {liveWorlds.map((w) => (
              <li key={w.id as string} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                  {w.displayName || w.label} ({w.id as string})
                </Link>
                {w.parentDraftId === null && (
                  <button
                    type="button"
                    onClick={async () => {
                      await cloneLive({ data: { id: w.id as string } });
                      router.invalidate();
                    }}
                  >
                    Clone as draft
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Boot the dev server and visit `/admin`**

Run: `pnpm dev`
Open: `http://localhost:5173/admin`
Expected: page renders, listing the existing burning-district world under "Live worlds" with a "Clone as draft" button. Stop the server (`Ctrl+C`).

- [ ] **Step 3: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add app/routes/admin/index.tsx
git commit -m "builder: admin list view"
```

---

## Task 13: Admin UI — tree + form editor

**Files:**
- Create: `app/routes/admin/$worldId.tsx`

- [ ] **Step 1: Implement the editor**

```tsx
// app/routes/admin/$worldId.tsx
import { deleteEntity, saveEntity } from '@/server/admin/entities';
import { publish, resetLive } from '@/server/admin/publish';
import { validate } from '@/server/admin/validate';
import { getWorld } from '@/server/admin/worlds';
import { EntityKind } from '@core/domain/builder-kinds';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

type Selected =
  | { kind: 'world' }
  | { kind: typeof EntityKind[keyof typeof EntityKind]; id: string };

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const router = useRouter();
  const [sel, setSel] = useState<Selected>({ kind: 'world' });

  if (!tree.ok) {
    return <div style={{ padding: 24 }}>World not found.</div>;
  }
  const t = tree.value;
  const problemsByEntity = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) {
      const k = `${p.entity}:${p.entityId}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [problems]);

  const dot = (entity: string, id: string) =>
    problemsByEntity.has(`${entity}:${id}`) ? (
      <span style={{ color: '#e57373', marginLeft: 6 }}>●</span>
    ) : null;

  const refresh = () => router.invalidate();

  const onPublish = async () => {
    const r = await publish({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Publish failed: ${r.error.message}`);
    else alert(`Published. Skipped: ${r.value.skipped.length}`);
  };
  const onReset = async () => {
    if (!confirm('Reset live world to this draft? This will replace structural rows on the live world.'))
      return;
    const r = await resetLive({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Reset failed: ${r.error.message}`);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid #222', padding: 16, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>
          {t.summary.displayName || t.summary.label}{' '}
          <small style={{ opacity: 0.6 }}>({t.summary.kind})</small>
        </h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {t.summary.kind === 'draft' && (
            <>
              <button type="button" onClick={onPublish}>
                Publish
              </button>
              <button type="button" onClick={onReset}>
                Reset live
              </button>
            </>
          )}
        </div>
        <button type="button" onClick={() => setSel({ kind: 'world' })}>
          World settings
        </button>

        <h3 style={{ fontSize: 12, marginTop: 16 }}>Locations</h3>
        <ul>
          {t.locations.map((l) => (
            <li key={l.id as string}>
              <button
                type="button"
                onClick={() => setSel({ kind: EntityKind.Location, id: l.id as string })}
              >
                {l.label}
              </button>
              {dot(EntityKind.Location, l.id as string)}
            </li>
          ))}
        </ul>

        <h3 style={{ fontSize: 12, marginTop: 16 }}>Agents</h3>
        <ul>
          {t.agents.map((a) => (
            <li key={a.id as string}>
              <button
                type="button"
                onClick={() => setSel({ kind: EntityKind.Agent, id: a.id as string })}
              >
                {a.label}
              </button>
              {dot(EntityKind.Agent, a.id as string)}
            </li>
          ))}
        </ul>

        <h3 style={{ fontSize: 12, marginTop: 16 }}>Items</h3>
        <ul>
          {t.items.map((i) => (
            <li key={i.id as string}>
              <button
                type="button"
                onClick={() => setSel({ kind: EntityKind.Item, id: i.id as string })}
              >
                {i.label}
              </button>
              {dot(EntityKind.Item, i.id as string)}
            </li>
          ))}
        </ul>

        <h3 style={{ fontSize: 12, marginTop: 16 }}>Exits</h3>
        <ul>
          {t.exits.map((e) => (
            <li key={e.id as string}>
              <button
                type="button"
                onClick={() => setSel({ kind: EntityKind.Exit, id: e.id as string })}
              >
                {e.from} → {e.to} ({e.direction})
              </button>
              {dot(EntityKind.Exit, e.id as string)}
            </li>
          ))}
        </ul>
      </aside>

      <main style={{ padding: 24, overflowY: 'auto' }}>
        <FormPanel
          tree={t}
          sel={sel}
          onSaved={refresh}
          onDeleted={() => {
            setSel({ kind: 'world' });
            refresh();
          }}
        />
        <h3 style={{ marginTop: 32, fontSize: 12 }}>Problems ({problems.length})</h3>
        <ul>
          {problems.map((p) => (
            <li key={`${p.entity}:${p.entityId}:${p.kind}`}>{p.message}</li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function FormPanel(props: {
  tree: ReturnType<typeof Route.useLoaderData>['tree'] extends { ok: true; value: infer V }
    ? V
    : never;
  sel: Selected;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  if (sel.kind === 'world') {
    return <p>Select an entity from the tree.</p>;
  }
  if (sel.kind === EntityKind.Location) {
    const loc = tree.locations.find((l) => (l.id as string) === sel.id);
    if (!loc) return <p>Not found.</p>;
    return (
      <SimpleForm
        title={`Location: ${loc.label}`}
        initial={{
          id: loc.id as string,
          label: loc.label,
          shortDescription: loc.shortDescription,
          longDescription: loc.longDescription,
        }}
        fields={[
          { key: 'id', label: 'ID', readOnly: true },
          { key: 'label', label: 'Label' },
          { key: 'shortDescription', label: 'Short description' },
          { key: 'longDescription', label: 'Long description', long: true },
        ]}
        onSave={async (v) => {
          await saveEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Location,
              payload: v,
            },
          });
          onSaved();
        }}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Location,
              id: loc.id as string,
            },
          });
          onDeleted();
        }}
      />
    );
  }
  // Agent / Item / Exit follow the same shape; abbreviated to JSON edit for v1.
  return <RawJsonForm tree={tree} sel={sel} onSaved={onSaved} onDeleted={onDeleted} />;
}

interface FieldDef {
  key: string;
  label: string;
  readOnly?: boolean;
  long?: boolean;
}
function SimpleForm(props: {
  title: string;
  initial: Record<string, string>;
  fields: readonly FieldDef[];
  onSave: (v: Record<string, string>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { title, initial, fields, onSave, onDelete } = props;
  const [v, setV] = useState(initial);
  return (
    <div>
      <h2 style={{ fontSize: 14, marginBottom: 12 }}>{title}</h2>
      {fields.map((f) =>
        f.long ? (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11 }}>{f.label}</label>
            <textarea
              value={v[f.key] ?? ''}
              readOnly={f.readOnly}
              rows={4}
              onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              style={{ width: '100%', background: '#111', color: '#cfcfcf', border: '1px solid #333' }}
            />
          </div>
        ) : (
          <div key={f.key} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11 }}>{f.label}</label>
            <input
              value={v[f.key] ?? ''}
              readOnly={f.readOnly}
              onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              style={{ width: '100%', background: '#111', color: '#cfcfcf', border: '1px solid #333', padding: 4 }}
            />
          </div>
        ),
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onSave(v)}>
          Save
        </button>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function RawJsonForm(props: {
  tree: Parameters<typeof FormPanel>[0]['tree'];
  sel: Exclude<Selected, { kind: 'world' }>;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  const find = () => {
    if (sel.kind === EntityKind.Agent) return tree.agents.find((a) => (a.id as string) === sel.id);
    if (sel.kind === EntityKind.Item) return tree.items.find((i) => (i.id as string) === sel.id);
    return tree.exits.find((e) => (e.id as string) === sel.id);
  };
  const initial = find();
  const [json, setJson] = useState(JSON.stringify(initial ?? {}, null, 2));
  if (!initial) return <p>Not found.</p>;
  return (
    <div>
      <h2 style={{ fontSize: 14, marginBottom: 12 }}>{sel.kind}: {sel.id}</h2>
      <p style={{ opacity: 0.6, fontSize: 11 }}>
        v1 fallback editor — edit fields as JSON, then Save.
      </p>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={20}
        style={{ width: '100%', background: '#111', color: '#cfcfcf', border: '1px solid #333' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={async () => {
            const parsed = JSON.parse(json);
            // Items use `owner: { kind, id }` in the entity; the upsert input takes
            // `ownerKind` + `ownerId`. Translate here.
            const payload =
              sel.kind === EntityKind.Item
                ? {
                    ...parsed,
                    ownerKind: parsed.owner?.kind,
                    ownerId: parsed.owner?.id,
                  }
                : parsed;
            await saveEntity({
              data: { worldId: tree.summary.id as string, entity: sel.kind, payload },
            });
            onSaved();
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={async () => {
            await deleteEntity({
              data: { worldId: tree.summary.id as string, entity: sel.kind, id: sel.id },
            });
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

Run: `pnpm dev`
Open: `http://localhost:5173/admin`. Click "Clone as draft" on the burning-district live world. Open the new draft. Click a location, change its label, save. Click Publish — verify a "skipped" count appears.

Stop the server.

- [ ] **Step 3: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add app/routes/admin/\$worldId.tsx
git commit -m "builder: admin tree + form editor"
```

---

## Task 14: MCP server

**Files:**
- Modify: `package.json` (dependency + script)
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/server.ts`
- Create: `src/mcp/server.test.ts`

- [ ] **Step 1: Install the MCP SDK**

Run: `pnpm add @modelcontextprotocol/sdk`
Expected: dependency added to `package.json`. The SDK ships its own types.

- [ ] **Step 2: Add `mcp` script**

In `package.json` `scripts`:

```
"mcp": "tsx src/mcp/server.ts"
```

- [ ] **Step 3: Define the tools**

```ts
// src/mcp/tools.ts
import {
  cloneLiveAsDraft,
  createDraft,
  deleteAgent,
  deleteExit,
  deleteItem,
  deleteLocation,
  getWorldTree,
  listWorlds,
  publish,
  upsertAgent,
  upsertExit,
  upsertItem,
  upsertLocation,
} from '@core/builder/index';
import { validateWorld } from '@core/builder/validate';
import { EntityKind } from '@core/domain/builder-kinds';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
  asWorldId,
} from '@core/domain/ids';
import type { BuilderRepository } from '@core/builder/repository';

/**
 * The MCP tool surface. Each entry is a thin wrapper around a builder facade
 * function. The server (server.ts) registers these against an `McpServer`.
 *
 * Tool input schemas are JSON Schema; outputs are the `Result<T, BuilderError>`
 * shape verbatim, so a calling AI can act on `ok: false` directly.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (repo: BuilderRepository, args: Record<string, unknown>) => Promise<unknown>;
}

const stringField = (description: string) => ({ type: 'string', description });

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'list_worlds',
    description: 'List all draft and live worlds.',
    inputSchema: { type: 'object', properties: {} },
    run: (repo) => listWorlds(repo),
  },
  {
    name: 'get_world',
    description: 'Return the full tree (locations, exits, items, agents) for a world.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: (repo, a) => getWorldTree(repo, asWorldId(a.worldId as string)),
  },
  {
    name: 'create_draft',
    description: 'Create an empty draft world.',
    inputSchema: {
      type: 'object',
      properties: {
        displayName: stringField('display name'),
        label: stringField('short label'),
      },
      required: ['displayName', 'label'],
    },
    run: (repo, a) =>
      createDraft(repo, {
        displayName: a.displayName as string,
        label: a.label as string,
      }),
  },
  {
    name: 'clone_live_as_draft',
    description: 'Clone an existing live world into a new editable draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('live world id') },
      required: ['worldId'],
    },
    run: (repo, a) => cloneLiveAsDraft(repo, asWorldId(a.worldId as string)),
  },
  {
    name: 'validate_world',
    description: 'Return structural problems for a world. Empty array means clean.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: async (repo, a) => {
      const tree = await getWorldTree(repo, asWorldId(a.worldId as string));
      if (!tree.ok) return tree;
      return { ok: true, problems: validateWorld(tree.value) };
    },
  },
  {
    name: 'publish_world',
    description:
      'Publish a draft to its live world. Validates first; structural three-way merge with skipped-change report.',
    inputSchema: {
      type: 'object',
      properties: { draftId: stringField('draft world id') },
      required: ['draftId'],
    },
    run: (repo, a) => publish(repo, asWorldId(a.draftId as string)),
  },
  // NOTE: reset_live_to_draft is intentionally NOT exposed via MCP — it wipes
  // gameplay state. It remains available in the UI (with a confirmation
  // modal) and the HTTP API.
  {
    name: 'upsert_location',
    description: 'Create or update a location.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('location id'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
      },
      required: ['worldId', 'id', 'label', 'shortDescription', 'longDescription'],
    },
    run: (repo, a) =>
      upsertLocation(repo, asWorldId(a.worldId as string), {
        id: asLocationId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
      }),
  },
  {
    name: 'upsert_exit',
    description: 'Create or update an exit between two locations.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('exit id'),
        from: stringField('source location id'),
        to: stringField('destination location id'),
        direction: stringField('direction (north/south/...)'),
        label: stringField('label'),
        locked: { type: 'boolean' },
        lockedByItem: { type: ['string', 'null'] },
      },
      required: ['worldId', 'id', 'from', 'to', 'direction', 'label', 'locked'],
    },
    run: (repo, a) =>
      upsertExit(repo, asWorldId(a.worldId as string), {
        id: asExitId(a.id as string),
        from: asLocationId(a.from as string),
        to: asLocationId(a.to as string),
        direction: a.direction as string,
        label: a.label as string,
        locked: Boolean(a.locked),
        lockedByItem:
          typeof a.lockedByItem === 'string' && a.lockedByItem.length > 0
            ? asItemId(a.lockedByItem)
            : null,
      }),
  },
  {
    name: 'upsert_item',
    description: 'Create or update an item.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('item id'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        ownerKind: { type: 'string', enum: ['location', 'agent', 'item'] },
        ownerId: stringField('owner id'),
        weight: { type: 'number' },
        hidden: { type: 'boolean' },
      },
      required: [
        'worldId',
        'id',
        'label',
        'shortDescription',
        'longDescription',
        'ownerKind',
        'ownerId',
        'weight',
        'hidden',
      ],
    },
    run: (repo, a) =>
      upsertItem(repo, asWorldId(a.worldId as string), {
        id: asItemId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        ownerKind: a.ownerKind as 'location' | 'agent' | 'item',
        ownerId: a.ownerId as string,
        weight: Number(a.weight),
        hidden: Boolean(a.hidden),
      }),
  },
  {
    name: 'upsert_agent',
    description: 'Create or update an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('agent id'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        locationId: stringField('starting location'),
        hp: { type: 'number' },
        damage: { type: 'number' },
        defense: { type: 'number' },
        capacity: { type: 'number' },
        mood: { type: ['string', 'null'] },
        goal: { type: ['string', 'null'] },
        autonomous: { type: 'boolean' },
      },
      required: [
        'worldId',
        'id',
        'label',
        'shortDescription',
        'longDescription',
        'locationId',
        'hp',
        'damage',
        'defense',
        'capacity',
        'autonomous',
      ],
    },
    run: (repo, a) =>
      upsertAgent(repo, asWorldId(a.worldId as string), {
        id: asAgentId(a.id as string),
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        locationId: asLocationId(a.locationId as string),
        hp: Number(a.hp),
        damage: Number(a.damage),
        defense: Number(a.defense),
        capacity: Number(a.capacity),
        mood: (a.mood as string | null) ?? null,
        goal: (a.goal as string | null) ?? null,
        autonomous: Boolean(a.autonomous),
      }),
  },
  {
    name: 'delete_location',
    description: 'Delete a location.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('location id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteLocation(repo, asWorldId(a.worldId as string), asLocationId(a.id as string)),
  },
  {
    name: 'delete_exit',
    description: 'Delete an exit.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('exit id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteExit(repo, asWorldId(a.worldId as string), asExitId(a.id as string)),
  },
  {
    name: 'delete_item',
    description: 'Delete an item.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('item id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteItem(repo, asWorldId(a.worldId as string), asItemId(a.id as string)),
  },
  {
    name: 'delete_agent',
    description: 'Delete an agent.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('agent id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteAgent(repo, asWorldId(a.worldId as string), asAgentId(a.id as string)),
  },
];

// Used by the smoke test — registering via name.
export const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);
```

- [ ] **Step 4: Implement the server entry**

```ts
// src/mcp/server.ts
import 'dotenv/config';
import { openDb } from '@infra/db';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_BY_NAME, TOOLS } from './tools';

const DB_PATH = process.env.DB_PATH ?? './imagined-dungeons.db';

async function main() {
  const handle = openDb(DB_PATH);
  const repo = new SqliteBuilderRepository(handle.db);

  const server = new Server(
    { name: 'imagined-dungeons-builder', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOL_BY_NAME[req.params.name];
    if (!tool) {
      return { isError: true, content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }] };
    }
    const result = await tool.run(repo, (req.params.arguments ?? {}) as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: server entry
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Smoke test**

```ts
// src/mcp/server.test.ts
import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import { TOOL_BY_NAME } from './tools';

describe('MCP tool surface', () => {
  it('list_worlds returns []', async () => {
    const repo = new MemoryBuilderRepository();
    const r = await TOOL_BY_NAME.list_worlds!.run(repo, {});
    expect(r).toEqual([]);
  });

  it('create_draft + get_world round-trips through tools', async () => {
    const repo = new MemoryBuilderRepository();
    const created = (await TOOL_BY_NAME.create_draft!.run(repo, {
      displayName: 'X',
      label: 'L',
    })) as { ok: boolean; value?: string };
    expect(created.ok).toBe(true);
    const got = await TOOL_BY_NAME.get_world!.run(repo, { worldId: created.value });
    expect((got as { ok: boolean }).ok).toBe(true);
  });

  it('every TOOL_BY_NAME entry has a description and a runnable handler', () => {
    for (const t of Object.values(TOOL_BY_NAME)) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.run).toBe('function');
    }
  });
});
```

- [ ] **Step 6: Run smoke test**

Run: `pnpm test src/mcp/server.test.ts`
Expected: PASS.

- [ ] **Step 7: Sanity-check the server starts**

Run: `timeout 2 pnpm mcp || true` (the server stays running on stdio; we just want it not to crash on boot).
Expected: no errors logged in the first two seconds. Stop with `Ctrl+C`.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add package.json pnpm-lock.yaml src/mcp/
git commit -m "builder: MCP server exposing builder facade as tools"
```

---

## Task 15: Final pass — README, full test run

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Campaign Builder section to the README**

Append after the Stack section:

```markdown
## Campaign Builder

An admin-facing builder lives at `/admin`. Drafts and live worlds share the same tables; publish runs a three-way merge against a per-live-world snapshot so authored changes apply without clobbering gameplay drift.

The same operations are available three ways:

- **UI:** `/admin` (no auth in v1).
- **HTTP API:** `/api/admin/*` — same shape as the builder facade, JSON in/out.
- **MCP server:** `pnpm mcp` — stdio transport. Use this to drive the builder from an AI agent.

To bootstrap an editable draft of an existing live world (e.g. the seeded burning-district), open `/admin` and click "Clone as draft."

Migration: `pnpm migrate:worlds` backfills `displayName` and `playerAgentId` on rows that pre-date the builder.
```

- [ ] **Step 2: Full test, typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: campaign builder section in README"
```

---

## Self-review notes

- Spec coverage cross-check: schema migration (Task 2), draft/live discriminator and snapshot (Task 2 + 9), three-way merge with runtime exclusion (Task 6 + 8), validator with all listed problem codes (Task 5), publish + reset + clone (Task 8), no-auth UI (Task 12 + 13), HTTP API mirroring core (Task 11), MCP server as third sibling adapter (Task 14), tests at every layer (Tasks 5, 6, 7, 8, 9, 11, 14). All spec sections map to a task.
- Type consistency: `WorldKind` / `EntityKind` / `ProblemKind` / `BuilderErrorKind` defined once in Task 1 and used unchanged everywhere. `WorldTree`, `MergePlan`, `PublishResult`, `BuilderError` likewise. `BuilderRepository` defined in Task 3 and implemented in Tasks 4 + 9 with matching signatures. The facade in Tasks 7 + 8 returns the same `Result<_, BuilderError>` shape used by adapters in Tasks 10, 11, 14.
- Placeholder scan: every step shows the actual code or command. The "fallback JSON form" in Task 13 is a deliberate v1 simplification (called out in the spec as out-of-scope to fully form-driven everything for non-location entities), not a placeholder.
- Two known fragility points are flagged inline rather than papered over: TanStack Start's API-route handler invocation (Task 11) and the `@/...` path alias (also Task 11) — both have explicit fallback notes.
