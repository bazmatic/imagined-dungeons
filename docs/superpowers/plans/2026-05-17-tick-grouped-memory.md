# Tick-Grouped NPC Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group NPC memory events by game tick in the LLM prompt so the NPC understands temporal structure — "This turn", "Last turn", "Two turns ago", etc. — with the location where each group of events occurred.

**Architecture:** Add `tickCount` (world counter) and `tickId`/`locationLabel` (per-event stamp) to the DB schema. `SqliteRepository` stores the current tick in private instance state after `incrementTickCount()` is called and stamps it on every subsequent `appendEvent` call. `runTick` calls `incrementTickCount` at the very start. `buildUserPrompt` in `npc-mind.ts` groups and labels the returned events before rendering the memory section.

**Tech Stack:** Drizzle ORM + better-sqlite3, TypeScript `as const` objects (per project CLAUDE.md rules), Vitest integration tests

---

## File Map

| File | Change |
|------|--------|
| `src/infra/schema.ts` | Add `tickCount` to worlds, `tickId` + `locationLabel` to events |
| `drizzle/` | Generated migration (0021_*) |
| `src/core/domain/events.ts` | Add `tickId?` and `locationLabel?` to `BaseEvent` |
| `src/core/engine/repository.ts` | Add `incrementTickCount(): Promise<number>` to `Repository` |
| `src/infra/sqlite-repository.ts` | Add private `currentTickId`, implement `incrementTickCount`, update `appendEvent` + `recentEvents` |
| `src/infra/sqlite-repository-tick.test.ts` | Integration tests for incrementTickCount + appendEvent stamping |
| `src/core/engine/tick.ts` | Call `repo.incrementTickCount()` at start of `runTick` |
| `src/core/engine/npc-mind.ts` | Add `maxTurnDepth` to `NpcMindOptions`, `TICK_LABEL` constant, grouping logic in `buildUserPrompt` |
| `src/core/engine/npc-mind.test.ts` | Tests for tick-grouped prompt rendering |

---

## Task 1: Schema additions and migration

**Files:**
- Modify: `src/infra/schema.ts`
- Create: `drizzle/0021_*.sql` (generated)

- [ ] **Step 1: Add `tickCount` to worlds table in schema.ts**

In `src/infra/schema.ts`, find the `worlds` table definition (currently ends with `coverImageUrl`) and add the new column:

```ts
export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  rngSeed: integer('rng_seed').notNull().default(1),
  kind: text('kind', { enum: ['draft', 'live'] })
    .notNull()
    .default('live'),
  parentDraftId: text('parent_draft_id'),
  displayName: text('display_name').notNull().default(''),
  playerAgentId: text('player_agent_id'),
  coverImageUrl: text('cover_image_url'),
  tickCount: integer('tick_count').notNull().default(0),
});
```

- [ ] **Step 2: Add `tickId` and `locationLabel` to events table in schema.ts**

Find the `events` table definition (currently ends with `narrations`) and add two nullable columns:

```ts
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  worldId: text('world_id')
    .notNull()
    .references(() => worlds.id),
  actorId: text('actor_id').notNull(),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  witnesses: text('witnesses', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  narrations: text('narrations', { mode: 'json' }),
  tickId: integer('tick_id'),
  locationLabel: text('location_label'),
});
```

- [ ] **Step 3: Generate migration**

```bash
pnpm drizzle-kit generate
```

Expected: one new file created at `drizzle/0021_*.sql` containing:
```sql
ALTER TABLE `worlds` ADD `tick_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `tick_id` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `location_label` text;
```

(Exact file name and SQL syntax may vary slightly — verify the file exists and contains all three ALTER TABLE statements.)

- [ ] **Step 4: Verify migration runs cleanly**

```bash
pnpm vitest run --reporter=verbose src/infra/sqlite-npc-decision-repository.test.ts
```

Expected: all 5 tests pass (the migration is applied fresh in this integration test, so it validates the migration SQL).

- [ ] **Step 5: Commit**

```bash
git add src/infra/schema.ts drizzle/
git commit -m "feat(schema): add tickCount to worlds, tickId + locationLabel to events"
```

---

## Task 2: BaseEvent type additions

**Files:**
- Modify: `src/core/domain/events.ts`

- [ ] **Step 1: Add tickId and locationLabel to BaseEvent**

In `src/core/domain/events.ts`, update the `BaseEvent` interface (lines 9–17):

```ts
export interface BaseEvent {
  readonly id: EventId;
  readonly worldId: WorldId;
  readonly actorId: AgentId;
  readonly kind: EventKind;
  readonly witnesses: readonly AgentId[];
  readonly createdAt: Date;
  readonly narrations?: Readonly<Record<string, string>>;
  readonly tickId?: number | null;
  readonly locationLabel?: string | null;
}
```

`?` makes these optional so all existing event construction (handlers, tests, etc.) compiles without changes. The infrastructure layer always supplies them when reading from DB.

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors. All existing event constructors omit `tickId` and `locationLabel` — that's valid for optional fields.

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/events.ts
git commit -m "feat(events): add optional tickId and locationLabel to BaseEvent"
```

---

## Task 3: Repository interface

**Files:**
- Modify: `src/core/engine/repository.ts`

- [ ] **Step 1: Add incrementTickCount to Repository**

In `src/core/engine/repository.ts`, add the method to `Repository` (not `HandlerRepo` — this is a scheduler-only concern):

```ts
/** Full repository contract. Extends HandlerRepo with scheduler-only methods. */
export interface Repository extends HandlerRepo {
  /** Every agent in the world (used by the scheduler to tick offstage NPCs). */
  allAgents(): Promise<readonly Agent[]>;
  /**
   * Atomically increments the world tick counter, stores the new value
   * internally for use by appendEvent, and returns it.
   * Must be called once at the start of each runTick before any appendEvent calls.
   */
  incrementTickCount(): Promise<number>;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: one error — `SqliteRepository` doesn't implement `incrementTickCount` yet. Confirm the error mentions `sqlite-repository.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/repository.ts
git commit -m "feat(repository): add incrementTickCount to Repository interface"
```

---

## Task 4: SqliteRepository implementation + tests

**Files:**
- Modify: `src/infra/sqlite-repository.ts`
- Create: `src/infra/sqlite-repository-tick.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/infra/sqlite-repository-tick.test.ts`:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asAgentId, asEventId, asWorldId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import * as schema from './schema';
import { SqliteRepository } from './sqlite-repository';

function openTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = OFF');
  return { db, close: () => sqlite.close() };
}

const W = asWorldId('world_test');
const LOC_ID = 'loc_tavern';
const AGENT_ID = asAgentId('char_spark');

async function seedWorld(db: ReturnType<typeof openTestDb>['db']) {
  await db.insert(schema.worlds).values({
    id: W,
    label: 'Test World',
    rngSeed: 1,
    kind: 'live',
    displayName: 'Test',
  });
  await db.insert(schema.locations).values({
    id: LOC_ID,
    worldId: W,
    label: 'The Tavern',
    shortDescription: 'A cosy inn.',
    longDescription: 'A cosy inn with a roaring fire.',
    secretDescription: '',
  });
  await db.insert(schema.agents).values({
    id: AGENT_ID,
    worldId: W,
    label: 'Spark',
    shortDescription: 'a halfling',
    longDescription: '',
    locationId: LOC_ID,
    hp: 10,
    damage: 1,
    defense: 10,
    capacity: 10,
    autonomous: true,
    awake: true,
    gold: 0,
    secretDescription: '',
  });
}

describe('SqliteRepository — tick counter', () => {
  let handle: ReturnType<typeof openTestDb>;
  let repo: SqliteRepository;

  beforeEach(async () => {
    handle = openTestDb();
    repo = new SqliteRepository(handle.db, W);
    await seedWorld(handle.db);
  });

  afterEach(() => handle.close());

  it('returns 1 on first call', async () => {
    expect(await repo.incrementTickCount()).toBe(1);
  });

  it('increments monotonically across calls', async () => {
    expect(await repo.incrementTickCount()).toBe(1);
    expect(await repo.incrementTickCount()).toBe(2);
    expect(await repo.incrementTickCount()).toBe(3);
  });

  it('stamps tickId and locationLabel on events after incrementTickCount', async () => {
    await repo.incrementTickCount(); // tick 1
    await repo.appendEvent({
      id: asEventId('evt_001'),
      worldId: W,
      actorId: AGENT_ID,
      kind: EventKind.Inventory,
      witnesses: [],
      createdAt: new Date(),
    });

    // Query all events — only one row exists in this test
    const rows = await handle.db.select().from(schema.events);
    const row = rows[0];
    expect(row?.tickId).toBe(1);
    expect(row?.locationLabel).toBe('The Tavern');
  });

  it('stamps null tickId and null locationLabel before incrementTickCount is called', async () => {
    await repo.appendEvent({
      id: asEventId('evt_002'),
      worldId: W,
      actorId: AGENT_ID,
      kind: EventKind.Inventory,
      witnesses: [],
      createdAt: new Date(),
    });

    const rows = await handle.db.select().from(schema.events);
    const row = rows[0];
    expect(row?.tickId).toBeNull();
    expect(row?.locationLabel).toBeNull();
  });

  it('recentEvents maps tickId and locationLabel', async () => {
    await repo.incrementTickCount(); // tick 1
    await repo.appendEvent({
      id: asEventId('evt_003'),
      worldId: W,
      actorId: AGENT_ID,
      kind: EventKind.Inventory,
      witnesses: [],
      createdAt: new Date(),
    });
    const events = await repo.recentEvents(10);
    expect(events[0]?.tickId).toBe(1);
    expect(events[0]?.locationLabel).toBe('The Tavern');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run --reporter=verbose src/infra/sqlite-repository-tick.test.ts
```

Expected: errors because `incrementTickCount` doesn't exist yet.

- [ ] **Step 3: Implement incrementTickCount and update appendEvent/recentEvents**

In `src/infra/sqlite-repository.ts`:

**a) Add `sql` to the drizzle-orm import** (line 17):
```ts
import { and, eq, sql } from 'drizzle-orm';
```

**b) Add `currentTickId` private field to `SqliteRepository`** (after the constructor, before `getWorldId`):
```ts
export class SqliteRepository implements Repository {
  constructor(
    private readonly db: DB,
    private readonly worldId: WorldId,
  ) {}

  private currentTickId: number | null = null;

  async getWorldId(): Promise<WorldId> {
    // ... unchanged
  }
```

**c) Add `incrementTickCount` method** (after `allAgents`):
```ts
async incrementTickCount(): Promise<number> {
  await this.db
    .update(schema.worlds)
    .set({ tickCount: sql`${schema.worlds.tickCount} + 1` })
    .where(eq(schema.worlds.id, this.worldId));
  const rows = await this.db
    .select({ tickCount: schema.worlds.tickCount })
    .from(schema.worlds)
    .where(eq(schema.worlds.id, this.worldId));
  const count = rows[0]?.tickCount;
  if (count === undefined) throw new Error(`world not found: ${this.worldId}`);
  this.currentTickId = count;
  return count;
}
```

**d) Replace `appendEvent`** (currently at line 262):
```ts
async appendEvent(event: DomainEvent): Promise<void> {
  const { id, worldId, actorId, kind, witnesses, createdAt, narrations, ...rest } = event;
  let locationLabel: string | null = null;
  if (this.currentTickId !== null) {
    try {
      const rows = await this.db
        .select({ label: schema.locations.label })
        .from(schema.agents)
        .innerJoin(
          schema.locations,
          and(
            eq(schema.locations.id, schema.agents.locationId),
            eq(schema.locations.worldId, schema.agents.worldId),
          ),
        )
        .where(and(eq(schema.agents.worldId, this.worldId), eq(schema.agents.id, actorId)));
      locationLabel = rows[0]?.label ?? null;
    } catch {
      // best-effort: leave null if agent or location not found
    }
  }
  await this.db.insert(schema.events).values({
    id,
    worldId,
    actorId,
    kind,
    witnesses: [...witnesses],
    createdAt,
    payload: rest,
    narrations: narrations ? { ...narrations } : null,
    tickId: this.currentTickId,
    locationLabel,
  });
}
```

**e) Update `recentEvents` return mapping** (currently at line 344) — change the map callback to include the new fields:
```ts
return slice.map((r) => {
  const narrations = r.narrations as Record<string, string> | null;
  const payload = migratePayload(r.kind as DomainEvent['kind'], r.payload as object);
  return {
    id: asEventId(r.id),
    worldId: this.worldId,
    actorId: asAgentId(r.actorId),
    kind: r.kind as DomainEvent['kind'],
    witnesses: (r.witnesses as string[]).map(asAgentId),
    createdAt: r.createdAt,
    tickId: r.tickId ?? null,
    locationLabel: r.locationLabel ?? null,
    ...(narrations ? { narrations } : {}),
    ...payload,
  } as DomainEvent;
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run --reporter=verbose src/infra/sqlite-repository-tick.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
pnpm vitest run
```

Expected: all tests pass (the new optional fields don't break existing event construction or reading).

- [ ] **Step 6: Commit**

```bash
git add src/infra/sqlite-repository.ts src/infra/sqlite-repository-tick.test.ts
git commit -m "feat(sqlite-repo): add incrementTickCount, stamp tickId + locationLabel on appendEvent"
```

---

## Task 5: Tick runner

**Files:**
- Modify: `src/core/engine/tick.ts`

- [ ] **Step 1: Call incrementTickCount at the top of runTick**

In `src/core/engine/tick.ts`, find `runTick` (line 412). Add `await repo.incrementTickCount()` as the very first statement in the function body — before the `discoveryBudget` setup, before any event emission:

```ts
export async function runTick(
  playerId: AgentId,
  text: string,
  repo: Repository,
  opts: RunTickOptions,
): Promise<TickResult> {
  await repo.incrementTickCount();

  const { parse, ai, llm } = opts;
  const cap = opts.npcCap ?? MAX_NPCS_PER_TICK;
  // ... rest unchanged
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tick tests**

```bash
pnpm vitest run --reporter=verbose src/core/engine/tick.test.ts
```

Expected: all tests pass.

> **Note:** `tick.test.ts` uses `MemoryRepository` (not `SqliteRepository`), so it doesn't have `incrementTickCount`. Check whether `MemoryRepository` already implements it or if it needs a stub. If tests fail with "incrementTickCount is not a function", add a stub to `src/infra/memory-repository.ts`:
> ```ts
> async incrementTickCount(): Promise<number> { return 0; }
> ```

- [ ] **Step 4: Run full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine/tick.ts
git commit -m "feat(tick): call repo.incrementTickCount() at start of runTick"
```

---

## Task 6: buildUserPrompt grouping in npc-mind.ts + tests

**Files:**
- Modify: `src/core/engine/npc-mind.ts`
- Modify: `src/core/engine/npc-mind.test.ts`

- [ ] **Step 1: Read the existing npc-mind.test.ts to understand the test infrastructure**

```bash
cat src/core/engine/npc-mind.test.ts
```

Note the pattern: `MemoryRepository` seeded with agents/locations/events, `makeFakeLanguageModel` from `tests/helpers/fake-language-model`, `decideNpcIntent` called with the fake LLM.

- [ ] **Step 2: Write failing tests for the new grouping behaviour**

Add to `src/core/engine/npc-mind.test.ts`. Find the existing imports block and locate where new test cases should go. Add a new `describe` block for the tick-grouped memory feature. Here's the full test block to add:

```ts
import { asEventId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
```

(Add these imports if not already present at the top of the file.)

Then add this describe block at the bottom of the file:

```ts
describe('decideNpcIntent — tick-grouped memory prompt', () => {
  const makeFakeLlm = (capturedPrompts: string[]) => ({
    completeText: async ({ user }: { system: string; user: string }) => {
      capturedPrompts.push(user);
      return 'I wait.';
    },
    complete: async () => ({ raw: '', parsed: {} }),
  });

  function makeEvent(
    id: string,
    tickId: number | null,
    locationLabel: string | null,
    actorId = SPARK_ID,
  ) {
    return {
      id: asEventId(id),
      worldId: W,
      actorId,
      kind: EventKind.Inventory,
      witnesses: [SPARK_ID],
      createdAt: new Date(Date.now() + Number(id.replace(/\D/g, ''))),
      tickId,
      locationLabel,
    } as const;
  }

  it('renders single tick group as "This turn" block', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([makeEvent('e1', 7, 'Town Hall')]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeFakeLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).toContain('What you have witnessed, oldest to most recent:');
    expect(captured[0]).toContain('This turn — Town Hall:');
    expect(captured[0]).not.toContain('What you have witnessed recently:');
  });

  it('renders multiple groups oldest-first with correct labels', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([
      makeEvent('e1', 5, 'Market'),   // two turns ago
      makeEvent('e2', 6, 'Alley'),    // last turn
      makeEvent('e3', 7, 'Tavern'),   // this turn
    ]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeFakeLlm(captured) as any, { memoryLimit: 8 });
    const prompt = captured[0] ?? '';
    const twoIdx = prompt.indexOf('Two turns ago — Market:');
    const lastIdx = prompt.indexOf('Last turn — Alley:');
    const thisIdx = prompt.indexOf('This turn — Tavern:');
    expect(twoIdx).toBeGreaterThan(-1);
    expect(lastIdx).toBeGreaterThan(twoIdx);
    expect(thisIdx).toBeGreaterThan(lastIdx);
  });

  it('renders null-tickId events under "Earlier:"', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([makeEvent('e1', null, null)]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeFakeLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).toContain('Earlier:');
  });

  it('caps groups to maxTurnDepth, keeping the most recent', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([
      makeEvent('e1', 1, 'Place A'),
      makeEvent('e2', 2, 'Place B'),
      makeEvent('e3', 3, 'Place C'),
      makeEvent('e4', 4, 'Place D'),
    ]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeFakeLlm(captured) as any, {
      memoryLimit: 8,
      maxTurnDepth: 2,
    });
    const prompt = captured[0] ?? '';
    expect(prompt).not.toContain('Place A');
    expect(prompt).not.toContain('Place B');
    expect(prompt).toContain('Place C');
    expect(prompt).toContain('Place D');
  });

  it('omits memory section entirely when memory is empty', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    // No events seeded
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeFakeLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).not.toContain('What you have witnessed');
  });

  it('omits location from header when locationLabel is null', async () => {
    const repo = new MemoryRepository(W);
    repo.seed({ locations: [loc], agents: [spark], items: [], exits: [] });
    repo.seedEvents([makeEvent('e1', 7, null)]);
    const captured: string[] = [];
    await decideNpcIntent(SPARK_ID, repo, makeFakeLlm(captured) as any, { memoryLimit: 8 });
    expect(captured[0]).toContain('This turn:');
    expect(captured[0]).not.toContain('This turn — ');
  });
});
```

> **Note:** `MemoryRepository` must support `seedEvents`. Check `src/infra/memory-repository.ts` — if `seedEvents` doesn't exist, add it. Also check that `MemoryRepository.recentEvents` returns events with `tickId` and `locationLabel` from whatever was seeded. You may need to update `MemoryRepository` to pass these fields through.

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm vitest run --reporter=verbose src/core/engine/npc-mind.test.ts
```

Expected: new tests fail because the old "What you have witnessed recently:" text is still there.

- [ ] **Step 4: Add TICK_LABEL constant and DEFAULT_MAX_TURN_DEPTH to npc-mind.ts**

In `src/core/engine/npc-mind.ts`, find the `DEFAULT_MEMORY_LIMIT` constant (line 488) and add after it:

```ts
const DEFAULT_MEMORY_LIMIT = 8;
const DEFAULT_MAX_TURN_DEPTH = 5;

const TICK_LABEL: Readonly<Record<number, string>> = {
  0: 'This turn',
  1: 'Last turn',
  2: 'Two turns ago',
  3: 'Three turns ago',
};
```

- [ ] **Step 5: Add maxTurnDepth to NpcMindOptions**

Find `NpcMindOptions` (line 481) and add the new field:

```ts
export interface NpcMindOptions {
  readonly memoryLimit?: number;
  readonly maxTurnDepth?: number;
  readonly decisionRepo?: NpcDecisionRepository | null;
}
```

- [ ] **Step 6: Update buildUserPrompt signature to accept opts**

Change the function signature (line 367):

```ts
async function buildUserPrompt(
  ctx: NpcMindContext,
  selfId: AgentId,
  repo: HandlerRepo,
  opts: Pick<NpcMindOptions, 'maxTurnDepth'>,
): Promise<UserPromptResult>
```

Update the call site in `decideNpcIntent` (currently line 523):

```ts
const { prompt: userPrompt, baseSnapshot } = await buildUserPrompt(ctx, actorId, repo, opts);
```

- [ ] **Step 7: Replace the flat memory rendering block with grouped rendering**

In `buildUserPrompt`, find the memory section (currently lines 445–454):

```ts
  const memorySummaries: string[] = [];
  if (memory.length > 0) {
    lines.push('');
    lines.push('What you have witnessed recently:');
    for (const m of memory) {
      const summary = await summariseEvent(m, selfId, repo);
      memorySummaries.push(summary);
      lines.push(`- ${summary}`);
    }
  }
```

Replace with:

```ts
  const memorySummaries: string[] = [];
  if (memory.length > 0) {
    const maxDepth = opts.maxTurnDepth ?? DEFAULT_MAX_TURN_DEPTH;

    // Group events by tickId. null key = pre-migration or unstamped.
    const groupMap = new Map<number | null, DomainEvent[]>();
    for (const m of memory) {
      const key = m.tickId ?? null;
      const bucket = groupMap.get(key);
      if (bucket) bucket.push(m);
      else groupMap.set(key, [m]);
    }

    // Sort oldest-first: null group comes first, then ascending tickId.
    const sorted: Array<[number | null, DomainEvent[]]> = [];
    if (groupMap.has(null)) sorted.push([null, groupMap.get(null)!]);
    const tickIds = [...groupMap.keys()]
      .filter((k): k is number => k !== null)
      .sort((a, b) => a - b);
    for (const tid of tickIds) sorted.push([tid, groupMap.get(tid)!]);

    // Keep at most maxDepth groups, dropping the oldest.
    const capped = sorted.length > maxDepth ? sorted.slice(sorted.length - maxDepth) : sorted;
    const n = capped.length;

    lines.push('');
    lines.push('What you have witnessed, oldest to most recent:');
    for (let i = 0; i < n; i++) {
      const [key, events] = capped[i]!;
      const distFromEnd = n - 1 - i;
      const timeLabel =
        key === null ? 'Earlier' : (TICK_LABEL[distFromEnd] ?? `${distFromEnd} turns ago`);
      const locLabel = events[0]?.locationLabel;
      const header = locLabel ? `${timeLabel} — ${locLabel}:` : `${timeLabel}:`;
      lines.push('');
      lines.push(header);
      for (const m of events) {
        const summary = await summariseEvent(m, selfId, repo);
        memorySummaries.push(summary);
        lines.push(`- ${summary}`);
      }
    }
  }
```

- [ ] **Step 8: Run npc-mind tests**

```bash
pnpm vitest run --reporter=verbose src/core/engine/npc-mind.test.ts
```

Expected: all tests pass including the new tick-grouping tests.

- [ ] **Step 9: Run full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 10: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/core/engine/npc-mind.ts src/core/engine/npc-mind.test.ts
git commit -m "feat(npc-mind): group memory events by tick with relative time labels"
```

---

## Post-implementation checklist

- [ ] **Run full test suite one final time:**
  ```bash
  pnpm vitest run
  ```
  Expected: all tests pass.

- [ ] **Type-check:**
  ```bash
  pnpm tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Smoke test in dev:** Start the dev server (`pnpm dev`) and run a few player turns. After 4+ turns, open an NPC's Sensorium tab and verify the "What you have witnessed" section in the raw prompt shows grouped tick headers. Also verify existing game behaviour is unchanged.

---

## Implementation notes for the subagent

### No string literals in logic

Per `CLAUDE.md`: do **not** use raw string literals in switch cases, comparisons, or dispatch keys. Use `as const` objects and derived types. Display strings ("This turn", "Last turn") rendered into the prompt are **not** logic — they are UI text. The `TICK_LABEL` record is a lookup table, not a switch discriminant; this is fine.

### MemoryRepository compatibility

The tests use `MemoryRepository` (an in-memory implementation used in unit tests). Check `src/infra/memory-repository.ts`:
- If `seedEvents` exists: verify it stores `tickId` and `locationLabel` and that `recentEvents` returns them.
- If `seedEvents` doesn't exist: add it.
- Also add `incrementTickCount(): Promise<number> { return Promise.resolve(0); }` as a stub if not present.

### appendEvent: location label on synthetic events

Some events use `SYSTEM_AGENT_ID` as the actorId (consequence engine). The location JOIN will fail to find this agent (it's synthetic). The `try/catch` in `appendEvent` handles this gracefully — `locationLabel` remains `null` for system-actor events. That's correct behaviour.

### Migration snapshot

If `drizzle-kit generate` complains about missing meta snapshots, check `drizzle/meta/_journal.json` and compare against `drizzle/meta/*_snapshot.json`. The latest snapshot should be `0020_snapshot.json`. If a newer snapshot is missing, create it by running `pnpm drizzle-kit generate` on a clean schema (without the new columns) first to regenerate, then re-add the columns and generate again. Alternatively, check the pattern from `drizzle/meta/0020_snapshot.json` and create the 0021 snapshot manually if needed.
