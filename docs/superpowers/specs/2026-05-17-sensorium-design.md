# Sensorium — Admin Agent Decision Inspector

**Date:** 2026-05-17  
**Status:** Approved for implementation

## Overview

The Sensorium is an admin feature that surfaces the full input context an NPC agent used to make each decision. It appears as a "Sensorium" tab alongside the existing "Profile" tab on the agent detail view. Admins can step through the last 20 decisions for any agent to debug and understand NPC behaviour.

---

## 1. Data Model

### New table: `npc_decisions`

```ts
// src/infra/schema.ts addition
export const npcDecisions = sqliteTable('npc_decisions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  worldId:   text('world_id').notNull(),
  agentId:   text('agent_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  snapshot:  text('snapshot', { mode: 'json' }).$type<DecisionSnapshot>().notNull(),
  rawPrompt: text('raw_prompt', { mode: 'json' }).$type<RawPrompt>().notNull(),
});
```

### Shared types (single source of truth)

Defined once in `src/core/types/npc-decision.ts` and imported by both the engine (writer) and admin UI (reader). This satisfies DRY — the shape is not duplicated across layers.

```ts
export type DecisionSnapshot = {
  agentState: {
    mood:             string | null;
    goal:             string | null;
    shortTermIntent:  string | null;
  };
  perception: {
    locationLabel:        string;
    locationDescription:  string;
    visibleItems:         string[];
    visibleAgents:        Array<{ label: string; mood?: string }>;
    exits:                Array<{ direction: string; label: string; locked: boolean }>;
    inventory:            string[];
    unansweredAddresses:  string[];
  };
  memory:   string[];   // event strings fed to the LLM, in order
  response: {
    rawText:      string;
    thought:      string | null;
    intentBefore: string | null;
    intentAfter:  string | null;
    actions:      string[];   // 0–2 parsed action lines
  };
  fallback: boolean;    // true when LLM was unavailable
};

export type RawPrompt = {
  system: string;
  user:   string;
};

export type NpcDecision = {
  id:        number;
  worldId:   string;
  agentId:   string;
  createdAt: Date;
  snapshot:  DecisionSnapshot;
  rawPrompt: RawPrompt;
};
```

### Rolling cap

`DECISION_HISTORY_LIMIT = 20` — defined once in `src/core/config.ts` (or equivalent config module). After each insert, prune rows for `(worldId, agentId)` beyond the limit in the same transaction:

```sql
DELETE FROM npc_decisions
WHERE world_id = ? AND agent_id = ?
  AND id NOT IN (
    SELECT id FROM npc_decisions
    WHERE world_id = ? AND agent_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  )
```

The limit value is read from config — not hardcoded in the query — so it can be changed without touching the SQL.

---

## 2. Repository Layer

### Interface (Single Responsibility / Dependency Inversion)

A dedicated `NpcDecisionRepository` interface is defined separately from the main world repo, satisfying Interface Segregation. The engine and admin route depend on this interface, not on the concrete SQLite implementation.

```ts
// src/core/ports/npc-decision-repository.ts
export interface NpcDecisionRepository {
  save(
    worldId:   string,
    agentId:   string,
    snapshot:  DecisionSnapshot,
    rawPrompt: RawPrompt,
  ): Promise<void>;

  list(
    worldId: string,
    agentId: string,
  ): Promise<NpcDecision[]>;  // newest-first, max DECISION_HISTORY_LIMIT rows
}
```

### Concrete implementation

`src/infra/sqlite-npc-decision-repository.ts` — implements the interface against the Drizzle schema. The `save` method inserts + prunes in one transaction.

---

## 3. Engine Changes (`npc-mind.ts`)

`decideNpcIntent()` gains instrumentation without altering its decision logic (Open/Closed — behaviour is not modified, only observed).

Changes:
1. **Capture raw prompt** — record `{ system, user }` as local variables before `llm.completeText()`.
2. **Build snapshot inline** — as the function already assembles perception, memory, and agent state, assign these to a `DecisionSnapshot` object in parallel. No new data fetches; this is purely reorganising data already in scope (DRY — no re-querying).
3. **Persist after decision** — call `decisionRepo.save(worldId, agentId, snapshot, rawPrompt)` as the final step, after parsing the LLM response. On fallback (LLM null/fail), write with `fallback: true` and empty response fields.
4. **`decisionRepo` is injected** — `decideNpcIntent` receives an `NpcDecisionRepository` alongside its existing `repo` and `llm` parameters. This keeps the function testable and dependency-free of infrastructure (Dependency Inversion).

---

## 4. Admin UI

### Component structure (Single Responsibility)

Each component has one clearly bounded role:

```
app/routes/admin/-components/
  AgentTabs.tsx          — tab bar: "Profile" / "Sensorium" toggle (local UI state only)
  SensoriumTab.tsx       — two-panel layout: history list + selected decision detail
  SensoriumDecisionList.tsx  — left panel: scrollable list of decision entries
  SensoriumDecisionDetail.tsx — right panel: renders one NpcDecision
  SensoriumSection.tsx   — reusable collapsible section (used by Detail; DRY)
```

`AgentForm.tsx` is unchanged in its profile-editing responsibilities. The tab bar wraps it alongside `SensoriumTab`.

### Data flow

The existing `$worldId` admin route loader gains a `decisions` fetch when an agent is selected:

```ts
// added to loader
const decisions = await decisionRepo.list(worldId, selectedAgentId);
```

`SensoriumTab` receives `decisions: NpcDecision[]` as a prop. It holds `selectedId` in local state (defaulting to `decisions[0]?.id`). No URL parameter is needed — deep-linking to a specific decision is out of scope.

### `SensoriumSection` — reusable collapsible (DRY)

All sections in the detail view (Agent State, Perception, Memory, Response, Raw Prompt) use the same `SensoriumSection` component:

```tsx
<SensoriumSection title="Agent State" defaultOpen>
  {/* content */}
</SensoriumSection>

<SensoriumSection title="Raw Prompt" defaultOpen={false}>
  {/* pre-formatted JSON */}
</SensoriumSection>
```

`SensoriumSection` manages its own open/closed state. Default-open for all sections except Raw Prompt.

### Layout

- Left panel (~160px): list of decisions, newest first. Each entry shows a relative timestamp (e.g. "2 min ago") and an absolute time on hover. Selected entry has a left accent border. Tick numbers are not stored in this iteration.
- Right panel (flex): sections rendered top-to-bottom — Agent State → Perception → Memory → Response → Raw Prompt.
- No pagination needed (max 20 entries fit in the list).

---

## 5. Configuration

`DECISION_HISTORY_LIMIT` is a named constant in the project config (not an env var — this is an internal engine concern, not an operational tunable). Changing it requires a code change, which is intentional.

---

## 6. Out of Scope

- Real-time / live updates (manual refresh only)
- Deep-linking to a specific decision via URL
- Sensorium for the player agent (decisions are only recorded for autonomous NPCs)
- Filtering or searching decision history
- Exporting snapshots
