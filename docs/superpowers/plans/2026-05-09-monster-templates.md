# Monster Templates and Spawning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author describe *kinds* of creatures once (a "goblin", a "guard") and have the engine spawn concrete instances into live worlds in response to authored triggers — first-entry populations and event/judgement-driven ambushes — without hand-placing every individual agent.

**Architecture:** A new `monster_templates` and `location_spawn_triggers` pair sit alongside the existing builder entities, edited via the campaign builder facade. A new pure module `src/core/spawning/` does expansion (`expandSpawn`) and trigger evaluation (mechanical + LLM-judgement passes). The engine's `tick.ts` invokes a single new pass after consequences, before narration. Initial publishes (and `resetLiveToDraft`) fire `fireOnInitialPublish` triggers; per-tick spawning is bounded by `MAX_SPAWNS_PER_TICK = 8` and `MAX_JUDGEMENT_CALLS_PER_TICK = 4`.

**Tech Stack:** TypeScript strict, Drizzle + better-sqlite3, vitest, biome. Reuses the existing `LanguageModel` port and the `FakeLanguageModel` test helper.

**Spec:** [docs/superpowers/specs/2026-05-09-monster-templates-design.md](../specs/2026-05-09-monster-templates-design.md)
**Companion spec (extended):** [docs/superpowers/specs/2026-05-08-campaign-builder-design.md](../specs/2026-05-08-campaign-builder-design.md)
**Style reference:** [docs/superpowers/plans/2026-05-08-campaign-builder.md](./2026-05-08-campaign-builder.md)

---

## File map

Created:

- `src/core/spawning/expand.ts` — pure `expandSpawn(template, locationId, count) → AgentInsert[]`.
- `src/core/spawning/expand.test.ts`
- `src/core/spawning/triggers.ts` — `matchMechanicalTriggers`, `matchJudgementTriggers`, dispatcher tables.
- `src/core/spawning/triggers.test.ts`
- `src/core/spawning/tick-pass.ts` — orchestrates mechanical + judgement passes, applies inserts, updates `triggerFireState`.
- `src/core/spawning/tick-pass.test.ts`
- `src/core/spawning/limits.ts` — `MAX_SPAWNS_PER_TICK`, `MAX_JUDGEMENT_CALLS_PER_TICK`.
- `src/core/spawning/limits.test.ts`
- `app/server/admin/templates.ts` — TanStack server fns for template + trigger CRUD.
- `drizzle/0007_monster_templates.sql` — migration.
- `tests/integration/builder-monster-templates.test.ts` — DB-backed publish + `resetLiveToDraft` integration.
- `tests/integration/spawning-tick.test.ts` — end-to-end tick test (one-shot `PlayerEnters` trigger).

Modified:

- `src/core/domain/builder-kinds.ts` — `EntityKind.MonsterTemplate`, `EntityKind.LocationSpawnTrigger`, `TriggerEventKind`, new `ProblemKind` codes.
- `src/core/domain/builder-types.ts` — `MonsterTemplate`, `LocationSpawnTrigger`, `TriggerParams`, `TriggerFireState`, `UpsertMonsterTemplateInput`, `UpsertLocationSpawnTriggerInput`, `StarterPackEntry`; extended `WorldTree`, `PublishResult`.
- `src/core/domain/ids.ts` — `MonsterTemplateId`, `SpawnTriggerId` brands and `as*Id` helpers.
- `src/core/domain/kinds.ts` — `EventKind.AgentSpawned`.
- `src/core/domain/events.ts` — new `agent_spawned` `DomainEvent` variant.
- `src/infra/schema.ts` — `monster_templates` and `location_spawn_triggers` tables (composite PK `(worldId, id)`).
- `src/core/builder/repository.ts` — port additions for templates + triggers.
- `src/infra/builder-memory-repository.ts` — implement port additions.
- `src/infra/builder-sqlite-repository.ts` — implement port additions.
- `src/core/builder/validate.ts` + `.test.ts` — new problem codes and rules.
- `src/core/builder/index.ts` + `.test.ts` — facade methods + extended publish/reset/clone/getWorldTree/copyTreeIntoWorld.
- `src/core/engine/tick.ts` — invoke spawn pass; wire `EventKind.AgentSpawned` into `renderWitnessForPlayer`.
- `src/core/engine/templates.ts` — `renderAgentSpawnedObserved`.
- `src/core/engine/consequences.ts` — extend `summarise` switch for `EventKind.AgentSpawned`.
- `src/core/engine/narrate.ts` — extend `summariseEvent` switch.
- `src/core/engine/npc-mind.ts` — extend `summariseEvent` switch.
- `src/mcp/tools.ts` — new tools (`upsert_monster_template`, `delete_monster_template`, `upsert_location_spawn_trigger`, `delete_location_spawn_trigger`, `list_monster_templates`, `list_location_spawn_triggers`).
- `app/routes/admin/$worldId.tsx` — Bestiary node + per-location triggers; JSON-fallback editors.

---

## Conventions enforced everywhere

- No raw string literals in logic. Discriminator and enum values come from `as const` objects in `src/core/domain/*-kinds.ts`. Type aliases use `(typeof X)[keyof typeof X]`.
- Branded ids (`MonsterTemplateId`, `SpawnTriggerId`, etc.) — never assign a raw `string` to one without going through `as*Id`.
- All builder facade methods return `Result<T, BuilderError>` — no thrown exceptions for expected failures.
- Per-world tables use composite primary key `(worldId, id)` (Task 9 from the campaign-builder plan).
- Templates and triggers on live worlds are publish-only writable; `requireDraft` gates the facade.
- Tests live next to source: `foo.ts` + `foo.test.ts`. Integration tests live under `tests/integration/`.
- TDD: every behavioural change writes the failing test first, sees it fail, then implements.
- Run after every code change: `pnpm typecheck && pnpm lint && pnpm test`.
- Frequent commits: every task ends in a commit.
- Drizzle migrations via `pnpm exec drizzle-kit generate`. PRAGMA `foreign_keys` is handled by `src/infra/db.ts` (commit `4b51624`).
- Biome: import order, no non-null assertions (destructure-with-guard), `useImportType` for type-only imports. `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on.

---

## Task 1: Domain kinds, brand ids, and types (spec §"Decisions" #1, #6; §"Schema changes")

**Files:**
- Modify: `src/core/domain/builder-kinds.ts`
- Modify: `src/core/domain/builder-types.ts`
- Modify: `src/core/domain/ids.ts`
- Modify: `src/core/domain/kinds.ts`
- Modify: `src/core/domain/events.ts`

- [ ] **Step 1: Brand new ids in `ids.ts`**

```ts
// append to src/core/domain/ids.ts
export type MonsterTemplateId = Branded<string, 'MonsterTemplateId'>;
export type SpawnTriggerId = Branded<string, 'SpawnTriggerId'>;

export const asMonsterTemplateId = (s: string): MonsterTemplateId => s as MonsterTemplateId;
export const asSpawnTriggerId = (s: string): SpawnTriggerId => s as SpawnTriggerId;
```

- [ ] **Step 2: Extend `kinds.ts` with `EventKind.AgentSpawned`**

```ts
// in src/core/domain/kinds.ts — extend EventKind
export const EventKind = {
  Move: 'move',
  Take: 'take',
  Drop: 'drop',
  Give: 'give',
  Look: 'look',
  Inventory: 'inventory',
  Failed: 'failed',
  Speak: 'speak',
  Emote: 'emote',
  Attack: 'attack',
  DescriptionUpdated: 'description_updated',
  AgentSpawned: 'agent_spawned',
} as const;
```

- [ ] **Step 3: Extend `events.ts` `DomainEvent` union**

```ts
// in src/core/domain/events.ts — add a new variant in DomainEvent
  | (BaseEvent & {
      kind: 'agent_spawned';
      spawnedAgentId: AgentId;
      locationId: LocationId;
      templateId: MonsterTemplateId;
    });
```

Add the `MonsterTemplateId` import. Note: `actorId` for spawn events is `SYSTEM_AGENT_ID` (the world spawned them). Witnesses are agents currently in the location.

- [ ] **Step 4: Extend `builder-kinds.ts` with `EntityKind`, `ProblemKind`, `TriggerEventKind`**

```ts
// in src/core/domain/builder-kinds.ts

export const EntityKind = {
  Location: 'location',
  Exit: 'exit',
  Item: 'item',
  Agent: 'agent',
  MonsterTemplate: 'monster_template',
  LocationSpawnTrigger: 'location_spawn_trigger',
} as const;
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

export const ProblemKind = {
  // existing codes …
  ExitFromMissing: 'exit_from_missing',
  ExitToMissing: 'exit_to_missing',
  ExitLockedByItemMissing: 'exit_locked_by_item_missing',
  ItemOwnerMissing: 'item_owner_missing',
  AgentLocationMissing: 'agent_location_missing',
  PlayerAgentNotSet: 'player_agent_not_set',
  PlayerAgentMissing: 'player_agent_missing',
  DuplicateId: 'duplicate_id',
  // new — templates and triggers
  TemplateLabelEmpty: 'template_label_empty',
  TemplateHpInvalid: 'template_hp_invalid',
  TemplateStartingItemMissing: 'template_starting_item_missing',
  LocationSpawnTriggerTemplateMissing: 'location_spawn_trigger_template_missing',
  LocationSpawnTriggerLocationMissing: 'location_spawn_trigger_location_missing',
  LocationSpawnTriggerCountInvalid: 'location_spawn_trigger_count_invalid',
  LocationSpawnTriggerParamsInvalid: 'location_spawn_trigger_params_invalid',
} as const;

export const TriggerEventKind = {
  PlayerEnters: 'player_enters',
  CombatStarts: 'combat_starts',
  ItemTaken: 'item_taken',
  Speech: 'speech',
  LlmJudgement: 'llm_judgement',
} as const;
export type TriggerEventKind = (typeof TriggerEventKind)[keyof typeof TriggerEventKind];

export const StarterPackEntryKind = {
  Inline: 'inline',
} as const;
export type StarterPackEntryKind =
  (typeof StarterPackEntryKind)[keyof typeof StarterPackEntryKind];
```

(`StarterPackEntryKind` is the tagged-union seam noted in spec §"Item starter packs"; v1 ships only `Inline` so the JSON shape is forward-compatible with a future `TemplateRef` variant.)

- [ ] **Step 5: Extend `builder-types.ts` with template + trigger types**

```ts
// in src/core/domain/builder-types.ts — add at the bottom (preserve existing
// imports; bring in TriggerEventKind, MonsterTemplateId, SpawnTriggerId,
// StarterPackEntryKind, OwnerKind).

export interface InlineStarterPackEntry {
  readonly kind: typeof StarterPackEntryKind.Inline;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly weight: number;
  readonly hidden: boolean;
}
export type StarterPackEntry = InlineStarterPackEntry;

export interface MonsterTemplate {
  readonly id: MonsterTemplateId;
  readonly worldId: WorldId;
  readonly templateKey: string;        // author-stable, unique per world
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hp: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
}

export type TriggerParams =
  | { readonly kind: typeof TriggerEventKind.PlayerEnters }
  | { readonly kind: typeof TriggerEventKind.CombatStarts }
  | { readonly kind: typeof TriggerEventKind.ItemTaken; readonly itemTemplateKey?: string }
  | { readonly kind: typeof TriggerEventKind.Speech; readonly phrase: string }
  | { readonly kind: typeof TriggerEventKind.LlmJudgement; readonly predicate: string };

export interface LocationSpawnTrigger {
  readonly id: SpawnTriggerId;
  readonly worldId: WorldId;
  readonly locationId: LocationId;
  readonly templateId: MonsterTemplateId;
  readonly params: TriggerParams;
  readonly count: number;
  readonly oneShot: boolean;
  readonly fireOnInitialPublish: boolean;
}

export interface UpsertMonsterTemplateInput {
  readonly id: MonsterTemplateId;
  readonly templateKey: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly hp: number;
  readonly mood: string | null;
  readonly startingItems: readonly StarterPackEntry[];
}

export interface UpsertLocationSpawnTriggerInput {
  readonly id: SpawnTriggerId;
  readonly locationId: LocationId;
  readonly templateId: MonsterTemplateId;
  readonly params: TriggerParams;
  readonly count: number;
  readonly oneShot: boolean;
  readonly fireOnInitialPublish: boolean;
}

export interface TriggerFireRecord {
  readonly firedAt: number;
}
export interface TriggerFireState {
  readonly byTriggerId: Readonly<Record<string, TriggerFireRecord>>;
}

// Extend WorldTree (replace existing definition)
export interface WorldTree {
  readonly summary: WorldSummary;
  readonly locations: readonly Location[];
  readonly exits: readonly Exit[];
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly templates: readonly MonsterTemplate[];
  readonly triggers: readonly LocationSpawnTrigger[];
}

// Extend PublishResult (replace existing definition)
export interface PublishResult {
  readonly outcome: PublishOutcomeKind;
  readonly liveWorldId: WorldId;
  readonly applied: {
    readonly inserts: number;
    readonly updates: number;
    readonly deletes: number;
  };
  readonly skipped: readonly SkipReport[];
  readonly initialSpawns: number;
}
```

`EntityRef` also gains two variants — append to the union:

```ts
  | { kind: typeof EntityKind.MonsterTemplate; id: MonsterTemplateId }
  | { kind: typeof EntityKind.LocationSpawnTrigger; id: SpawnTriggerId };
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: existing `WorldTree` constructions in `index.ts`, tests, and adapters now fail because they don't supply `templates` / `triggers`. That is the *intended* failure for Task 7+; for now, fix only the strictly-domain-internal callers (no `WorldTree` builders live in `domain/`). The downstream fixes happen in their respective tasks.

If the build is too noisy, temporarily set `templates` and `triggers` defaulted via a helper used only in `getWorldTree`. Otherwise leave the breakage and proceed — Tasks 3–7 will reconcile.

- [ ] **Step 7: Commit**

```bash
git add src/core/domain/builder-kinds.ts src/core/domain/builder-types.ts \
  src/core/domain/ids.ts src/core/domain/kinds.ts src/core/domain/events.ts
git commit -m "spawning: domain kinds, brand ids, and types for templates and triggers"
```

---

## Task 2: Schema migration (spec §"Schema changes")

**Files:**
- Modify: `src/infra/schema.ts`
- Create: `drizzle/0007_monster_templates.sql`

- [ ] **Step 1: Add `monsterTemplates` and `locationSpawnTriggers` tables**

```ts
// append to src/infra/schema.ts — after worldSnapshots

export const monsterTemplates = sqliteTable(
  'monster_templates',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    templateKey: text('template_key').notNull(),
    label: text('label').notNull(),
    shortDescription: text('short_description').notNull(),
    longDescription: text('long_description').notNull(),
    hp: integer('hp').notNull(),
    mood: text('mood'),
    startingItemsJson: text('starting_items_json').notNull().default('[]'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);

export const locationSpawnTriggers = sqliteTable(
  'location_spawn_triggers',
  {
    id: text('id').notNull(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id),
    locationId: text('location_id').notNull(),
    templateId: text('template_id').notNull(),
    kind: text('kind').notNull(),
    paramsJson: text('params_json'),
    count: integer('count').notNull().default(1),
    oneShot: integer('one_shot', { mode: 'boolean' }).notNull().default(false),
    fireOnInitialPublish: integer('fire_on_initial_publish', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.id] })],
);
```

No FK on `locationId` / `templateId` (they reference per-world composite-PK rows; matches the existing `events.actorId` pattern).

- [ ] **Step 2: Generate the migration**

Run: `pnpm exec drizzle-kit generate`
Expected: a new file `drizzle/0007_*.sql` is created. Inspect; rename to `drizzle/0007_monster_templates.sql` if drizzle-kit named it differently. It should contain `CREATE TABLE monster_templates ...` and `CREATE TABLE location_spawn_triggers ...` with the composite primary keys. No FK addition to existing tables.

- [ ] **Step 3: Verify migrations apply with PRAGMA foreign_keys handled**

Run: `pnpm typecheck && pnpm test tests/integration/builder-sqlite.test.ts`
Expected: existing integration tests pass — `openDb(':memory:')` runs all migrations including the new one, and the additive new tables don't break existing rows.

- [ ] **Step 4: Commit**

```bash
git add src/infra/schema.ts drizzle/0007_monster_templates.sql
git commit -m "spawning: schema migration for monster_templates and location_spawn_triggers"
```

---

## Task 3: BuilderRepository port extensions (spec §"Components" → builder facade)

**Files:**
- Modify: `src/core/builder/repository.ts`

- [ ] **Step 1: Extend the port**

```ts
// in src/core/builder/repository.ts — after existing delete* methods, before
// readSnapshot.

import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  TriggerFireState,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
} from '@core/domain/builder-types';
import type { LocationId, MonsterTemplateId, SpawnTriggerId, WorldId } from '@core/domain/ids';

  // …existing port methods…

  listMonsterTemplates(worldId: WorldId): Promise<readonly MonsterTemplate[]>;
  getMonsterTemplate(worldId: WorldId, id: MonsterTemplateId): Promise<MonsterTemplate | null>;
  upsertMonsterTemplate(worldId: WorldId, input: UpsertMonsterTemplateInput): Promise<void>;
  deleteMonsterTemplate(worldId: WorldId, id: MonsterTemplateId): Promise<void>;

  listLocationSpawnTriggers(
    worldId: WorldId,
    locationId?: LocationId,
  ): Promise<readonly LocationSpawnTrigger[]>;
  getLocationSpawnTrigger(
    worldId: WorldId,
    id: SpawnTriggerId,
  ): Promise<LocationSpawnTrigger | null>;
  upsertLocationSpawnTrigger(
    worldId: WorldId,
    input: UpsertLocationSpawnTriggerInput,
  ): Promise<void>;
  deleteLocationSpawnTrigger(worldId: WorldId, id: SpawnTriggerId): Promise<void>;

  /**
   * Per-live-world spawn-firing record. Separate column-shape on
   * `world_snapshots.snapshotJson` is documented in the spec; for the port
   * we expose a typed accessor so adapters can keep the JSON detail
   * private.
   */
  readTriggerFireState(worldId: WorldId): Promise<TriggerFireState>;
  writeTriggerFireState(worldId: WorldId, state: TriggerFireState): Promise<void>;
```

- [ ] **Step 2: Typecheck (will fail in adapters)**

Run: `pnpm typecheck`
Expected: `MemoryBuilderRepository` and `SqliteBuilderRepository` no longer satisfy the port. Tasks 4 and 5 fix that.

- [ ] **Step 3: Commit**

```bash
git add src/core/builder/repository.ts
git commit -m "spawning: BuilderRepository port adds template + trigger CRUD and fire-state"
```

---

## Task 4: MemoryBuilderRepository adds templates + triggers (spec §"Architecture")

**Files:**
- Modify: `src/infra/builder-memory-repository.ts`

- [ ] **Step 1: Add per-world Maps and the new methods**

```ts
// in MemoryBuilderRepository — extend with new fields and methods.

import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  TriggerFireState,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
} from '@core/domain/builder-types';
import {
  asMonsterTemplateId,
  asSpawnTriggerId,
  type MonsterTemplateId,
  type SpawnTriggerId,
} from '@core/domain/ids';

// …inside class body, alongside existing private maps:
  private templates = new Map<WorldId, Map<MonsterTemplateId, MonsterTemplate>>();
  private triggers = new Map<WorldId, Map<SpawnTriggerId, LocationSpawnTrigger>>();
  private fireStates = new Map<WorldId, TriggerFireState>();

  async listMonsterTemplates(w: WorldId) {
    return [...this.bucket(this.templates, w).values()];
  }
  async getMonsterTemplate(w: WorldId, id: MonsterTemplateId) {
    return this.bucket(this.templates, w).get(id) ?? null;
  }
  async upsertMonsterTemplate(w: WorldId, i: UpsertMonsterTemplateInput) {
    this.bucket(this.templates, w).set(i.id, {
      id: asMonsterTemplateId(i.id),
      worldId: w,
      templateKey: i.templateKey,
      label: i.label,
      shortDescription: i.shortDescription,
      longDescription: i.longDescription,
      hp: i.hp,
      mood: i.mood,
      startingItems: i.startingItems,
    });
  }
  async deleteMonsterTemplate(w: WorldId, id: MonsterTemplateId) {
    this.bucket(this.templates, w).delete(id);
  }

  async listLocationSpawnTriggers(w: WorldId, locationId?: LocationId) {
    const all = [...this.bucket(this.triggers, w).values()];
    return locationId ? all.filter((t) => t.locationId === locationId) : all;
  }
  async getLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId) {
    return this.bucket(this.triggers, w).get(id) ?? null;
  }
  async upsertLocationSpawnTrigger(w: WorldId, i: UpsertLocationSpawnTriggerInput) {
    this.bucket(this.triggers, w).set(i.id, {
      id: asSpawnTriggerId(i.id),
      worldId: w,
      locationId: i.locationId,
      templateId: i.templateId,
      params: i.params,
      count: i.count,
      oneShot: i.oneShot,
      fireOnInitialPublish: i.fireOnInitialPublish,
    });
  }
  async deleteLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId) {
    this.bucket(this.triggers, w).delete(id);
  }

  async readTriggerFireState(w: WorldId): Promise<TriggerFireState> {
    return this.fireStates.get(w) ?? { byTriggerId: {} };
  }
  async writeTriggerFireState(w: WorldId, state: TriggerFireState): Promise<void> {
    this.fireStates.set(w, state);
  }
```

Update `clone()` and `restore()` to include `templates`, `triggers`, and `fireStates` in the snapshot/restore tuple (transactional integrity).

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes (memory repo now satisfies the port; sqlite still doesn't).

```bash
git add src/infra/builder-memory-repository.ts
git commit -m "spawning: MemoryBuilderRepository implements template + trigger CRUD"
```

---

## Task 5: SqliteBuilderRepository adds templates + triggers (spec §"Schema changes"; convention §"composite PKs")

**Files:**
- Modify: `src/infra/builder-sqlite-repository.ts`

- [ ] **Step 1: Implement the new methods**

```ts
// in src/infra/builder-sqlite-repository.ts — alongside existing methods.

import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  StarterPackEntry,
  TriggerFireState,
  TriggerParams,
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
} from '@core/domain/builder-types';
import { TriggerEventKind } from '@core/domain/builder-kinds';
import {
  asMonsterTemplateId,
  asSpawnTriggerId,
  type MonsterTemplateId,
  type SpawnTriggerId,
} from '@core/domain/ids';

  async listMonsterTemplates(w: WorldId) {
    const rows = await this.db
      .select()
      .from(schema.monsterTemplates)
      .where(eq(schema.monsterTemplates.worldId, w));
    return rows.map((r) => toMonsterTemplate(r, w));
  }
  async getMonsterTemplate(w: WorldId, id: MonsterTemplateId) {
    const rows = await this.db
      .select()
      .from(schema.monsterTemplates)
      .where(
        and(eq(schema.monsterTemplates.worldId, w), eq(schema.monsterTemplates.id, id)),
      );
    const row = rows[0];
    return row ? toMonsterTemplate(row, w) : null;
  }
  async upsertMonsterTemplate(w: WorldId, i: UpsertMonsterTemplateInput) {
    await this.db
      .insert(schema.monsterTemplates)
      .values({
        id: i.id,
        worldId: w,
        templateKey: i.templateKey,
        label: i.label,
        shortDescription: i.shortDescription,
        longDescription: i.longDescription,
        hp: i.hp,
        mood: i.mood,
        startingItemsJson: JSON.stringify(i.startingItems),
      })
      .onConflictDoUpdate({
        target: [schema.monsterTemplates.worldId, schema.monsterTemplates.id],
        set: {
          templateKey: i.templateKey,
          label: i.label,
          shortDescription: i.shortDescription,
          longDescription: i.longDescription,
          hp: i.hp,
          mood: i.mood,
          startingItemsJson: JSON.stringify(i.startingItems),
        },
      });
  }
  async deleteMonsterTemplate(w: WorldId, id: MonsterTemplateId) {
    await this.db
      .delete(schema.monsterTemplates)
      .where(
        and(eq(schema.monsterTemplates.worldId, w), eq(schema.monsterTemplates.id, id)),
      );
  }

  async listLocationSpawnTriggers(w: WorldId, locationId?: LocationId) {
    const where = locationId
      ? and(
          eq(schema.locationSpawnTriggers.worldId, w),
          eq(schema.locationSpawnTriggers.locationId, locationId),
        )
      : eq(schema.locationSpawnTriggers.worldId, w);
    const rows = await this.db.select().from(schema.locationSpawnTriggers).where(where);
    return rows.map((r) => toTrigger(r, w));
  }
  async getLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId) {
    const rows = await this.db
      .select()
      .from(schema.locationSpawnTriggers)
      .where(
        and(
          eq(schema.locationSpawnTriggers.worldId, w),
          eq(schema.locationSpawnTriggers.id, id),
        ),
      );
    const row = rows[0];
    return row ? toTrigger(row, w) : null;
  }
  async upsertLocationSpawnTrigger(w: WorldId, i: UpsertLocationSpawnTriggerInput) {
    const values = {
      id: i.id,
      worldId: w,
      locationId: i.locationId,
      templateId: i.templateId,
      kind: i.params.kind,
      paramsJson: JSON.stringify(i.params),
      count: i.count,
      oneShot: i.oneShot,
      fireOnInitialPublish: i.fireOnInitialPublish,
    };
    await this.db
      .insert(schema.locationSpawnTriggers)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.locationSpawnTriggers.worldId, schema.locationSpawnTriggers.id],
        set: {
          locationId: values.locationId,
          templateId: values.templateId,
          kind: values.kind,
          paramsJson: values.paramsJson,
          count: values.count,
          oneShot: values.oneShot,
          fireOnInitialPublish: values.fireOnInitialPublish,
        },
      });
  }
  async deleteLocationSpawnTrigger(w: WorldId, id: SpawnTriggerId) {
    await this.db
      .delete(schema.locationSpawnTriggers)
      .where(
        and(
          eq(schema.locationSpawnTriggers.worldId, w),
          eq(schema.locationSpawnTriggers.id, id),
        ),
      );
  }

  /**
   * Trigger-fire-state lives on the snapshot JSON's `triggerFireState` field
   * (per spec §"world_snapshots.snapshotJson"). Read defaults to empty when
   * the field is absent (existing snapshots predate this slice).
   */
  async readTriggerFireState(w: WorldId): Promise<TriggerFireState> {
    const snap = await this.readSnapshot(w);
    if (!snap) return { byTriggerId: {} };
    const payload = JSON.parse(snap.json) as { triggerFireState?: TriggerFireState };
    return payload.triggerFireState ?? { byTriggerId: {} };
  }
  async writeTriggerFireState(w: WorldId, state: TriggerFireState): Promise<void> {
    const snap = await this.readSnapshot(w);
    const base = snap ? (JSON.parse(snap.json) as Record<string, unknown>) : {};
    const merged = JSON.stringify({ ...base, triggerFireState: state });
    await this.writeSnapshot(w, merged, Date.now());
  }
```

Add the row converters at the bottom of the file (next to the existing `toLocation` / `toExit` helpers):

```ts
function toMonsterTemplate(
  r: typeof schema.monsterTemplates.$inferSelect,
  w: WorldId,
): MonsterTemplate {
  return {
    id: asMonsterTemplateId(r.id),
    worldId: w,
    templateKey: r.templateKey,
    label: r.label,
    shortDescription: r.shortDescription,
    longDescription: r.longDescription,
    hp: r.hp,
    mood: r.mood,
    startingItems: JSON.parse(r.startingItemsJson) as StarterPackEntry[],
  };
}

function toTrigger(
  r: typeof schema.locationSpawnTriggers.$inferSelect,
  w: WorldId,
): LocationSpawnTrigger {
  const params = (
    r.paramsJson ? JSON.parse(r.paramsJson) : { kind: r.kind }
  ) as TriggerParams;
  return {
    id: asSpawnTriggerId(r.id),
    worldId: w,
    locationId: asLocationId(r.locationId),
    templateId: asMonsterTemplateId(r.templateId),
    params,
    count: r.count,
    oneShot: r.oneShot,
    fireOnInitialPublish: r.fireOnInitialPublish,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Run integration tests**

Run: `pnpm test tests/integration/builder-sqlite.test.ts`
Expected: existing tests pass; the new methods are not yet exercised.

- [ ] **Step 4: Commit**

```bash
git add src/infra/builder-sqlite-repository.ts
git commit -m "spawning: SqliteBuilderRepository implements template + trigger CRUD"
```

---

## Task 6: Validator extensions (spec §"Components" → validate.ts; spec §"Decisions" #6)

**Files:**
- Modify: `src/core/builder/validate.ts`
- Modify: `src/core/builder/validate.test.ts`

- [ ] **Step 1: Add a failing test per new problem code**

Add test cases to `validate.test.ts` (one per new code):

```ts
import {
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
} from '@core/domain/ids';
import { TriggerEventKind } from '@core/domain/builder-kinds';

const baseTemplate = (id = 'tpl_goblin') => ({
  id: asMonsterTemplateId(id),
  worldId: W,
  templateKey: 'goblin',
  label: 'goblin',
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hp: 5,
  mood: null,
  startingItems: [],
});

it('reports TemplateLabelEmpty', () => {
  const t = baseTree();
  const dirty = { ...t, templates: [{ ...baseTemplate(), label: '' }] };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TemplateLabelEmpty);
});

it('reports TemplateHpInvalid', () => {
  const t = baseTree();
  const dirty = { ...t, templates: [{ ...baseTemplate(), hp: 0 }] };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(ProblemKind.TemplateHpInvalid);
});

it('reports TemplateStartingItemMissing for an empty starter-pack inline label', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    templates: [
      {
        ...baseTemplate(),
        startingItems: [
          {
            kind: 'inline' as const,
            label: '',
            shortDescription: '',
            longDescription: '',
            weight: 0,
            hidden: false,
          },
        ],
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.TemplateStartingItemMissing,
  );
});

it('reports LocationSpawnTriggerTemplateMissing', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    triggers: [
      {
        id: asSpawnTriggerId('trg_1'),
        worldId: W,
        locationId: asLocationId('loc_a'),
        templateId: asMonsterTemplateId('tpl_missing'),
        params: { kind: TriggerEventKind.PlayerEnters },
        count: 1,
        oneShot: false,
        fireOnInitialPublish: false,
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.LocationSpawnTriggerTemplateMissing,
  );
});

it('reports LocationSpawnTriggerLocationMissing', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    templates: [baseTemplate()],
    triggers: [
      {
        id: asSpawnTriggerId('trg_1'),
        worldId: W,
        locationId: asLocationId('loc_missing'),
        templateId: asMonsterTemplateId('tpl_goblin'),
        params: { kind: TriggerEventKind.PlayerEnters },
        count: 1,
        oneShot: false,
        fireOnInitialPublish: false,
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.LocationSpawnTriggerLocationMissing,
  );
});

it('reports LocationSpawnTriggerCountInvalid for count < 1', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    templates: [baseTemplate()],
    triggers: [
      {
        id: asSpawnTriggerId('trg_1'),
        worldId: W,
        locationId: asLocationId('loc_a'),
        templateId: asMonsterTemplateId('tpl_goblin'),
        params: { kind: TriggerEventKind.PlayerEnters },
        count: 0,
        oneShot: false,
        fireOnInitialPublish: false,
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.LocationSpawnTriggerCountInvalid,
  );
});

it('reports LocationSpawnTriggerParamsInvalid when LlmJudgement lacks predicate', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    templates: [baseTemplate()],
    triggers: [
      {
        id: asSpawnTriggerId('trg_1'),
        worldId: W,
        locationId: asLocationId('loc_a'),
        templateId: asMonsterTemplateId('tpl_goblin'),
        // Bypass type checker for the test — runtime data flows in via JSON.
        params: { kind: TriggerEventKind.LlmJudgement } as never,
        count: 1,
        oneShot: false,
        fireOnInitialPublish: false,
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.LocationSpawnTriggerParamsInvalid,
  );
});

it('reports LocationSpawnTriggerParamsInvalid when Speech lacks phrase', () => {
  const t = baseTree();
  const dirty = {
    ...t,
    templates: [baseTemplate()],
    triggers: [
      {
        id: asSpawnTriggerId('trg_1'),
        worldId: W,
        locationId: asLocationId('loc_a'),
        templateId: asMonsterTemplateId('tpl_goblin'),
        params: { kind: TriggerEventKind.Speech } as never,
        count: 1,
        oneShot: false,
        fireOnInitialPublish: false,
      },
    ],
  };
  expect(validateWorld(dirty).map((p) => p.kind)).toContain(
    ProblemKind.LocationSpawnTriggerParamsInvalid,
  );
});
```

Update `baseTree()` to include `templates: []` and `triggers: []` (the new required `WorldTree` fields).

- [ ] **Step 2: Run tests, see fail**

Run: `pnpm test src/core/builder/validate.test.ts`
Expected: new tests fail; the validator does not yet check templates or triggers.

- [ ] **Step 3: Implement template + trigger checks in `validate.ts`**

Add inside `validateWorld` (before the `return problems`):

```ts
// Templates.
for (const tpl of tree.templates) {
  if (tpl.label.trim().length === 0) {
    problems.push({
      kind: ProblemKind.TemplateLabelEmpty,
      entity: EntityKind.MonsterTemplate,
      entityId: tpl.id as string,
      message: `template ${tpl.id} has empty label`,
    });
  }
  if (tpl.hp <= 0) {
    problems.push({
      kind: ProblemKind.TemplateHpInvalid,
      entity: EntityKind.MonsterTemplate,
      entityId: tpl.id as string,
      message: `template ${tpl.id} hp must be > 0`,
    });
  }
  for (const entry of tpl.startingItems) {
    if (entry.kind === StarterPackEntryKind.Inline && entry.label.trim().length === 0) {
      problems.push({
        kind: ProblemKind.TemplateStartingItemMissing,
        entity: EntityKind.MonsterTemplate,
        entityId: tpl.id as string,
        message: `template ${tpl.id} has a starter-pack entry with empty label`,
      });
    }
  }
}

// Triggers.
const templateIds = new Set(tree.templates.map((t) => t.id as string));
for (const trg of tree.triggers) {
  if (!templateIds.has(trg.templateId as string)) {
    problems.push({
      kind: ProblemKind.LocationSpawnTriggerTemplateMissing,
      entity: EntityKind.LocationSpawnTrigger,
      entityId: trg.id as string,
      message: `trigger ${trg.id} references missing template ${trg.templateId}`,
    });
  }
  if (!locIds.has(trg.locationId as string)) {
    problems.push({
      kind: ProblemKind.LocationSpawnTriggerLocationMissing,
      entity: EntityKind.LocationSpawnTrigger,
      entityId: trg.id as string,
      message: `trigger ${trg.id} at missing location ${trg.locationId}`,
    });
  }
  if (trg.count < 1) {
    problems.push({
      kind: ProblemKind.LocationSpawnTriggerCountInvalid,
      entity: EntityKind.LocationSpawnTrigger,
      entityId: trg.id as string,
      message: `trigger ${trg.id} count must be >= 1`,
    });
  }
  if (!isValidTriggerParams(trg.params)) {
    problems.push({
      kind: ProblemKind.LocationSpawnTriggerParamsInvalid,
      entity: EntityKind.LocationSpawnTrigger,
      entityId: trg.id as string,
      message: `trigger ${trg.id} params invalid for kind ${trg.params.kind}`,
    });
  }
}
```

Per-kind param validator (file-local):

```ts
import { StarterPackEntryKind, TriggerEventKind } from '@core/domain/builder-kinds';
import type { TriggerParams } from '@core/domain/builder-types';

const TRIGGER_PARAM_VALIDATORS: Record<TriggerEventKind, (p: TriggerParams) => boolean> = {
  [TriggerEventKind.PlayerEnters]: () => true,
  [TriggerEventKind.CombatStarts]: () => true,
  [TriggerEventKind.ItemTaken]: (p) =>
    p.kind === TriggerEventKind.ItemTaken &&
    (p.itemTemplateKey === undefined || typeof p.itemTemplateKey === 'string'),
  [TriggerEventKind.Speech]: (p) =>
    p.kind === TriggerEventKind.Speech &&
    typeof p.phrase === 'string' &&
    p.phrase.length > 0,
  [TriggerEventKind.LlmJudgement]: (p) =>
    p.kind === TriggerEventKind.LlmJudgement &&
    typeof p.predicate === 'string' &&
    p.predicate.length > 0,
};

function isValidTriggerParams(p: TriggerParams): boolean {
  const v = TRIGGER_PARAM_VALIDATORS[p.kind];
  return v ? v(p) : false;
}
```

(Const-object-keyed dispatcher per the no-string-literals rule.)

- [ ] **Step 4: Run tests, see pass**

Run: `pnpm test src/core/builder/validate.test.ts`
Expected: all green.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/core/builder/validate.ts src/core/builder/validate.test.ts
git commit -m "spawning: validator covers template and trigger problems"
```

---

## Task 7: Builder facade — template + trigger CRUD, extended `getWorldTree`, copy/clone (spec §"Architecture", §"Components" → builder)

**Files:**
- Modify: `src/core/builder/index.ts`
- Modify: `src/core/builder/index.test.ts`

- [ ] **Step 1: Failing tests for the new facade methods**

```ts
// in src/core/builder/index.test.ts — additions

describe('upsert/delete monster template + trigger', () => {
  it('upsertMonsterTemplate refuses against a live world', async () => {
    const repo = new MemoryBuilderRepository();
    const live = asWorldId('w_live_test');
    await repo.createWorld({
      id: live,
      kind: WorldKind.Live,
      label: 'L',
      displayName: 'L',
      parentDraftId: null,
      playerAgentId: null,
    });
    const r = await upsertMonsterTemplate(repo, live, sampleTemplateInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(BuilderErrorKind.WorldKindMismatch);
  });

  it('upsertLocationSpawnTrigger writes to a draft', async () => {
    const repo = new MemoryBuilderRepository();
    const draft = await createDraft(repo, { displayName: 'D', label: 'D' });
    if (!draft.ok) throw new Error(draft.error.message);
    await upsertMonsterTemplate(repo, draft.value, sampleTemplateInput());
    const r = await upsertLocationSpawnTrigger(repo, draft.value, sampleTriggerInput());
    expect(r.ok).toBe(true);
    const tree = await getWorldTree(repo, draft.value);
    if (!tree.ok) throw new Error(tree.error.message);
    expect(tree.value.triggers).toHaveLength(1);
    expect(tree.value.templates).toHaveLength(1);
  });
});
```

(`sampleTemplateInput` and `sampleTriggerInput` are local test helpers returning the new `Upsert*Input` shapes.)

- [ ] **Step 2: Run tests to see fail**

Run: `pnpm test src/core/builder/index.test.ts`
Expected: fails — facade lacks the new functions.

- [ ] **Step 3: Implement the new facade methods**

```ts
// src/core/builder/index.ts — new exports

export async function upsertMonsterTemplate(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertMonsterTemplateInput,
): Promise<Result<MonsterTemplateId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertMonsterTemplate(worldId, input);
  return Ok(input.id);
}

export async function deleteMonsterTemplate(
  repo: BuilderRepository,
  worldId: WorldId,
  id: MonsterTemplateId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteMonsterTemplate(worldId, id);
  return Ok(undefined);
}

export async function upsertLocationSpawnTrigger(
  repo: BuilderRepository,
  worldId: WorldId,
  input: UpsertLocationSpawnTriggerInput,
): Promise<Result<SpawnTriggerId, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.upsertLocationSpawnTrigger(worldId, input);
  return Ok(input.id);
}

export async function deleteLocationSpawnTrigger(
  repo: BuilderRepository,
  worldId: WorldId,
  id: SpawnTriggerId,
): Promise<Result<void, BuilderError>> {
  const s = await requireDraft(repo, worldId);
  if (!s.ok) return s;
  await repo.deleteLocationSpawnTrigger(worldId, id);
  return Ok(undefined);
}
```

- [ ] **Step 4: Extend `getWorldTree` to include templates + triggers**

```ts
// replace existing getWorldTree
export async function getWorldTree(
  repo: BuilderRepository,
  id: WorldId,
): Promise<Result<WorldTree, BuilderError>> {
  const s = await requireWorld(repo, id);
  if (!s.ok) return s;
  const [locations, exits, items, agents, templates, triggers] = await Promise.all([
    repo.listLocations(id),
    repo.listExits(id),
    repo.listItems(id),
    repo.listAgents(id),
    repo.listMonsterTemplates(id),
    repo.listLocationSpawnTriggers(id),
  ]);
  return Ok({ summary: s.value, locations, exits, items, agents, templates, triggers });
}
```

- [ ] **Step 5: Extend `copyTreeIntoWorld` to copy templates + triggers**

```ts
async function copyTreeIntoWorld(
  repo: BuilderRepository,
  source: WorldTree,
  destWorldId: WorldId,
): Promise<void> {
  for (const l of source.locations) await repo.upsertLocation(destWorldId, asLocInput(l));
  for (const a of source.agents) await repo.upsertAgent(destWorldId, asAgentInput(a));
  for (const it of source.items) await repo.upsertItem(destWorldId, asItemInput(it));
  for (const e of source.exits) await repo.upsertExit(destWorldId, asExitInput(e));
  for (const t of source.templates) await repo.upsertMonsterTemplate(destWorldId, asTemplateInput(t));
  for (const trg of source.triggers) await repo.upsertLocationSpawnTrigger(destWorldId, asTriggerInput(trg));
}

const asTemplateInput = (t: MonsterTemplate): UpsertMonsterTemplateInput => ({
  id: t.id,
  templateKey: t.templateKey,
  label: t.label,
  shortDescription: t.shortDescription,
  longDescription: t.longDescription,
  hp: t.hp,
  mood: t.mood,
  startingItems: t.startingItems,
});

const asTriggerInput = (t: LocationSpawnTrigger): UpsertLocationSpawnTriggerInput => ({
  id: t.id,
  locationId: t.locationId,
  templateId: t.templateId,
  params: t.params,
  count: t.count,
  oneShot: t.oneShot,
  fireOnInitialPublish: t.fireOnInitialPublish,
});
```

- [ ] **Step 6: Extend `snapshotJson` to round-trip templates + triggers**

```ts
function snapshotJson(tree: WorldTree, fireState: TriggerFireState = { byTriggerId: {} }): string {
  return JSON.stringify({
    locations: tree.locations,
    exits: tree.exits,
    items: tree.items,
    agents: tree.agents,
    templates: tree.templates,
    triggers: tree.triggers,
    triggerFireState: fireState,
  });
}
```

Update the call sites in `publish` and `resetLiveToDraft` to pass the appropriate fire state (Task 14 rewrites those).

- [ ] **Step 7: Run tests and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/core/builder/index.ts src/core/builder/index.test.ts
git commit -m "spawning: builder facade adds template + trigger CRUD; tree carries them"
```

---

## Task 8: `expandSpawn` — pure expansion (spec §"Components" → expand.ts)

**Files:**
- Create: `src/core/spawning/expand.ts`
- Create: `src/core/spawning/expand.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/core/spawning/expand.test.ts
import {
  asLocationId,
  asMonsterTemplateId,
  asWorldId,
} from '@core/domain/ids';
import type { MonsterTemplate } from '@core/domain/builder-types';
import { describe, expect, it } from 'vitest';
import { expandSpawn } from './expand';

const W = asWorldId('w_live');
const tpl: MonsterTemplate = {
  id: asMonsterTemplateId('tpl_goblin'),
  worldId: W,
  templateKey: 'goblin',
  label: 'goblin',
  shortDescription: 'a goblin',
  longDescription: 'a small goblin',
  hp: 5,
  mood: 'wary',
  startingItems: [],
};

describe('expandSpawn', () => {
  it('produces count agent inserts at the given location', () => {
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 3 });
    expect(inserts).toHaveLength(3);
    for (const a of inserts) {
      expect(a.locationId).toBe(asLocationId('loc_a'));
      expect(a.label).toBe('goblin');
      expect(a.hp).toBe(5);
      expect(a.mood).toBe('wary');
    }
  });

  it('mints unique ids per call', () => {
    const inserts = expandSpawn({ template: tpl, locationId: asLocationId('loc_a'), count: 4 });
    const ids = new Set(inserts.map((a) => a.id as string));
    expect(ids.size).toBe(4);
  });
});
```

- [ ] **Step 2: Run, see fail.** `pnpm test src/core/spawning/expand.test.ts`

- [ ] **Step 3: Implement `expand.ts`**

```ts
// src/core/spawning/expand.ts
import type { MonsterTemplate, UpsertAgentInput } from '@core/domain/builder-types';
import { asAgentId, type AgentId, type LocationId } from '@core/domain/ids';

const newSpawnedAgentId = (templateKey: string): AgentId =>
  asAgentId(`char_${templateKey}_${Math.random().toString(36).slice(2, 10)}`);

/**
 * Pure: expand a template into `count` `UpsertAgentInput`s targeting
 * `locationId`. Each insert is mechanically identical to a hand-authored
 * agent — once the rows hit the `agents` table they're indistinguishable.
 */
export function expandSpawn(args: {
  readonly template: MonsterTemplate;
  readonly locationId: LocationId;
  readonly count: number;
}): readonly UpsertAgentInput[] {
  const out: UpsertAgentInput[] = [];
  for (let i = 0; i < args.count; i++) {
    out.push({
      id: newSpawnedAgentId(args.template.templateKey),
      label: args.template.label,
      shortDescription: args.template.shortDescription,
      longDescription: args.template.longDescription,
      locationId: args.locationId,
      hp: args.template.hp,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: args.template.mood,
      goal: null,
      autonomous: false,
    });
  }
  return out;
}
```

(`damage` / `defense` / `capacity` carry sensible defaults; templates can grow these fields in a later slice — out of scope for v1, spec §"Out of scope".)

- [ ] **Step 4: Run, see pass. Commit.**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/core/spawning/expand.ts src/core/spawning/expand.test.ts
git commit -m "spawning: expandSpawn pure expansion"
```

---

## Task 9: Limits constants (spec §"Decisions" #7)

**Files:**
- Create: `src/core/spawning/limits.ts`
- Create: `src/core/spawning/limits.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/core/spawning/limits.test.ts
import { describe, expect, it } from 'vitest';
import { MAX_JUDGEMENT_CALLS_PER_TICK, MAX_SPAWNS_PER_TICK } from './limits';

describe('spawning limits', () => {
  it('exports MAX_SPAWNS_PER_TICK = 8 and MAX_JUDGEMENT_CALLS_PER_TICK = 4', () => {
    expect(MAX_SPAWNS_PER_TICK).toBe(8);
    expect(MAX_JUDGEMENT_CALLS_PER_TICK).toBe(4);
  });
});
```

- [ ] **Step 2: Implement `limits.ts`**

```ts
// src/core/spawning/limits.ts
/**
 * Bounded-tick discipline: a chain of triggers must never stall the player
 * turn. Sized to match `MAX_NPCS_PER_TICK` and `MAX_CONSEQUENCE_DEPTH`.
 */
export const MAX_SPAWNS_PER_TICK = 8;

/** LLM-cost ceiling per tick for `LlmJudgement` triggers. */
export const MAX_JUDGEMENT_CALLS_PER_TICK = 4;
```

- [ ] **Step 3: Run and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test src/core/spawning/limits.test.ts
git add src/core/spawning/limits.ts src/core/spawning/limits.test.ts
git commit -m "spawning: per-tick spawn and judgement caps"
```

---

## Task 10: Mechanical trigger pass (spec §"Components" → triggers.ts; spec §"Trigger evaluation details")

**Files:**
- Create: `src/core/spawning/triggers.ts`
- Create: `src/core/spawning/triggers.test.ts`

- [ ] **Step 1: Failing tests — one per `TriggerEventKind` mechanical kind**

Test cases (each verifies match + miss):

- `PlayerEnters`: matches a `move` whose `actorId === playerId` and `to === trigger.locationId`. Misses when `to !== locationId`.
- `CombatStarts`: matches an `attack` whose target is in the trigger's location.
- `ItemTaken`: matches a `take` from `trigger.locationId`; with `itemTemplateKey`, only matches that key.
- `Speech`: matches a `speak` event in `trigger.locationId` whose utterance contains the phrase (case-insensitive substring).
- `oneShot` gating: a previously-fired trigger is skipped.

```ts
// src/core/spawning/triggers.test.ts (sketch)
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { DomainEvent } from '@core/domain/events';
import type { LocationSpawnTrigger, TriggerFireState } from '@core/domain/builder-types';
import {
  asAgentId,
  asEventId,
  asItemId,
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { matchMechanicalTriggers } from './triggers';
// …
```

Each case constructs `events`, `triggers`, `fireState`, and a synthetic `perception` (locations of agents, items in rooms — see Step 3 for the shape) and asserts the returned hit list.

- [ ] **Step 2: Run, see fail.**

- [ ] **Step 3: Implement the mechanical pass**

```ts
// src/core/spawning/triggers.ts
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, TriggerFireState } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, type ItemId, type LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';

export interface PerceptionView {
  /** Map of agentId → its current locationId, for resolving combat targets. */
  readonly agentLocations: ReadonlyMap<AgentId, LocationId>;
  /** Map of itemId → templateKey (for ItemTaken filter); optional. */
  readonly itemTemplateKeys: ReadonlyMap<ItemId, string>;
  readonly playerId: AgentId;
}

export interface TriggerHit {
  readonly trigger: LocationSpawnTrigger;
}

const isFired = (state: TriggerFireState, id: string): boolean =>
  state.byTriggerId[id] !== undefined;

/**
 * Mechanical pass: cheap, sync. One dispatcher per concrete event kind,
 * keyed by `TriggerEventKind` per the no-string-literals rule.
 */
type MatchFn = (
  trigger: LocationSpawnTrigger,
  events: readonly DomainEvent[],
  perception: PerceptionView,
) => boolean;

const MATCHERS: Record<TriggerEventKind, MatchFn | null> = {
  [TriggerEventKind.PlayerEnters]: (t, events, p) =>
    events.some(
      (e) =>
        e.kind === EventKind.Move && e.actorId === p.playerId && e.to === t.locationId,
    ),
  [TriggerEventKind.CombatStarts]: (t, events, p) =>
    events.some(
      (e) => e.kind === EventKind.Attack && p.agentLocations.get(e.targetAgentId) === t.locationId,
    ),
  [TriggerEventKind.ItemTaken]: (t, events, p) =>
    events.some((e) => {
      if (e.kind !== EventKind.Take) return false;
      if (e.from !== t.locationId) return false;
      if (t.params.kind !== TriggerEventKind.ItemTaken) return false;
      const key = t.params.itemTemplateKey;
      if (key === undefined) return true;
      return p.itemTemplateKeys.get(e.itemId) === key;
    }),
  [TriggerEventKind.Speech]: (t, events, p) =>
    events.some((e) => {
      if (e.kind !== EventKind.Speak) return false;
      if (p.agentLocations.get(e.actorId) !== t.locationId) return false;
      if (t.params.kind !== TriggerEventKind.Speech) return false;
      return e.utterance.toLowerCase().includes(t.params.phrase.toLowerCase());
    }),
  // Judgement is handled by matchJudgementTriggers (async).
  [TriggerEventKind.LlmJudgement]: null,
};

export function matchMechanicalTriggers(args: {
  readonly events: readonly DomainEvent[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly fireState: TriggerFireState;
  readonly perception: PerceptionView;
}): readonly TriggerHit[] {
  const hits: TriggerHit[] = [];
  for (const trigger of args.triggers) {
    const matcher = MATCHERS[trigger.params.kind];
    if (!matcher) continue;
    if (trigger.oneShot && isFired(args.fireState, trigger.id as string)) continue;
    if (matcher(trigger, args.events, args.perception)) {
      hits.push({ trigger });
    }
  }
  return hits;
}
```

- [ ] **Step 4: Pass tests, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test src/core/spawning/triggers.test.ts
git add src/core/spawning/triggers.ts src/core/spawning/triggers.test.ts
git commit -m "spawning: mechanical trigger pass with per-kind dispatcher"
```

---

## Task 11: Judgement trigger pass (spec §"Components" → triggers.ts; §"Trigger evaluation details")

**Files:**
- Modify: `src/core/spawning/triggers.ts`
- Modify: `src/core/spawning/triggers.test.ts`

- [ ] **Step 1: Failing tests using `FakeLanguageModel`**

```ts
// add to src/core/spawning/triggers.test.ts
import { makeFakeLanguageModel } from '~/../tests/helpers/fake-language-model';
import { matchJudgementTriggers } from './triggers';

it('LlmJudgement: fires when LLM returns true', async () => {
  const llm = makeFakeLanguageModel({
    responder: () => ({ raw: '{"matches":true}', parsed: { matches: true } }),
  });
  // build a trigger with predicate "the room is noisy" and at least one event
  // in trigger.locationId; call matchJudgementTriggers and expect 1 hit.
});

it('LlmJudgement: does not fire when LLM returns false', async () => { /* … */ });

it('LlmJudgement: budget exhaustion skips remaining triggers', async () => {
  // 3 eligible triggers, budget = 1 → exactly 1 hit.
});

it('LlmJudgement: oneShot already-fired is skipped', async () => { /* … */ });

it('LlmJudgement: skips triggers whose location had no events this tick', async () => {
  // Spec §"Components" → triggers.ts: judgement only proceeds for locations
  // that had events this tick. The LLM is not called.
});
```

- [ ] **Step 2: Implement `matchJudgementTriggers`**

```ts
// in src/core/spawning/triggers.ts
import type { LanguageModel } from '@core/engine/language-model';

const JUDGEMENT_SCHEMA = {
  type: 'object',
  properties: { matches: { type: 'boolean' } },
  required: ['matches'],
  additionalProperties: false,
} as const;

export interface JudgementResult {
  readonly hits: readonly TriggerHit[];
  readonly callsUsed: number;
}

export async function matchJudgementTriggers(args: {
  readonly events: readonly DomainEvent[];
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly fireState: TriggerFireState;
  readonly perception: PerceptionView;
  readonly llm: LanguageModel | null;
  readonly judgementBudget: number;
}): Promise<JudgementResult> {
  if (!args.llm || args.judgementBudget <= 0) return { hits: [], callsUsed: 0 };

  // Group events by location for the "did anything happen here" check.
  const eventLocations = new Set<LocationId>();
  for (const e of args.events) {
    const loc = locationOfEvent(e, args.perception);
    if (loc !== null) eventLocations.add(loc);
  }

  const hits: TriggerHit[] = [];
  let calls = 0;
  for (const trigger of args.triggers) {
    if (trigger.params.kind !== TriggerEventKind.LlmJudgement) continue;
    if (trigger.oneShot && isFired(args.fireState, trigger.id as string)) continue;
    if (!eventLocations.has(trigger.locationId)) continue;
    if (calls >= args.judgementBudget) break;
    calls += 1;
    try {
      const eventsHere = args.events.filter(
        (e) => locationOfEvent(e, args.perception) === trigger.locationId,
      );
      const resp = await args.llm.complete({
        system:
          'You are a deterministic predicate evaluator. Answer whether the predicate is true given the recent events. Reply with strict JSON.',
        user: JSON.stringify({
          predicate: trigger.params.predicate,
          events: eventsHere.map((e) => ({ kind: e.kind, actorId: e.actorId })),
        }),
        schema: JUDGEMENT_SCHEMA,
        schemaName: 'TriggerJudgement',
      });
      const parsed = resp.parsed as { matches?: boolean };
      if (parsed?.matches === true) hits.push({ trigger });
    } catch {
      // Per spec §"Error handling" — log + skip; trigger remains eligible.
    }
  }
  return { hits, callsUsed: calls };
}

function locationOfEvent(e: DomainEvent, p: PerceptionView): LocationId | null {
  switch (e.kind) {
    case EventKind.Move:
      return e.to;
    case EventKind.Take:
      return e.from;
    case EventKind.Drop:
      return e.to;
    case EventKind.Look:
      return e.locationId;
    case EventKind.Speak:
    case EventKind.Emote:
    case EventKind.Attack:
    case EventKind.Give:
    case EventKind.AgentSpawned:
      // Resolve via actor's current location.
      return p.agentLocations.get(e.actorId) ?? null;
    default:
      return null;
  }
}
```

- [ ] **Step 3: Pass tests; commit**

```bash
pnpm typecheck && pnpm lint && pnpm test src/core/spawning/triggers.test.ts
git add src/core/spawning/triggers.ts src/core/spawning/triggers.test.ts
git commit -m "spawning: LLM judgement trigger pass with per-tick budget"
```

---

## Task 12: Tick spawn pass orchestration (spec §"Components" → tickPass.ts; §"Data flow" → "Tick spawn pass")

**Files:**
- Create: `src/core/spawning/tick-pass.ts`
- Create: `src/core/spawning/tick-pass.test.ts`

- [ ] **Step 1: Failing tests with `MemoryRepository` + `MemoryBuilderRepository`**

Cases (per spec §"Testing"):
- One-shot trigger fires once; second tick produces no hit.
- Non-one-shot trigger fires every qualifying tick.
- Spawn cap clips beyond `MAX_SPAWNS_PER_TICK`.
- Judgement budget caps at `MAX_JUDGEMENT_CALLS_PER_TICK`.
- No backlog: surplus drops, next tick re-evaluates fresh.
- `EventKind.AgentSpawned` event emitted per spawned agent.

- [ ] **Step 2: Implement `tick-pass.ts`**

```ts
// src/core/spawning/tick-pass.ts
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { BuilderRepository } from '@core/builder/repository';
import type { LocationSpawnTrigger, TriggerFireState } from '@core/domain/builder-types';
import type { DomainEvent } from '@core/domain/events';
import {
  asEventId,
  SYSTEM_AGENT_ID,
  type AgentId,
  type WorldId,
} from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { LanguageModel } from '@core/engine/language-model';
import type { Repository } from '@core/engine/repository';
import { expandSpawn } from './expand';
import { MAX_JUDGEMENT_CALLS_PER_TICK, MAX_SPAWNS_PER_TICK } from './limits';
import {
  matchJudgementTriggers,
  matchMechanicalTriggers,
  type PerceptionView,
  type TriggerHit,
} from './triggers';

export interface TickSpawnResult {
  readonly events: readonly DomainEvent[];
}

export async function runSpawnTickPass(args: {
  readonly worldId: WorldId;
  readonly events: readonly DomainEvent[];
  readonly engineRepo: Repository;
  readonly builderRepo: BuilderRepository;
  readonly llm: LanguageModel | null;
  readonly perception: PerceptionView;
  readonly now?: () => number;
}): Promise<TickSpawnResult> {
  const now = args.now ?? (() => Date.now());
  const triggers = await args.builderRepo.listLocationSpawnTriggers(args.worldId);
  if (triggers.length === 0) return { events: [] };

  const fireState = await args.builderRepo.readTriggerFireState(args.worldId);

  const mechHits = matchMechanicalTriggers({
    events: args.events,
    triggers,
    fireState,
    perception: args.perception,
  });

  const remaining = triggers.filter(
    (t) => t.params.kind === TriggerEventKind.LlmJudgement &&
      !mechHits.some((h) => h.trigger.id === t.id),
  );
  const { hits: judgeHits } = await matchJudgementTriggers({
    events: args.events,
    triggers: remaining,
    fireState,
    perception: args.perception,
    llm: args.llm,
    judgementBudget: MAX_JUDGEMENT_CALLS_PER_TICK,
  });

  const allHits: TriggerHit[] = [...mechHits, ...judgeHits];
  if (allHits.length === 0) return { events: [] };

  const out: DomainEvent[] = [];
  let spawnCount = 0;
  const newFireRecords: Record<string, { firedAt: number }> = { ...fireState.byTriggerId };

  for (const hit of allHits) {
    if (spawnCount >= MAX_SPAWNS_PER_TICK) break;
    const remainingBudget = MAX_SPAWNS_PER_TICK - spawnCount;
    const count = Math.min(hit.trigger.count, remainingBudget);
    const tpl = await args.builderRepo.getMonsterTemplate(args.worldId, hit.trigger.templateId);
    if (!tpl) continue;
    const inserts = expandSpawn({ template: tpl, locationId: hit.trigger.locationId, count });
    for (const insert of inserts) {
      // Write the agent as if hand-authored.
      await args.engineRepo.upsertAgent({
        ...insert,
        worldId: args.worldId,
        shortTermIntent: null,
        awake: false,
      } as never);
      out.push(spawnedEvent(args.worldId, insert.id, hit.trigger.locationId, hit.trigger.templateId, now()));
      spawnCount += 1;
    }
    newFireRecords[hit.trigger.id as string] = { firedAt: now() };
  }

  await args.builderRepo.writeTriggerFireState(args.worldId, { byTriggerId: newFireRecords });
  return { events: out };
}

function spawnedEvent(
  worldId: WorldId,
  spawnedAgentId: AgentId,
  locationId: import('@core/domain/ids').LocationId,
  templateId: import('@core/domain/ids').MonsterTemplateId,
  ts: number,
): DomainEvent {
  return {
    id: asEventId(`evt_spawn_${ts}_${(spawnedAgentId as string).slice(-6)}`),
    worldId,
    actorId: SYSTEM_AGENT_ID,
    kind: EventKind.AgentSpawned,
    witnesses: [],
    createdAt: new Date(ts),
    spawnedAgentId,
    locationId,
    templateId,
  } as DomainEvent;
}
```

(Note: `engineRepo.upsertAgent` is the existing engine-side write path — confirm exact signature in `src/core/engine/repository.ts` during implementation; if absent, add a thin write method for spawning that the SQLite + Memory engine repositories support. Reading the writes onto the live world's `agents` table is the critical seam; the `as never` cast above is a placeholder for whatever the repository's exact agent-insert shape is. Replace with the real call.)

The cast is the only loose thread in this task and it gets resolved at implementation time by reading `src/core/engine/repository.ts` and matching the existing agent-insert API.

- [ ] **Step 3: Witnesses for spawn events**

After inserts are written, populate `witnesses` for each spawn event with the agents currently in `hit.trigger.locationId` (use `engineRepo.agentsAt(locationId)` and exclude the just-spawned id). This makes the player witness "a goblin appears" when co-located.

- [ ] **Step 4: Run, pass, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test src/core/spawning/tick-pass.test.ts
git add src/core/spawning/tick-pass.ts src/core/spawning/tick-pass.test.ts
git commit -m "spawning: tick pass orchestrates mechanical + judgement spawns"
```

---

## Task 13: Engine integration — render spawn events; invoke spawn pass (spec §"Architecture", §"Data flow" → "Tick spawn pass")

**Files:**
- Modify: `src/core/engine/templates.ts`
- Modify: `src/core/engine/tick.ts`
- Modify: `src/core/engine/consequences.ts` (extend `summarise` exhaustive switch)
- Modify: `src/core/engine/narrate.ts` (extend `summariseEvent` switch)
- Modify: `src/core/engine/npc-mind.ts` (extend `summariseEvent` switch)

- [ ] **Step 1: Failing test — exhaustive-switch breakage forces every site**

Run: `pnpm typecheck`
Expected: every `switch (event.kind)` over `EventKind` flags an exhaustive-check failure for `agent_spawned`. Use this list to find every site that needs a new case.

- [ ] **Step 2: `renderAgentSpawnedObserved` in `templates.ts`**

```ts
// templates.ts
export function renderAgentSpawnedObserved(label: string): string {
  return `${capitalise(label)} appears here.`;
}

const capitalise = (s: string): string => (s.length === 0 ? s : s[0]?.toUpperCase() + s.slice(1));
```

- [ ] **Step 3: Wire `EventKind.AgentSpawned` into `renderWitnessForPlayer`**

```ts
// tick.ts inside renderWitnessForPlayer
case EventKind.AgentSpawned: {
  const spawned = await repo.getAgent(event.spawnedAgentId);
  return renderAgentSpawnedObserved(spawned.label);
}
```

- [ ] **Step 4: Add the spawn pass to `runTick`**

After consequence pass(es) and before the final return:

```ts
// tick.ts
import { runSpawnTickPass } from '@core/spawning/tick-pass';

// after step 7 (sleepFinishedNpcs), before constructing the result:
const spawnResult = await runSpawnTickPass({
  worldId: (await repo.getAgent(playerId)).worldId,
  events,
  engineRepo: repo,
  builderRepo: opts.builderRepo,
  llm,
  perception: await buildPerceptionView(repo),
  // …
});
for (const ev of spawnResult.events) {
  events.push(ev);
  const line = await renderWitnessForPlayer(ev, playerId, repo);
  if (line !== null && line.length > 0) witnessed.push(line);
}
```

`buildPerceptionView` is a small repo helper — it walks `repo.listAgents()` and `repo.listItems()` (or equivalent) once, returning a `PerceptionView`. Add it next to `runSpawnTickPass` if the repo doesn't already expose one.

`opts.builderRepo` — extend `RunTickOptions` to take a `BuilderRepository`. The composition root (TanStack server functions) already has one.

- [ ] **Step 5: Extend other exhaustive switches**

In `consequences.ts:summarise`, `narrate.ts:summariseEvent`, and `npc-mind.ts:summariseEvent`, add an `EventKind.AgentSpawned` case that produces a one-line summary like `${actor} spawned ${label} at ${locationId}`. Use the existing helper style.

- [ ] **Step 6: Run typecheck, lint, tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green, including the existing 200+ test baseline.

- [ ] **Step 7: Commit**

```bash
git add src/core/engine/templates.ts src/core/engine/tick.ts \
  src/core/engine/consequences.ts src/core/engine/narrate.ts \
  src/core/engine/npc-mind.ts
git commit -m "spawning: engine tick invokes spawn pass; AgentSpawned narration"
```

---

## Task 14: Publish flow — initial vs re-publish; reset (spec §"Decisions" #4; §"Data flow" → "Publish (draft → live)")

**Files:**
- Modify: `src/core/builder/index.ts`
- Modify: `src/core/builder/index.test.ts`
- Create: `tests/integration/builder-monster-templates.test.ts`

- [ ] **Step 1: Failing tests covering each publish branch (per spec §"Testing")**

Test cases:
1. Initial publish with a `fireOnInitialPublish` trigger inserts `count` agents at the trigger's location and records `firedAt`. `PublishResult.initialSpawns === count`.
2. Re-publish of the same draft into the existing live world inserts no new agents (`initialSpawns === 0`); prior monsters and `firedAt` are preserved.
3. Adding a new `fireOnInitialPublish` trigger and re-publishing does NOT spawn it; a subsequent `resetLiveToDraft` does spawn it.
4. Removing a trigger from the draft drops its `triggerFireState` entry on re-publish without despawning the agents it produced.
5. `resetLiveToDraft` clears `triggerFireState` and re-fires all `fireOnInitialPublish` triggers.

- [ ] **Step 2: Run, see fail.**

- [ ] **Step 3: Implement publish branching**

In `publish` (initial branch — `liveId` was null):

```ts
// after copyTreeIntoWorld and before writeSnapshot:
const initialFireRecords: Record<string, { firedAt: number }> = {};
let initialSpawns = 0;
const now = Date.now();
for (const trg of draftTree.value.triggers) {
  if (!trg.fireOnInitialPublish) continue;
  const tpl = draftTree.value.templates.find((t) => t.id === trg.templateId);
  if (!tpl) continue;
  const inserts = expandSpawn({ template: tpl, locationId: trg.locationId, count: trg.count });
  for (const insert of inserts) {
    await tx.upsertAgent(newId, insert);
    initialSpawns += 1;
  }
  initialFireRecords[trg.id as string] = { firedAt: now };
}
const fireState = { byTriggerId: initialFireRecords };
await tx.writeSnapshot(newId, snapshotJson(draftTree.value, fireState), now);
```

In `publish` re-publish branch (after the existing apply loop, replacing the snapshot write):

```ts
const previousFireState = await tx.readTriggerFireState(liveId);
const draftTriggerIds = new Set(draftTree.value.triggers.map((t) => t.id as string));
// Drop entries whose trigger is no longer in the draft.
const filtered: Record<string, { firedAt: number }> = {};
for (const [id, rec] of Object.entries(previousFireState.byTriggerId)) {
  if (draftTriggerIds.has(id)) filtered[id] = rec;
}
await tx.writeSnapshot(liveId, snapshotJson(draftTree.value, { byTriggerId: filtered }), Date.now());
// initialSpawns = 0 on re-publish
```

Return shape gains `initialSpawns: 0 | initialSpawns`. Update both `Created` and `Merged` results.

In `resetLiveToDraft`, after copying the draft tree into live and before writing the snapshot:

```ts
let initialSpawns = 0;
const initialFireRecords: Record<string, { firedAt: number }> = {};
const now = Date.now();
for (const trg of draftTree.value.triggers) {
  if (!trg.fireOnInitialPublish) continue;
  const tpl = draftTree.value.templates.find((t) => t.id === trg.templateId);
  if (!tpl) continue;
  const inserts = expandSpawn({ template: tpl, locationId: trg.locationId, count: trg.count });
  for (const insert of inserts) {
    await tx.upsertAgent(liveId, insert);
    initialSpawns += 1;
  }
  initialFireRecords[trg.id as string] = { firedAt: now };
}
await tx.writeSnapshot(liveId, snapshotJson(draftTree.value, { byTriggerId: initialFireRecords }), now);
```

Return type stays `Result<void, BuilderError>` per the existing signature; the count is observable through the resulting world's agents.

- [ ] **Step 4: Pass tests, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/core/builder/index.ts src/core/builder/index.test.ts \
  tests/integration/builder-monster-templates.test.ts
git commit -m "spawning: publish initial-vs-republish branch and reset re-spawn"
```

---

## Task 15: Server functions for the admin UI (spec §"Architecture" → server functions)

**Files:**
- Create: `app/server/admin/templates.ts`
- Modify: `app/server/admin/entities.ts` (no — kept separate; templates have their own file).

- [ ] **Step 1: Implement `app/server/admin/templates.ts`**

```ts
// app/server/admin/templates.ts
import {
  deleteLocationSpawnTrigger as deleteTriggerCore,
  deleteMonsterTemplate as deleteTemplateCore,
  upsertLocationSpawnTrigger as upsertTriggerCore,
  upsertMonsterTemplate as upsertTemplateCore,
} from '@core/builder/index';
import type {
  UpsertLocationSpawnTriggerInput,
  UpsertMonsterTemplateInput,
} from '@core/domain/builder-types';
import {
  asLocationId,
  asMonsterTemplateId,
  asSpawnTriggerId,
  asWorldId,
} from '@core/domain/ids';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './repo';

export const upsertTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, payload }');
    return d as { worldId: string; payload: UpsertMonsterTemplateInput };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return upsertTemplateCore(repo, asWorldId(data.worldId), {
      ...data.payload,
      id: asMonsterTemplateId(data.payload.id as unknown as string),
    });
  });

export const deleteTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, id }');
    return d as { worldId: string; id: string };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return deleteTemplateCore(repo, asWorldId(data.worldId), asMonsterTemplateId(data.id));
  });

export const upsertTrigger = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, payload }');
    return d as { worldId: string; payload: UpsertLocationSpawnTriggerInput };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return upsertTriggerCore(repo, asWorldId(data.worldId), {
      ...data.payload,
      id: asSpawnTriggerId(data.payload.id as unknown as string),
      locationId: asLocationId(data.payload.locationId as unknown as string),
      templateId: asMonsterTemplateId(data.payload.templateId as unknown as string),
    });
  });

export const deleteTrigger = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null) throw new Error('Expected { worldId, id }');
    return d as { worldId: string; id: string };
  })
  .handler(async ({ data }) => {
    const repo = await getBuilderRepo();
    return deleteTriggerCore(repo, asWorldId(data.worldId), asSpawnTriggerId(data.id));
  });
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add app/server/admin/templates.ts
git commit -m "spawning: server functions for template + trigger CRUD"
```

---

## Task 16: MCP tools (spec §"Components" → MCP server)

**Files:**
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/server.test.ts` (smoke wiring)

- [ ] **Step 1: Add tool definitions**

```ts
// in src/mcp/tools.ts — append entries to TOOLS

import {
  deleteLocationSpawnTrigger,
  deleteMonsterTemplate,
  upsertLocationSpawnTrigger,
  upsertMonsterTemplate,
} from '@core/builder/index';
import { TriggerEventKind } from '@core/domain/builder-kinds';
import {
  asMonsterTemplateId,
  asSpawnTriggerId,
} from '@core/domain/ids';

  {
    name: 'list_monster_templates',
    description: 'List monster templates for a world (drafts only; live worlds are read-only via their parent draft).',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id') },
      required: ['worldId'],
    },
    run: async (repo, a) => repo.listMonsterTemplates(asWorldId(a.worldId as string)),
  },
  {
    name: 'list_location_spawn_triggers',
    description: 'List spawn triggers, optionally filtered by location.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        locationId: stringField('optional location filter'),
      },
      required: ['worldId'],
    },
    run: async (repo, a) =>
      repo.listLocationSpawnTriggers(
        asWorldId(a.worldId as string),
        a.locationId ? asLocationId(a.locationId as string) : undefined,
      ),
  },
  {
    name: 'upsert_monster_template',
    description: 'Create or update a monster template on a draft.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('template id'),
        templateKey: stringField('author-stable key, e.g. "goblin"'),
        label: stringField('label'),
        shortDescription: stringField('short description'),
        longDescription: stringField('long description'),
        hp: { type: 'number' },
        mood: { type: ['string', 'null'] },
        startingItems: { type: 'array' },
      },
      required: [
        'worldId', 'id', 'templateKey', 'label', 'shortDescription',
        'longDescription', 'hp', 'startingItems',
      ],
    },
    run: (repo, a) =>
      upsertMonsterTemplate(repo, asWorldId(a.worldId as string), {
        id: asMonsterTemplateId(a.id as string),
        templateKey: a.templateKey as string,
        label: a.label as string,
        shortDescription: a.shortDescription as string,
        longDescription: a.longDescription as string,
        hp: Number(a.hp),
        mood: (a.mood as string | null) ?? null,
        startingItems: (a.startingItems as never) ?? [],
      }),
  },
  {
    name: 'delete_monster_template',
    description: 'Delete a monster template from a draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('template id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteMonsterTemplate(
        repo,
        asWorldId(a.worldId as string),
        asMonsterTemplateId(a.id as string),
      ),
  },
  {
    name: 'upsert_location_spawn_trigger',
    description: 'Create or update a spawn trigger attached to a location on a draft.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: stringField('world id'),
        id: stringField('trigger id'),
        locationId: stringField('location id'),
        templateId: stringField('template id'),
        params: { type: 'object', description: 'TriggerParams discriminated union' },
        count: { type: 'number' },
        oneShot: { type: 'boolean' },
        fireOnInitialPublish: { type: 'boolean' },
      },
      required: [
        'worldId', 'id', 'locationId', 'templateId', 'params',
        'count', 'oneShot', 'fireOnInitialPublish',
      ],
    },
    run: (repo, a) =>
      upsertLocationSpawnTrigger(repo, asWorldId(a.worldId as string), {
        id: asSpawnTriggerId(a.id as string),
        locationId: asLocationId(a.locationId as string),
        templateId: asMonsterTemplateId(a.templateId as string),
        params: a.params as never,
        count: Number(a.count),
        oneShot: Boolean(a.oneShot),
        fireOnInitialPublish: Boolean(a.fireOnInitialPublish),
      }),
  },
  {
    name: 'delete_location_spawn_trigger',
    description: 'Delete a spawn trigger from a draft.',
    inputSchema: {
      type: 'object',
      properties: { worldId: stringField('world id'), id: stringField('trigger id') },
      required: ['worldId', 'id'],
    },
    run: (repo, a) =>
      deleteLocationSpawnTrigger(
        repo,
        asWorldId(a.worldId as string),
        asSpawnTriggerId(a.id as string),
      ),
  },
```

`reset_live_to_draft` remains intentionally NOT exposed (per spec §"Components" → MCP server).

- [ ] **Step 2: Smoke test wiring**

In `src/mcp/server.test.ts`, add one case that:
- Creates a draft via `create_draft`.
- Calls `upsert_monster_template` and asserts `ok: true`.
- Calls `upsert_location_spawn_trigger` (after creating a location) and asserts `ok: true`.
- Calls `list_monster_templates` and asserts the template is present.

- [ ] **Step 3: Run, pass, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test src/mcp/server.test.ts
git add src/mcp/tools.ts src/mcp/server.test.ts
git commit -m "spawning: MCP tools for template + trigger CRUD"
```

---

## Task 17: Admin UI — Bestiary node + per-location triggers (spec §"Components" → Admin UI; spec §"Decisions" #8)

**Files:**
- Modify: `app/routes/admin/$worldId.tsx`

- [ ] **Step 1: Add a "Bestiary" tree section under the world**

Templates are world-scoped (not location-scoped). Add a top-level node alongside the existing Locations group:

```tsx
// inside the tree render, after the existing Locations section
<section style={{ marginTop: 16 }}>
  <h3 style={{ fontSize: 12, opacity: 0.75 }}>Bestiary</h3>
  <ul>
    {t.templates.map((tpl) => (
      <li key={tpl.id}>
        <button
          type="button"
          onClick={() => setSel({ kind: EntityKind.MonsterTemplate, id: tpl.id as string })}
        >
          {tpl.label}
        </button>
        {dot(EntityKind.MonsterTemplate, tpl.id as string)}
      </li>
    ))}
    <li>
      <button type="button" onClick={() => setSel({ kind: EntityKind.MonsterTemplate, id: '' })}>
        + new template
      </button>
    </li>
  </ul>
</section>
```

- [ ] **Step 2: Nest triggers under their location**

In the existing per-location render (where exits, items, agents are listed), append a "Spawn triggers" sub-list filtered by `locationId`:

```tsx
{t.triggers
  .filter((trg) => trg.locationId === loc.id)
  .map((trg) => (
    <li key={trg.id}>
      <button
        type="button"
        onClick={() => setSel({ kind: EntityKind.LocationSpawnTrigger, id: trg.id as string })}
      >
        trigger: {trg.params.kind} → {trg.templateId}
      </button>
      {dot(EntityKind.LocationSpawnTrigger, trg.id as string)}
    </li>
  ))}
<li>
  <button
    type="button"
    onClick={() =>
      setSel({ kind: EntityKind.LocationSpawnTrigger, id: '' })
    }
  >
    + new trigger here
  </button>
</li>
```

- [ ] **Step 3: JSON-fallback editor for both kinds (per Decision 8)**

When `sel.kind === EntityKind.MonsterTemplate` or `EntityKind.LocationSpawnTrigger`, render a single `<textarea>` over the JSON payload with a Save button calling the appropriate `templates.ts` server function. No bespoke form fields.

- [ ] **Step 4: Run typecheck and commit**

```bash
pnpm typecheck && pnpm lint
git add app/routes/admin/'$worldId.tsx'
git commit -m "spawning: admin tree exposes bestiary and per-location triggers"
```

---

## Task 18: End-to-end tick test + final pass (spec §"Testing" → end-to-end)

**Files:**
- Create: `tests/integration/spawning-tick.test.ts`

- [ ] **Step 1: End-to-end tick test**

```ts
// tests/integration/spawning-tick.test.ts
// Build a draft with one location, one player, one monster template, and a
// one-shot PlayerEnters trigger (no fireOnInitialPublish). Publish initially
// (no spawn at publish). Move the player into the room — assert the goblin
// spawned and an AgentSpawned event was emitted. Move out and back in —
// assert no new spawn (oneShot fired).
```

Use `openDb(':memory:')` and the `SqliteBuilderRepository` plus the engine's `Repository` adapter, mirroring `tests/integration/builder-sqlite.test.ts` setup.

- [ ] **Step 2: Run, pass**

Run: `pnpm test tests/integration/spawning-tick.test.ts`
Expected: pass.

- [ ] **Step 3: Final full sweep**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: every command succeeds. Test count up by ~20–30 over the pre-slice baseline.

- [ ] **Step 4: README / project notes (optional, only if requested)**

The user may request a README section noting the bestiary feature; do not create unrequested docs files. If asked, append a short paragraph to the existing top-level README.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/spawning-tick.test.ts
git commit -m "spawning: end-to-end tick test for one-shot PlayerEnters trigger"
```

---

## Self-review

1. **Spec coverage walk:**
   - §Goal / §Scope — covered by Tasks 1–18.
   - §Decisions #1 (sidecar table) — Task 2.
   - §Decisions #2 (triggers per location) — Task 1 (types) + Task 2 (schema).
   - §Decisions #3 (spawned monster is just an agent) — Task 8 (`expandSpawn` produces normal `UpsertAgentInput`s) + Task 12 (writes via `engineRepo.upsertAgent`).
   - §Decisions #4 (initial publish vs re-publish) — Task 14.
   - §Decisions #5 (mechanical + judgement triggers) — Tasks 10 + 11.
   - §Decisions #6 (`TriggerEventKind`) — Task 1.
   - §Decisions #7 (per-tick caps) — Task 9 + Task 12.
   - §Decisions #8 (UI deferred / JSON fallback) — Task 17.
   - §Architecture diagram — Tasks 12 + 13 + 14 (the publish + tick branches).
   - §Schema (`monster_templates`, `location_spawn_triggers`, snapshot extension) — Task 2 + Task 5 (snapshot extension).
   - §Components → expand.ts — Task 8.
   - §Components → triggers.ts mechanical — Task 10.
   - §Components → triggers.ts judgement — Task 11.
   - §Components → tickPass.ts — Task 12.
   - §Components → builder facade — Task 7.
   - §Components → validate.ts — Task 6.
   - §Components → MCP server — Task 16.
   - §Components → Admin UI — Task 17.
   - §Data flow → authoring — Tasks 7 + 15 + 16.
   - §Data flow → publish (initial + re-publish) — Task 14.
   - §Data flow → tick spawn pass — Tasks 12 + 13.
   - §Data flow → reset live to draft — Task 14.
   - §Trigger evaluation details (`TriggerParams` discriminated union, dispatcher table) — Tasks 1 + 6 + 10 + 11.
   - §Item starter packs — Task 1 (`StarterPackEntry` tagged union); v1 expand path keeps `damage`/`defense`/`capacity` defaults (the inline starter-pack rows are stored on the template but the engine-side item insert is *not yet wired* — see §Out of scope which keeps loot tables out; for v1 the field round-trips through publish but the per-instance item rows are added in a follow-up. **This is intentionally simplified relative to the suggested decomposition** — see "Intentional simplifications" below.)
   - §Error handling — Tasks 11 (LLM failure → log + skip), 14 (publish atomicity).
   - §Integrity invariants 6–13 — Task 7 (`requireDraft`), Task 9 (caps), Task 12 (cap enforcement), Task 14 (one-shot semantics across publish + tick).
   - §Testing checklist — Tasks 6, 8, 10, 11, 12, 14, 16, 18.
   - §Migration — Task 2; `triggerFireState` default is provided by `readTriggerFireState` in Task 5.

2. **Placeholders:** none (the `as never` cast in Task 12 step 2 is annotated as the only loose thread, with explicit guidance to resolve it by reading `src/core/engine/repository.ts`).

3. **Type-name consistency:** `MonsterTemplate`, `LocationSpawnTrigger`, `TriggerParams`, `TriggerFireState`, `UpsertMonsterTemplateInput`, `UpsertLocationSpawnTriggerInput`, `MonsterTemplateId`, `SpawnTriggerId`, `StarterPackEntry`, `TriggerEventKind`, `TriggerHit`, `JudgementResult`, `PerceptionView` — used identically across Tasks 1, 3, 4, 5, 6, 7, 8, 10, 11, 12.

### Intentional simplifications relative to the suggested decomposition

- **Starter-pack expansion deferred to a follow-up slice (within the v1 task list).** The spec's §"Item starter packs" calls out v1 storage but defers loot tables; the plan stores `startingItems` on templates and round-trips them through publish, but `expandSpawn` does not yet emit `items` rows for the spawned agent. Reason: keeping Task 8 narrowly testable; adding item inserts requires either an engine-repo `upsertItem` call inside `runSpawnTickPass` (a layering question for which the spec is silent) or a parallel pure expander. A follow-up task can add this once the per-instance ownership semantics are nailed down. **If the reviewer wants this in v1, add it as a sub-step to Task 8 with a corresponding test.**
- **HTTP API is *not* extended.** The campaign-builder spec already deferred the HTTP API; the monster-templates spec doesn't reverse that. Server functions (Task 15) and MCP (Task 16) cover the two live consumers.
- **The 18-task split adds two tasks beyond the suggested 18** — actually, it stays at 18 by collapsing "register `EventKind.AgentSpawned`" into Task 1 and "narration helper" into Task 13.

### Spec items not mapped to a task

None. Every requirement traces to at least one task above.
