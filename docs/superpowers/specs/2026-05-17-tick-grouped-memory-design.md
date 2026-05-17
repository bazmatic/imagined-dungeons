# Tick-Grouped NPC Memory — Design Spec

**Date:** 2026-05-17
**Status:** Approved for implementation

## Overview

NPC memory events are currently presented to the LLM as a flat bullet list under "What you have witnessed recently:" with no indication of when each event occurred relative to others. This change groups events by game tick so the LLM understands temporal structure — which events happened together, and how far back each group sits.

---

## 1. Data Model

### worlds table — new column

Add `tickCount` to the `worlds` table alongside the existing `rngSeed`:

```ts
tickCount: integer('tick_count').notNull().default(0),
```

This is a monotonically increasing counter per world, incremented once at the start of each `runTick` call. It is the source of truth for tick identity.

### events table — new column

Add `tickId` to the `events` table:

```ts
tickId: integer('tick_id'),   // nullable — null for events predating this migration
```

No foreign key. `NULL` for all pre-migration rows; new rows get the current world `tickCount` at the time of the tick.

### DomainEvent — new field

```ts
readonly tickId: number | null;
```

`null` for pre-migration events loaded from the DB. All new events written during a tick carry the tick's `tickCount` value.

### Migrations

Two new Drizzle migration files (next available numbers after `0020`):
- `0021_*` — `ALTER TABLE worlds ADD COLUMN tick_count integer NOT NULL DEFAULT 0`
- `0022_*` — `ALTER TABLE events ADD COLUMN tick_id integer`

---

## 2. Repository Layer

### Interface additions (`src/core/engine/repository.ts`)

```ts
/** Atomically increments the world tick counter and returns the new value. */
incrementTickCount(): Promise<number>;
```

`appendEvent` gains an optional `tickId` parameter:

```ts
appendEvent(event: DomainEvent, tickId?: number): Promise<void>;
```

### SQLite implementation (`src/infra/sqlite-repository.ts`)

`incrementTickCount` issues a single `UPDATE worlds SET tick_count = tick_count + 1 WHERE id = ? RETURNING tick_count` and returns the result.

`appendEvent` passes `tickId` (or `null`) to the insert.

`recentEvents` maps the new column: `tickId: r.tickId ?? null`.

---

## 3. Tick Runner (`src/core/engine/tick.ts`)

At the very top of `runTick`, before any events are written:

```ts
const tickId = await repo.incrementTickCount();
```

Every `appendEvent` call within `runTick` (player turn, consequence pass, NPC turns) receives `tickId`. The value flows through as a parameter — no global state.

---

## 4. Prompt Formatting (`src/core/engine/npc-mind.ts`)

### New constants

```ts
const DEFAULT_MEMORY_LIMIT   = 8;   // existing — max events
const DEFAULT_MAX_TURN_DEPTH = 5;   // new — max distinct tick groups
```

Both are named constants in `npc-mind.ts`. Both are configurable via `NpcMindOptions`:

```ts
export interface NpcMindOptions {
  readonly memoryLimit?:    number;
  readonly maxTurnDepth?:   number;
  readonly decisionRepo?:   NpcDecisionRepository | null;
}
```

### Grouping algorithm (in `buildUserPrompt`)

After `recallFor` returns the event window (already bounded by `memoryLimit`):

1. Group events by `tickId`. Events with `null` tickId form a single group keyed `null`.
2. Sort groups oldest-first (ascending tickId; `null` group sorts first).
3. If the number of groups exceeds `maxTurnDepth`, drop the oldest groups until at most `maxTurnDepth` remain.
4. Compute relative labels based on position from the end:

| Position from end | Label            |
|-------------------|------------------|
| 0 (most recent)   | "This turn"      |
| 1                 | "Last turn"      |
| 2                 | "Two turns ago"  |
| 3                 | "Three turns ago"|
| N ≥ 4             | "N turns ago"    |
| null group        | "Earlier"        |

5. Render each group as a labelled block:

```
What you have witnessed, oldest to most recent:

Three turns ago:
- Uncle Bob looked around
- the world changed (location description updated)

Two turns ago:
- Paff Pinkerton ate the charred ration
- you examined the Glowing Archway

Last turn:
- Paff Pinkerton looked around

This turn:
- Scorch Wraith moved closer to you
```

### Edge cases

- **Single group:** Header + one "This turn:" block — no change in information density.
- **All null tickIds (pre-migration data):** All events appear under "Earlier:" — degrades gracefully to near-current behaviour.
- **Empty memory:** Section omitted entirely (unchanged behaviour).

The section header changes from `"What you have witnessed recently:"` to `"What you have witnessed, oldest to most recent:"`.

---

## 5. `DecisionSnapshot` in Sensorium

The `memory` field in `DecisionSnapshot` stores the already-formatted strings (the bullet content, not the group headers). This is unchanged — the Sensorium renders them as a flat list. Tick grouping is a prompt-only concern.

---

## 6. Out of Scope

- Showing tick numbers in the Sensorium history list (deferred)
- Exposing `tickCount` via the admin API
- Per-NPC tick tracking (the counter is world-level)
- Retroactively assigning `tickId` to pre-migration events
