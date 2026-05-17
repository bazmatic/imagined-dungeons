# Sensorium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sensorium tab to every agent in the admin UI that shows the structured context used for each NPC decision, with a scrollable history of the last 20 decisions.

**Architecture:** A new `npc_decisions` SQLite table stores structured snapshots plus raw prompts after each NPC decision. The repository port lives in `src/core/engine/`; the SQLite implementation in `src/infra/`. The engine is instrumented via an optional `decisionRepo` field on `NpcMindOptions`, injected at the composition roots. The admin UI adds a Profile/Sensorium tab bar on the agent detail view; the Sensorium tab fetches history lazily on mount.

**Tech Stack:** TypeScript, Drizzle ORM (better-sqlite3), TanStack Router/Start (`createServerFn`), React, Vitest.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/domain/npc-decision.ts` | **Create** | Shared types: `DecisionSnapshot`, `RawPrompt`, `NpcDecision`; constant `DECISION_HISTORY_LIMIT` |
| `src/core/engine/npc-decision-repository.ts` | **Create** | `NpcDecisionRepository` interface (port) |
| `src/infra/schema.ts` | **Modify** | Add `npcDecisions` table definition |
| `src/infra/sqlite-npc-decision-repository.ts` | **Create** | SQLite implementation of the port |
| `src/infra/sqlite-npc-decision-repository.test.ts` | **Create** | Vitest integration tests |
| `src/core/engine/npc-mind.ts` | **Modify** | Add `decisionRepo` to `NpcMindOptions`; refactor `buildUserPrompt` to return structured data; build and save snapshot |
| `src/core/engine/tick.ts` | **Modify** | Add `decisionRepo` to `RunTickOptions`; thread it to `ai.npcIntent()` |
| `app/server/admin/repo.ts` | **Modify** | Export `getAdminDb()` for sensorium server function |
| `app/server/admin/sensorium.ts` | **Create** | `getNpcDecisions` server function |
| `app/server/world.ts` | **Modify** | Export `getDb()` for direct DB access |
| `app/routes/api/stream-command.ts` | **Modify** | Instantiate `SqliteNpcDecisionRepository`; pass to `runTick` |
| `app/server/submit.ts` | **Modify** | Same as stream-command.ts |
| `app/routes/admin/-components/AgentTabs.tsx` | **Create** | Profile/Sensorium tab bar; owns tab state |
| `app/routes/admin/-components/SensoriumSection.tsx` | **Create** | Reusable collapsible section with `defaultOpen` prop |
| `app/routes/admin/-components/SensoriumDecisionList.tsx` | **Create** | Left panel: scrollable decision history |
| `app/routes/admin/-components/SensoriumDecisionDetail.tsx` | **Create** | Right panel: renders one `NpcDecision` using `SensoriumSection` |
| `app/routes/admin/-components/SensoriumTab.tsx` | **Create** | Two-panel layout; fetches decisions on mount |
| `app/routes/admin/-components/CategoryRouter.tsx` | **Modify** | Wrap `AgentForm` in `AgentTabs` for the Agents category |

---

## Task 1: Shared domain types

**Files:**
- Create: `src/core/domain/npc-decision.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/core/domain/npc-decision.ts

export const DECISION_HISTORY_LIMIT = 20;

export interface DecisionSnapshot {
  readonly agentState: {
    readonly mood: string | null;
    readonly goal: string | null;
    readonly shortTermIntent: string | null;
  };
  readonly perception: {
    readonly locationLabel: string;
    readonly locationDescription: string;
    readonly visibleItems: string[];
    readonly visibleAgents: ReadonlyArray<{ label: string; mood?: string }>;
    readonly exits: ReadonlyArray<{ direction: string; label: string; locked: boolean }>;
    readonly inventory: string[];
    readonly unansweredAddresses: string[];
  };
  readonly memory: string[];
  readonly response: {
    readonly rawText: string;
    readonly thought: string | null;
    readonly intentBefore: string | null;
    readonly intentAfter: string | null;
    readonly actions: string[];
  };
  readonly fallback: boolean;
}

export interface RawPrompt {
  readonly system: string;
  readonly user: string;
}

export interface NpcDecision {
  readonly id: number;
  readonly worldId: string;
  readonly agentId: string;
  readonly createdAt: Date;
  readonly snapshot: DecisionSnapshot;
  readonly rawPrompt: RawPrompt;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/npc-decision.ts
git commit -m "feat(sensorium): add shared NpcDecision domain types"
```

---

## Task 2: Repository port

**Files:**
- Create: `src/core/engine/npc-decision-repository.ts`

- [ ] **Step 1: Create the interface**

```typescript
// src/core/engine/npc-decision-repository.ts
import type { DecisionSnapshot, NpcDecision, RawPrompt } from '@core/domain/npc-decision';

/**
 * Persistence port for NPC decision snapshots.
 * Implemented by SqliteNpcDecisionRepository (production)
 * and a test double in integration tests.
 */
export interface NpcDecisionRepository {
  save(
    worldId: string,
    agentId: string,
    snapshot: DecisionSnapshot,
    rawPrompt: RawPrompt,
  ): Promise<void>;

  /** Returns up to DECISION_HISTORY_LIMIT decisions, newest first. */
  list(worldId: string, agentId: string): Promise<NpcDecision[]>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/npc-decision-repository.ts
git commit -m "feat(sensorium): add NpcDecisionRepository port"
```

---

## Task 3: Database schema

**Files:**
- Modify: `src/infra/schema.ts`

- [ ] **Step 1: Add the npcDecisions table to the schema**

In `src/infra/schema.ts`, after the existing `events` table definition, add:

```typescript
export const npcDecisions = sqliteTable('npc_decisions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  worldId:   text('world_id').notNull(),
  agentId:   text('agent_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  snapshot:  text('snapshot',   { mode: 'json' }).$type<import('@core/domain/npc-decision').DecisionSnapshot>().notNull(),
  rawPrompt: text('raw_prompt', { mode: 'json' }).$type<import('@core/domain/npc-decision').RawPrompt>().notNull(),
});
```

- [ ] **Step 2: Generate the migration**

```bash
npx drizzle-kit generate --config drizzle.config.ts
```

Expected: a new file created at `drizzle/XXXX_sensorium_npc_decisions.sql` containing a `CREATE TABLE npc_decisions` statement.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/infra/schema.ts drizzle/
git commit -m "feat(sensorium): add npc_decisions schema and migration"
```

---

## Task 4: SQLite implementation and tests

**Files:**
- Create: `src/infra/sqlite-npc-decision-repository.ts`
- Create: `src/infra/sqlite-npc-decision-repository.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/infra/sqlite-npc-decision-repository.test.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DecisionSnapshot, RawPrompt } from '@core/domain/npc-decision';
import { DECISION_HISTORY_LIMIT } from '@core/domain/npc-decision';
import * as schema from './schema';
import { SqliteNpcDecisionRepository } from './sqlite-npc-decision-repository';

const WORLD = 'w1';
const AGENT = 'a1';

const snapshot = (label: string): DecisionSnapshot => ({
  agentState: { mood: null, goal: null, shortTermIntent: null },
  perception: {
    locationLabel: label,
    locationDescription: '',
    visibleItems: [],
    visibleAgents: [],
    exits: [],
    inventory: [],
    unansweredAddresses: [],
  },
  memory: [],
  response: {
    rawText: 'wait',
    thought: null,
    intentBefore: null,
    intentAfter: null,
    actions: ['wait'],
  },
  fallback: false,
});

const prompt = (): RawPrompt => ({ system: 'sys', user: 'usr' });

function openTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return { db, close: () => sqlite.close() };
}

describe('SqliteNpcDecisionRepository', () => {
  let handle: ReturnType<typeof openTestDb>;
  let repo: SqliteNpcDecisionRepository;

  beforeEach(() => {
    handle = openTestDb();
    repo = new SqliteNpcDecisionRepository(handle.db);
  });

  afterEach(() => {
    handle.close();
  });

  it('saves a decision and retrieves it', async () => {
    await repo.save(WORLD, AGENT, snapshot('Town Square'), prompt());
    const results = await repo.list(WORLD, AGENT);
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('Town Square');
  });

  it('returns decisions newest-first', async () => {
    await repo.save(WORLD, AGENT, snapshot('First'), prompt());
    await repo.save(WORLD, AGENT, snapshot('Second'), prompt());
    const results = await repo.list(WORLD, AGENT);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('Second');
    expect(results[1]?.snapshot.perception.locationLabel).toBe('First');
  });

  it('prunes to DECISION_HISTORY_LIMIT after save', async () => {
    for (let i = 0; i < DECISION_HISTORY_LIMIT + 5; i++) {
      await repo.save(WORLD, AGENT, snapshot(`loc-${i}`), prompt());
    }
    const results = await repo.list(WORLD, AGENT);
    expect(results).toHaveLength(DECISION_HISTORY_LIMIT);
  });

  it('only returns decisions for the given agent', async () => {
    await repo.save(WORLD, 'a1', snapshot('A1'), prompt());
    await repo.save(WORLD, 'a2', snapshot('A2'), prompt());
    const results = await repo.list(WORLD, 'a1');
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('A1');
  });

  it('only returns decisions for the given world', async () => {
    await repo.save('world-a', AGENT, snapshot('WA'), prompt());
    await repo.save('world-b', AGENT, snapshot('WB'), prompt());
    const results = await repo.list('world-a', AGENT);
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.perception.locationLabel).toBe('WA');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/infra/sqlite-npc-decision-repository.test.ts
```

Expected: FAIL — `SqliteNpcDecisionRepository` does not exist.

- [ ] **Step 3: Implement the repository**

```typescript
// src/infra/sqlite-npc-decision-repository.ts
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { DecisionSnapshot, NpcDecision, RawPrompt } from '@core/domain/npc-decision';
import { DECISION_HISTORY_LIMIT } from '@core/domain/npc-decision';
import type { NpcDecisionRepository } from '@core/engine/npc-decision-repository';
import type { DB } from './db';
import * as schema from './schema';

export class SqliteNpcDecisionRepository implements NpcDecisionRepository {
  constructor(private readonly db: DB) {}

  async save(
    worldId: string,
    agentId: string,
    snapshot: DecisionSnapshot,
    rawPrompt: RawPrompt,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.npcDecisions).values({
        worldId,
        agentId,
        createdAt: new Date(),
        snapshot,
        rawPrompt,
      });

      // Prune rows beyond the limit for this agent
      const keep = await tx
        .select({ id: schema.npcDecisions.id })
        .from(schema.npcDecisions)
        .where(
          and(
            eq(schema.npcDecisions.worldId, worldId),
            eq(schema.npcDecisions.agentId, agentId),
          ),
        )
        .orderBy(desc(schema.npcDecisions.createdAt))
        .limit(DECISION_HISTORY_LIMIT);

      const keepIds = keep.map((r) => r.id);

      if (keepIds.length === DECISION_HISTORY_LIMIT) {
        await tx
          .delete(schema.npcDecisions)
          .where(
            and(
              eq(schema.npcDecisions.worldId, worldId),
              eq(schema.npcDecisions.agentId, agentId),
              notInArray(schema.npcDecisions.id, keepIds),
            ),
          );
      }
    });
  }

  async list(worldId: string, agentId: string): Promise<NpcDecision[]> {
    const rows = await this.db
      .select()
      .from(schema.npcDecisions)
      .where(
        and(
          eq(schema.npcDecisions.worldId, worldId),
          eq(schema.npcDecisions.agentId, agentId),
        ),
      )
      .orderBy(desc(schema.npcDecisions.createdAt))
      .limit(DECISION_HISTORY_LIMIT);

    return rows.map((r) => ({
      id: r.id,
      worldId: r.worldId,
      agentId: r.agentId,
      createdAt: r.createdAt,
      snapshot: r.snapshot,
      rawPrompt: r.rawPrompt,
    }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/infra/sqlite-npc-decision-repository.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infra/sqlite-npc-decision-repository.ts src/infra/sqlite-npc-decision-repository.test.ts
git commit -m "feat(sensorium): add SqliteNpcDecisionRepository with rolling-cap pruning"
```

---

## Task 5: Instrument npc-mind.ts

**Files:**
- Modify: `src/core/engine/npc-mind.ts`

This task adds instrumentation to `decideNpcIntent` without changing its decision logic (Open/Closed). Two sub-changes: (a) refactor `buildUserPrompt` to return structured data alongside the prompt string, and (b) build the snapshot and save it.

- [ ] **Step 1: Add imports to npc-mind.ts**

At the top of `src/core/engine/npc-mind.ts`, add these imports after the existing ones:

```typescript
import type { DecisionSnapshot, RawPrompt } from '@core/domain/npc-decision';
import type { NpcDecisionRepository } from './npc-decision-repository';
```

- [ ] **Step 2: Add `decisionRepo` to `NpcMindOptions`**

Replace the existing `NpcMindOptions` interface (lines 443–446):

```typescript
export interface NpcMindOptions {
  /** Cap on recent-memory entries fed into the prompt. */
  readonly memoryLimit?: number;
  /** When provided, each decision is persisted as a snapshot for the Sensorium. */
  readonly decisionRepo?: NpcDecisionRepository | null;
}
```

- [ ] **Step 3: Refactor `buildUserPrompt` to return structured data**

Change the return type of `buildUserPrompt` from `Promise<string>` to a richer type. Replace the entire `buildUserPrompt` function:

```typescript
interface UserPromptResult {
  readonly prompt: string;
  readonly unansweredSummaries: string[];
  readonly memorySummaries: string[];
}

async function buildUserPrompt(
  ctx: NpcMindContext,
  selfId: AgentId,
  repo: HandlerRepo,
): Promise<UserPromptResult> {
  const { actor, view, inventory, memory } = ctx;
  const selfNameRegex = new RegExp(
    `\\b${actor.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  );
  const items = view.items.map((i) => i.label);
  const agents = view.agents.map((a) => {
    if (a.mood) return `${a.label} (mood: ${a.mood})`;
    return a.label;
  });
  const exits = view.exits.map((e) => {
    const base = e.label && e.label !== e.direction ? `${e.direction} (${e.label})` : e.direction;
    return e.locked ? `${base} [LOCKED]` : base;
  });
  const inv = inventory.map((i) => i.label);
  const lines: string[] = [];
  lines.push(`Location: ${view.location.label}`);
  if (view.location.shortDescription) lines.push(`Surroundings: ${view.location.shortDescription}`);
  lines.push(`Visible items: ${join(items)}`);
  lines.push(`Other characters here: ${join(agents)}`);
  lines.push(`Exits: ${join(exits)}`);
  lines.push(`You are carrying: ${join(inv)}`);

  const unanswered: DomainEvent[] = [];
  for (let i = 0; i < memory.length; i++) {
    const m = memory[i];
    if (!m) continue;
    const isAddressedToMe =
      ((m.kind === EventKind.Speak || m.kind === EventKind.Attack || m.kind === EventKind.CreativeAttack) && m.targetAgentId === selfId) ||
      (m.kind === EventKind.Speak &&
        m.targetAgentId === null &&
        selfNameRegex.test(m.utterance.toLowerCase()));
    if (!isAddressedToMe) continue;
    const respondedAfter = memory
      .slice(i + 1)
      .some(
        (later) =>
          later.actorId === selfId &&
          (later.kind === EventKind.Speak || later.kind === EventKind.Emote),
      );
    if (!respondedAfter) unanswered.push(m);
  }

  const unansweredSummaries: string[] = [];
  if (unanswered.length > 0) {
    lines.push('');
    lines.push('IMPORTANT — recent events directed AT YOU that you have NOT yet responded to:');
    for (const m of unanswered) {
      const summary = await summariseEvent(m, selfId, repo);
      unansweredSummaries.push(summary);
      lines.push(`- ${summary}`);
    }
  }

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

  return { prompt: lines.join('\n'), unansweredSummaries, memorySummaries };
}
```

- [ ] **Step 4: Update `decideNpcIntent` to use the new return type and save snapshots**

Replace the body of `decideNpcIntent` (starting after `const ctx: NpcMindContext = { ... }`):

```typescript
  const systemPrompt = SYSTEM_PROMPT(actor);
  const { prompt: userPrompt, unansweredSummaries, memorySummaries } = await buildUserPrompt(ctx, actorId, repo);

  const debug = process.env.NPC_MIND_DEBUG;
  if (debug) {
    log.info(
      `[npc-mind:debug] ${actor.label} prompt:\n--- system ---\n${systemPrompt}\n--- user ---\n${userPrompt}\n---`,
    );
  }

  const decisionRepo = opts.decisionRepo ?? null;
  const worldId = decisionRepo ? await repo.getWorldId() : null;
  const rawPrompt: RawPrompt = { system: systemPrompt, user: userPrompt };

  const baseSnapshot = {
    agentState: {
      mood: actor.mood ?? null,
      goal: actor.goal ?? null,
      shortTermIntent: actor.shortTermIntent ?? null,
    },
    perception: {
      locationLabel: view.location.label,
      locationDescription: view.location.shortDescription,
      visibleItems: view.items.map((i) => i.label),
      visibleAgents: view.agents.map((a) =>
        a.mood ? { label: a.label, mood: a.mood } : { label: a.label },
      ),
      exits: view.exits.map((e) => ({
        direction: e.direction as string,
        label: e.label,
        locked: e.locked,
      })),
      inventory: inventory.map((i) => i.label),
      unansweredAddresses: unansweredSummaries,
    },
    memory: memorySummaries,
  } as const;

  try {
    const prose = await llm.completeText({ system: systemPrompt, user: userPrompt });
    let body = prose.trim();
    log.info(`[npc-mind] ${actor.label} raw reply: ${JSON.stringify(prose)}`);
    if (body.length === 0) {
      log.warn(`[npc-mind] empty response for ${actor.label}; falling back to wait`);
      if (decisionRepo && worldId) {
        await decisionRepo.save(worldId, actorId as string, {
          ...baseSnapshot,
          response: { rawText: prose, thought: null, intentBefore: actor.shortTermIntent ?? null, intentAfter: actor.shortTermIntent ?? null, actions: [] },
          fallback: true,
        }, rawPrompt);
      }
      return [NpcFallbackIntent];
    }
    let cleared = false;
    let setTo: string | null = null;
    const thoughts: string[] = [];
    const remaining: string[] = [];
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.length === 0) continue;
      const thoughtMatch = line.match(/^THOUGHT:\s*(.+?)\s*$/);
      if (thoughtMatch?.[1]) {
        thoughts.push(thoughtMatch[1]);
        continue;
      }
      if (/^INTENT_DONE\b/.test(line)) {
        cleared = true;
        continue;
      }
      const setMatch = line.match(/^INTENT:\s*(.+?)\s*$/);
      if (setMatch?.[1]) {
        setTo = setMatch[1];
        continue;
      }
      remaining.push(line);
    }
    if (thoughts.length > 0) {
      for (const t of thoughts) {
        log.info(`[npc-mind] ${actor.label} thought: ${JSON.stringify(t)}`);
      }
    } else {
      log.warn(`[npc-mind] ${actor.label} emitted no THOUGHT lines this turn`);
    }
    const speechRegex =
      /^i\s+(say|tell|talk|speak|shout|whisper|ask|reply|answer|cry|mutter|murmur|sing|greet|call|exclaim|respond)\b/i;
    const isSpeech = (l: string): boolean => speechRegex.test(l.trim());
    const bodyLines = remaining;
    let speechLine: string | null = null;
    let actionLine: string | null = null;
    const dropped: string[] = [];
    for (const line of bodyLines) {
      if (isSpeech(line)) {
        if (speechLine === null) speechLine = line;
        else dropped.push(line);
      } else {
        if (actionLine === null) actionLine = line;
        else dropped.push(line);
      }
    }
    if (dropped.length > 0) {
      log.warn(
        `[npc-mind] ${actor.label} emitted extra action lines beyond speech+action; dropping: ${JSON.stringify(dropped)}`,
      );
    }
    const orderedLines: string[] = [];
    if (speechLine !== null) orderedLines.push(speechLine);
    if (actionLine !== null) orderedLines.push(actionLine);
    body = orderedLines.join(' && ');
    if (cleared && setTo === null && actor.shortTermIntent !== null) {
      await repo.updateAgentDescription(actorId, { shortTermIntent: null });
      log.info(`[npc-mind] ${actor.label} cleared own intent: "${actor.shortTermIntent}"`);
    }
    if (setTo !== null && setTo !== actor.shortTermIntent) {
      await repo.updateAgentDescription(actorId, { shortTermIntent: setTo });
      log.info(
        `[npc-mind] ${actor.label} set own intent: "${actor.shortTermIntent ?? '(none)'}" -> "${setTo}"`,
      );
    }
    const finalIntent = setTo !== null ? setTo : cleared ? null : (actor.shortTermIntent ?? null);
    log.info(
      `[npc-mind] ${actor.label} intent now: ${finalIntent === null ? '(none)' : `"${finalIntent}"`}; action: ${
        body.length === 0 ? '(wait — empty after control lines)' : JSON.stringify(body)
      }`,
    );

    if (decisionRepo && worldId) {
      const snapshot: DecisionSnapshot = {
        ...baseSnapshot,
        response: {
          rawText: prose,
          thought: thoughts[0] ?? null,
          intentBefore: actor.shortTermIntent ?? null,
          intentAfter: finalIntent,
          actions: orderedLines,
        },
        fallback: false,
      };
      await decisionRepo.save(worldId, actorId as string, snapshot, rawPrompt);
    }

    if (orderedLines.length === 0) return [NpcFallbackIntent];
    return orderedLines;
  } catch (err) {
    log.warn(`[npc-mind] error deciding intent for ${actor.label}: ${String(err)}`);
    if (decisionRepo && worldId) {
      await decisionRepo.save(worldId, actorId as string, {
        ...baseSnapshot,
        response: { rawText: '', thought: null, intentBefore: actor.shortTermIntent ?? null, intentAfter: actor.shortTermIntent ?? null, actions: [] },
        fallback: true,
      }, rawPrompt);
    }
    return [NpcFallbackIntent];
  }
```

- [ ] **Step 5: Run existing npc-mind tests to verify nothing broke**

```bash
npx vitest run src/core/engine/npc-mind.test.ts
```

Expected: all existing tests pass. The tests pass `null` for `decisionRepo` (via default opts), so the snapshot path is skipped.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/engine/npc-mind.ts
git commit -m "feat(sensorium): instrument decideNpcIntent to record decision snapshots"
```

---

## Task 6: Thread decisionRepo through RunTickOptions

**Files:**
- Modify: `src/core/engine/tick.ts`

- [ ] **Step 1: Add import and field to RunTickOptions**

In `src/core/engine/tick.ts`, add the import near the top alongside other engine imports:

```typescript
import type { NpcDecisionRepository } from './npc-decision-repository';
```

In the `RunTickOptions` interface (currently ends with `readonly onChunk?`), add:

```typescript
  /**
   * When provided, each NPC decision is persisted as a Sensorium snapshot.
   * Optional — omitting it disables recording (tests, offline environments).
   */
  readonly decisionRepo?: NpcDecisionRepository | null;
```

- [ ] **Step 2: Thread decisionRepo to ai.npcIntent call**

Find the line (around line 519):
```typescript
    const intents = ai ? await ai.npcIntent(npcId, repo) : [NpcFallbackIntent];
```

Replace with:
```typescript
    const intents = ai
      ? await ai.npcIntent(npcId, repo, opts.decisionRepo ? { decisionRepo: opts.decisionRepo } : undefined)
      : [NpcFallbackIntent];
```

- [ ] **Step 3: Verify TypeScript compiles and existing tests pass**

```bash
npx tsc --noEmit && npx vitest run src/core/engine/
```

Expected: no errors, all engine tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/engine/tick.ts
git commit -m "feat(sensorium): thread decisionRepo through RunTickOptions to npcIntent"
```

---

## Task 7: Wire at composition roots

**Files:**
- Modify: `app/routes/api/stream-command.ts`
- Modify: `app/server/submit.ts`

- [ ] **Step 1: Export getDb from world.ts**

In `app/server/world.ts`, add this export after `getRepo`:

```typescript
import type { DB } from '@infra/db';

export async function getDb(): Promise<DB> {
  if (!handle) {
    handle = openDb(DB_PATH);
    await seedIfEmpty(handle.db, CAMPAIGN);
  }
  return handle.db;
}
```

- [ ] **Step 2: Add decisionRepo to stream-command.ts**

In `app/routes/api/stream-command.ts`, add imports:

```typescript
import { SqliteNpcDecisionRepository } from '@infra/sqlite-npc-decision-repository';
import { getDb } from '~/server/world';
```

Then, before the `runTick` call, create the repo and add it to the opts object:

```typescript
const db = await getDb();
const decisionRepo = new SqliteNpcDecisionRepository(db);
```

Add `decisionRepo` to the `RunTickOptions` object passed to `runTick`.

- [ ] **Step 3: Repeat for submit.ts**

In `app/server/submit.ts`, add the same two imports and the same `getDb()` + `SqliteNpcDecisionRepository` instantiation before the `runTick` call. Add `decisionRepo` to the opts.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/routes/api/stream-command.ts app/server/submit.ts src/infra/sqlite-repository.ts
git commit -m "feat(sensorium): wire SqliteNpcDecisionRepository at composition roots"
```

---

## Task 8: Admin server function

**Files:**
- Modify: `app/server/admin/repo.ts`
- Create: `app/server/admin/sensorium.ts`

- [ ] **Step 1: Export getAdminDb from repo.ts**

In `app/server/admin/repo.ts`, add an exported helper after `getBuilderRepo`:

```typescript
import type { DB } from '@infra/db';

export async function getAdminDb(): Promise<DB> {
  if (!handle) handle = openDb(DB_PATH);
  if (!seeded) {
    await seedIfEmpty(handle.db, BURNING_DISTRICT_CAMPAIGN);
    seeded = true;
  }
  return handle.db;
}
```

- [ ] **Step 2: Create sensorium.ts**

```typescript
// app/server/admin/sensorium.ts
import type { NpcDecision } from '@core/domain/npc-decision';
import { SqliteNpcDecisionRepository } from '@infra/sqlite-npc-decision-repository';
import { createServerFn } from '@tanstack/react-start';
import { getAdminDb } from './repo';

const idPair = (d: unknown): { worldId: string; agentId: string } => {
  if (
    typeof d !== 'object' ||
    d === null ||
    typeof (d as { worldId?: unknown }).worldId !== 'string' ||
    typeof (d as { agentId?: unknown }).agentId !== 'string'
  ) {
    throw new Error('Expected { worldId: string, agentId: string }');
  }
  return d as { worldId: string; agentId: string };
};

export const getNpcDecisions = createServerFn({ method: 'GET' })
  .inputValidator(idPair)
  .handler(async ({ data }): Promise<NpcDecision[]> => {
    const db = await getAdminDb();
    const repo = new SqliteNpcDecisionRepository(db);
    return repo.list(data.worldId, data.agentId);
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/server/admin/repo.ts app/server/admin/sensorium.ts
git commit -m "feat(sensorium): add getNpcDecisions server function"
```

---

## Task 9: SensoriumSection — reusable collapsible section

**Files:**
- Create: `app/routes/admin/-components/SensoriumSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
// app/routes/admin/-components/SensoriumSection.tsx
import { useState } from 'react';

interface SensoriumSectionProps {
  readonly title: string;
  readonly defaultOpen: boolean;
  readonly children: React.ReactNode;
}

export function SensoriumSection({ title, defaultOpen, children }: SensoriumSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sensorium-section">
      <button
        type="button"
        className="sensorium-section__header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sensorium-section__chevron">{open ? '▼' : '▶'}</span>
        <span className="sensorium-section__title">{title}</span>
      </button>
      {open ? <div className="sensorium-section__body">{children}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/-components/SensoriumSection.tsx
git commit -m "feat(sensorium): add SensoriumSection reusable collapsible"
```

---

## Task 10: SensoriumDecisionList and SensoriumDecisionDetail

**Files:**
- Create: `app/routes/admin/-components/SensoriumDecisionList.tsx`
- Create: `app/routes/admin/-components/SensoriumDecisionDetail.tsx`

- [ ] **Step 1: Create SensoriumDecisionList**

```typescript
// app/routes/admin/-components/SensoriumDecisionList.tsx
import type { NpcDecision } from '@core/domain/npc-decision';

interface SensoriumDecisionListProps {
  readonly decisions: NpcDecision[];
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}

export function SensoriumDecisionList({ decisions, selectedId, onSelect }: SensoriumDecisionListProps) {
  if (decisions.length === 0) {
    return (
      <div className="sensorium-list sensorium-list--empty">
        <p className="t-metadata">No decisions recorded yet. Decisions are captured when an NPC acts.</p>
      </div>
    );
  }
  return (
    <div className="sensorium-list">
      <div className="sensorium-list__label t-label-caps">History</div>
      {decisions.map((d) => (
        <button
          key={d.id}
          type="button"
          className={`sensorium-list__item${d.id === selectedId ? ' sensorium-list__item--selected' : ''}`}
          onClick={() => onSelect(d.id)}
        >
          <span className="sensorium-list__timestamp">
            {new Date(d.createdAt).toLocaleTimeString()}
          </span>
          <span className="sensorium-list__location">
            {d.snapshot.perception.locationLabel}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create SensoriumDecisionDetail**

```typescript
// app/routes/admin/-components/SensoriumDecisionDetail.tsx
import type { NpcDecision } from '@core/domain/npc-decision';
import { SensoriumSection } from './SensoriumSection';

interface SensoriumDecisionDetailProps {
  readonly decision: NpcDecision;
}

export function SensoriumDecisionDetail({ decision }: SensoriumDecisionDetailProps) {
  const { snapshot, rawPrompt, createdAt } = decision;
  const { agentState, perception, memory, response } = snapshot;

  return (
    <div className="sensorium-detail">
      <div className="sensorium-detail__meta t-metadata">
        {new Date(createdAt).toLocaleString()}
        {snapshot.fallback ? ' — fallback (LLM unavailable)' : ''}
      </div>

      <SensoriumSection title="Agent State" defaultOpen>
        <dl className="sensorium-dl">
          <dt>Mood</dt><dd>{agentState.mood ?? '—'}</dd>
          <dt>Goal</dt><dd>{agentState.goal ?? '—'}</dd>
          <dt>Short-term intent</dt><dd>{agentState.shortTermIntent ?? '—'}</dd>
        </dl>
      </SensoriumSection>

      <SensoriumSection title="Perception" defaultOpen>
        <dl className="sensorium-dl">
          <dt>Location</dt>
          <dd>{perception.locationLabel}{perception.locationDescription ? ` — ${perception.locationDescription}` : ''}</dd>
          <dt>Agents here</dt>
          <dd>{perception.visibleAgents.length > 0
            ? perception.visibleAgents.map((a) => a.mood ? `${a.label} (${a.mood})` : a.label).join(', ')
            : '—'}
          </dd>
          <dt>Items</dt>
          <dd>{perception.visibleItems.length > 0 ? perception.visibleItems.join(', ') : '—'}</dd>
          <dt>Exits</dt>
          <dd>{perception.exits.length > 0
            ? perception.exits.map((e) => `${e.direction}${e.locked ? ' [locked]' : ''}`).join(', ')
            : '—'}
          </dd>
          <dt>Carrying</dt>
          <dd>{perception.inventory.length > 0 ? perception.inventory.join(', ') : '—'}</dd>
          {perception.unansweredAddresses.length > 0 && (
            <>
              <dt>Addressed (unanswered)</dt>
              <dd>
                <ul className="sensorium-list-inline">
                  {perception.unansweredAddresses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </dd>
            </>
          )}
        </dl>
      </SensoriumSection>

      <SensoriumSection title={`Memory (${memory.length} events)`} defaultOpen>
        {memory.length > 0 ? (
          <ul className="sensorium-memory">
            {memory.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        ) : <p className="t-metadata">No memory events.</p>}
      </SensoriumSection>

      <SensoriumSection title="Response" defaultOpen>
        <dl className="sensorium-dl">
          <dt>Thought</dt><dd><em>{response.thought ?? '—'}</em></dd>
          <dt>Intent change</dt>
          <dd>{response.intentBefore === response.intentAfter
            ? (response.intentAfter ?? 'none')
            : `${response.intentBefore ?? 'none'} → ${response.intentAfter ?? 'none'}`}
          </dd>
          <dt>Actions</dt>
          <dd>{response.actions.length > 0 ? response.actions.join(' / ') : '(wait)'}</dd>
        </dl>
      </SensoriumSection>

      <SensoriumSection title="Raw Prompt" defaultOpen={false}>
        <div className="sensorium-raw">
          <div className="sensorium-raw__label">System</div>
          <pre className="sensorium-raw__body">{rawPrompt.system}</pre>
          <div className="sensorium-raw__label">User</div>
          <pre className="sensorium-raw__body">{rawPrompt.user}</pre>
        </div>
      </SensoriumSection>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/SensoriumDecisionList.tsx app/routes/admin/-components/SensoriumDecisionDetail.tsx
git commit -m "feat(sensorium): add SensoriumDecisionList and SensoriumDecisionDetail"
```

---

## Task 11: SensoriumTab

**Files:**
- Create: `app/routes/admin/-components/SensoriumTab.tsx`

- [ ] **Step 1: Create SensoriumTab**

```typescript
// app/routes/admin/-components/SensoriumTab.tsx
import type { NpcDecision } from '@core/domain/npc-decision';
import { useEffect, useState } from 'react';
import { getNpcDecisions } from '~/server/admin/sensorium';
import { SensoriumDecisionDetail } from './SensoriumDecisionDetail';
import { SensoriumDecisionList } from './SensoriumDecisionList';

interface SensoriumTabProps {
  readonly worldId: string;
  readonly agentId: string;
}

export function SensoriumTab({ worldId, agentId }: SensoriumTabProps) {
  const [decisions, setDecisions] = useState<NpcDecision[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDecisions(null);
    setSelectedId(null);
    setError(null);
    getNpcDecisions({ data: { worldId, agentId } })
      .then((results) => {
        setDecisions(results);
        setSelectedId(results[0]?.id ?? null);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [worldId, agentId]);

  if (error) {
    return <p className="t-metadata" style={{ color: 'var(--c-error, #f44)' }}>Failed to load: {error}</p>;
  }

  if (decisions === null) {
    return <p className="t-metadata">Loading…</p>;
  }

  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="sensorium-pane">
      <SensoriumDecisionList
        decisions={decisions}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="sensorium-pane__detail">
        {selected
          ? <SensoriumDecisionDetail decision={selected} />
          : <p className="t-metadata">No decisions recorded yet.</p>
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/-components/SensoriumTab.tsx
git commit -m "feat(sensorium): add SensoriumTab with lazy fetch"
```

---

## Task 12: AgentTabs and CategoryRouter wiring

**Files:**
- Create: `app/routes/admin/-components/AgentTabs.tsx`
- Modify: `app/routes/admin/-components/CategoryRouter.tsx`

- [ ] **Step 1: Create AgentTabs with `as const` tab discriminant**

```typescript
// app/routes/admin/-components/AgentTabs.tsx
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { AgentForm, type AgentFormProps } from './AgentForm';
import { SensoriumTab } from './SensoriumTab';

export const AgentTabKind = {
  Profile: 'profile',
  Sensorium: 'sensorium',
} as const;
export type AgentTabKind = (typeof AgentTabKind)[keyof typeof AgentTabKind];

type AgentTabsProps = AgentFormProps;

export function AgentTabs({ tree, agentId, onSaved, onDeleted }: AgentTabsProps) {
  const [tab, setTab] = useState<AgentTabKind>(AgentTabKind.Profile);
  const worldId = tree.summary.id as string;

  return (
    <div className="agent-tabs">
      <div className="agent-tabs__bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === AgentTabKind.Profile}
          className={`agent-tabs__tab${tab === AgentTabKind.Profile ? ' agent-tabs__tab--active' : ''}`}
          onClick={() => setTab(AgentTabKind.Profile)}
        >
          Profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === AgentTabKind.Sensorium}
          className={`agent-tabs__tab${tab === AgentTabKind.Sensorium ? ' agent-tabs__tab--active' : ''}`}
          onClick={() => setTab(AgentTabKind.Sensorium)}
        >
          Sensorium
        </button>
      </div>

      {tab === AgentTabKind.Profile && (
        <AgentForm tree={tree} agentId={agentId} onSaved={onSaved} onDeleted={onDeleted} />
      )}
      {tab === AgentTabKind.Sensorium && (
        <SensoriumTab worldId={worldId} agentId={agentId} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace AgentForm with AgentTabs in CategoryRouter**

In `app/routes/admin/-components/CategoryRouter.tsx`:

Add the import:
```typescript
import { AgentTabs } from './AgentTabs';
```

In the `renderDetail` function, find the Agents branch:
```typescript
  if (category === CategoryKind.Agents) {
    return (
      <AgentForm
        key={selectedId}
        tree={tree}
        agentId={selectedId}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
```

Replace it with:
```typescript
  if (category === CategoryKind.Agents) {
    return (
      <AgentTabs
        key={selectedId}
        tree={tree}
        agentId={selectedId}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/-components/AgentTabs.tsx app/routes/admin/-components/CategoryRouter.tsx
git commit -m "feat(sensorium): wire AgentTabs into CategoryRouter"
```

---

## Task 13: Smoke test in browser

After all tasks are complete, start the dev server and verify:

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to admin → an autonomous agent**

Open the admin UI, go to Agents, select any autonomous NPC.

Expected: two tabs visible — "Profile" and "Sensorium". Profile tab shows existing form as before.

- [ ] **Step 3: Click Sensorium tab**

Expected: shows "No decisions recorded yet" (or loading then empty if no ticks have run).

- [ ] **Step 4: Trigger a game action to run a tick**

In the player UI, submit a command. Return to admin → the same agent → Sensorium.

Expected: at least one decision entry in the list. Clicking it shows Agent State, Perception, Memory, Response, and a collapsed Raw Prompt section.

- [ ] **Step 5: Verify Profile tab still works**

Click Profile tab. Confirm the form loads and can be saved normally.
