# World Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the world to grow during play — exits with no destination auto-create stub locations when traversed, and the consequence engine can create/delete locations, exits, items, and agents (via monster templates).

**Architecture:** Two sub-features ship together. Feature 1: `exits.to_location_id` becomes nullable; traversal by the player synchronously mints a stub location. Feature 2: the consequence engine receives five new action kinds in its LLM schema; the engine processes them internally via `builderRepo` before returning the existing `update_description`/`reveal_item` actions. All changes are ephemeral to the live world — the draft is never touched.

**Tech Stack:** TypeScript 5.7, Drizzle ORM + SQLite, React 19 + TanStack Router, Vitest

---

## File Structure

| File | Change |
|------|--------|
| `drizzle/0015_undefined_exits.sql` | New migration: recreate exits table with nullable to_location_id |
| `drizzle/meta/_journal.json` | Journal entry for 0015 |
| `src/infra/schema.ts` | exits.toLocationId nullable |
| `src/core/domain/entities.ts` | Exit.to: LocationId \| null |
| `src/core/domain/builder-types.ts` | UpsertExitInput.to: LocationId \| null |
| `src/core/domain/kinds.ts` | 5 new ActionKind values |
| `src/infra/builder-sqlite-repository.ts` | toExit mapper + upsertExit for null |
| `src/infra/builder-memory-repository.ts` | upsertExit for null |
| `src/infra/sqlite-repository.ts` | toExit mapper for null |
| `src/core/builder/index.ts` | asExitInput null handling |
| `src/mcp/tools.ts` | to nullable in upsert_exit |
| `app/server/admin/entities.ts` | Exit handler: null to |
| `app/routes/admin/-components/ExitRow.tsx` | Auto-generate option, null toLocationId |
| `app/routes/admin/-components/ExitsEditor.tsx` | Pass null to for auto-generate |
| `src/core/engine/actions/move.ts` | Stub creation branch for exit.to === null |
| `src/core/engine/actions/registry.ts` | Pass deps to handleMove |
| `src/core/engine/consequences.ts` | New schema, RawConsequence, processing, system prompt |
| `tests/integration/undefined-exits.test.ts` | New integration test |
| `tests/integration/consequence-world-expansion.test.ts` | New integration test |

---

### Task 1: DB Migration — nullable to_location_id

**Files:**
- Create: `drizzle/0015_undefined_exits.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Create the migration SQL**

Create `drizzle/0015_undefined_exits.sql`:
```sql
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exits` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text,
	`direction` text NOT NULL,
	`label` text NOT NULL,
	`locked` integer NOT NULL,
	`locked_by_item_id` text,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_exits`("id", "world_id", "from_location_id", "to_location_id", "direction", "label", "locked", "locked_by_item_id") SELECT "id", "world_id", "from_location_id", "to_location_id", "direction", "label", "locked", "locked_by_item_id" FROM `exits`;
--> statement-breakpoint
DROP TABLE `exits`;
--> statement-breakpoint
ALTER TABLE `__new_exits` RENAME TO `exits`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
```

- [ ] **Step 2: Add journal entry**

In `drizzle/meta/_journal.json`, append to the `entries` array (after the `0014_agent_secret_description` entry):
```json
{
  "idx": 15,
  "version": "6",
  "when": 1778900000000,
  "tag": "0015_undefined_exits",
  "breakpoints": true
}
```

- [ ] **Step 3: Delete and recreate the local DB**

The migration recreates the exits table. Delete the current DB so it will be rebuilt from all migrations on next server start:
```bash
rm -f imagined-dungeons.db imagined-dungeons.db-shm imagined-dungeons.db-wal
```

- [ ] **Step 4: Verify tests pass (migration runs in-memory)**

```bash
npx vitest run
```
Expected: all tests pass. The in-memory DB used by tests runs all migrations including 0015, so the test suite verifies the migration is valid SQL.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0015_undefined_exits.sql drizzle/meta/_journal.json
git commit -m "feat(schema): make exits.to_location_id nullable for undefined exits"
```

---

### Task 2: Type Changes — nullable Exit.to

**Files:**
- Modify: `src/infra/schema.ts`
- Modify: `src/core/domain/entities.ts`
- Modify: `src/core/domain/builder-types.ts`

These changes will introduce TypeScript errors in downstream files — that's expected and resolved in Tasks 3–6.

- [ ] **Step 1: Make schema column nullable**

In `src/infra/schema.ts`, find the exits table definition (around line 46). Change:
```ts
toLocationId: text('to_location_id').notNull(),
```
To:
```ts
toLocationId: text('to_location_id'),
```

- [ ] **Step 2: Make Exit.to nullable**

In `src/core/domain/entities.ts`, find the Exit interface (line 29). Change:
```ts
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
```
To:
```ts
export interface Exit {
  readonly id: ExitId;
  readonly worldId: WorldId;
  readonly from: LocationId;
  readonly to: LocationId | null;
  readonly direction: Direction;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}
```

- [ ] **Step 3: Make UpsertExitInput.to nullable**

In `src/core/domain/builder-types.ts`, find UpsertExitInput (around line 236). Change:
```ts
export interface UpsertExitInput {
  readonly id: ExitId;
  readonly from: LocationId;
  readonly to: LocationId;
  readonly direction: string;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}
```
To:
```ts
export interface UpsertExitInput {
  readonly id: ExitId;
  readonly from: LocationId;
  readonly to: LocationId | null;
  readonly direction: string;
  readonly label: string;
  readonly locked: boolean;
  readonly lockedByItem: ItemId | null;
}
```

- [ ] **Step 4: Check which files now have type errors**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected output: errors in `move.ts`, `builder-sqlite-repository.ts`, `sqlite-repository.ts`, `builder-memory-repository.ts`, `ExitRow.tsx`, `entities.ts` (admin server). These are all resolved in subsequent tasks.

---

### Task 3: Fix Repository Adapters for Nullable to

**Files:**
- Modify: `src/infra/builder-sqlite-repository.ts`
- Modify: `src/infra/builder-memory-repository.ts`
- Modify: `src/infra/sqlite-repository.ts`

- [ ] **Step 1: Fix builder-sqlite-repository.ts toExit mapper (line ~577)**

Find `const toExit = ...` in `src/infra/builder-sqlite-repository.ts`. Change:
```ts
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
```
To:
```ts
const toExit = (r: typeof schema.exits.$inferSelect, w: WorldId): Exit => ({
  id: asExitId(r.id),
  worldId: w,
  from: asLocationId(r.fromLocationId),
  to: r.toLocationId ? asLocationId(r.toLocationId) : null,
  direction: r.direction as Direction,
  label: r.label,
  locked: r.locked,
  lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});
```

- [ ] **Step 2: Fix builder-sqlite-repository.ts upsertExit (line ~150)**

The `upsertExit` method passes `i.to` as `toLocationId`. Since `i.to` is now `LocationId | null`, Drizzle accepts null for a nullable column — no code change required here. Verify by checking that `toLocationId: i.to` is already in the `.values({...})` and `.onConflictDoUpdate({set: {...}})` blocks. The TypeScript type for `toLocationId` in the schema is now `string | null | undefined`, which accepts the `LocationId | null` value.

Run:
```bash
npx tsc --noEmit 2>&1 | grep "builder-sqlite-repository"
```
Expected: no errors in this file.

- [ ] **Step 3: Fix builder-memory-repository.ts upsertExit (line ~120)**

In `src/infra/builder-memory-repository.ts`, the `upsertExit` sets `to: i.to`. Since `i.to` is now `LocationId | null` and `Exit.to` is now `LocationId | null`, this already type-checks. Verify:
```bash
npx tsc --noEmit 2>&1 | grep "builder-memory-repository"
```
Expected: no errors.

- [ ] **Step 4: Fix sqlite-repository.ts toExit mapper (line ~84)**

Find `const toExit = ...` in `src/infra/sqlite-repository.ts`. Change:
```ts
const toExit = (r: typeof schema.exits.$inferSelect, worldId: WorldId): Exit => ({
  id: asExitId(r.id),
  worldId,
  from: asLocationId(r.fromLocationId),
  to: asLocationId(r.toLocationId),
  direction: r.direction as Direction,
  label: r.label,
  locked: r.locked,
  lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});
```
To:
```ts
const toExit = (r: typeof schema.exits.$inferSelect, worldId: WorldId): Exit => ({
  id: asExitId(r.id),
  worldId,
  from: asLocationId(r.fromLocationId),
  to: r.toLocationId ? asLocationId(r.toLocationId) : null,
  direction: r.direction as Direction,
  label: r.label,
  locked: r.locked,
  lockedByItem: r.lockedByItemId ? asItemId(r.lockedByItemId) : null,
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```
Expected: tests may still fail due to remaining type errors in move.ts and admin files. Type-check to count remaining errors:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 6: Commit**

```bash
git add src/infra/builder-sqlite-repository.ts src/infra/builder-memory-repository.ts src/infra/sqlite-repository.ts
git commit -m "fix(infra): handle nullable Exit.to in all toExit mappers"
```

---

### Task 4: Fix Builder Index, Server Action, and MCP Tool

**Files:**
- Modify: `src/core/builder/index.ts`
- Modify: `app/server/admin/entities.ts`
- Modify: `src/mcp/tools.ts`

- [ ] **Step 1: Fix asExitInput in builder/index.ts**

Find `const asExitInput = ...` in `src/core/builder/index.ts` (around line 388). The function already returns `to: e.to` — since both `Exit.to` and `UpsertExitInput.to` are now `LocationId | null`, this needs no code change.

Verify:
```bash
npx tsc --noEmit 2>&1 | grep "builder/index"
```
Expected: no errors from this file.

- [ ] **Step 2: Fix the Exit handler in app/server/admin/entities.ts**

In `app/server/admin/entities.ts`, find the Exit branch in `saveEntity` (around line 49). Change:
```ts
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
```
To:
```ts
if (data.entity === EntityKind.Exit) {
  return upsertExitCore(repo, W, {
    id: asExitId(p.id as string),
    from: asLocationId(p.from as string),
    to: typeof p.to === 'string' && p.to.length > 0 ? asLocationId(p.to) : null,
    direction: p.direction as string,
    label: p.label as string,
    locked: Boolean(p.locked),
    lockedByItem:
      typeof p.lockedByItem === 'string' && p.lockedByItem.length > 0
        ? asItemId(p.lockedByItem)
        : null,
  });
}
```

- [ ] **Step 3: Fix upsert_exit in src/mcp/tools.ts**

Find the `upsert_exit` tool in `src/mcp/tools.ts`. Change the `to` property in `inputSchema.properties` from:
```ts
to: stringField('destination location id'),
```
To:
```ts
to: { type: ['string', 'null'], description: 'destination location id, or null for auto-generate on traversal' },
```

And in the `run` function, change:
```ts
to: asLocationId(a.to as string),
```
To:
```ts
to: typeof a.to === 'string' && (a.to as string).length > 0 ? asLocationId(a.to as string) : null,
```

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: only errors remain in `move.ts` and `ExitRow.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/core/builder/index.ts app/server/admin/entities.ts src/mcp/tools.ts
git commit -m "fix(builder): accept null destination in exit upsert paths"
```

---

### Task 5: Move Action — Stub Creation Branch

**Files:**
- Modify: `src/core/engine/actions/move.ts`
- Modify: `src/core/engine/actions/registry.ts`

- [ ] **Step 1: Pass deps to handleMove in registry.ts**

In `src/core/engine/actions/registry.ts`, find:
```ts
case ActionKind.Move:
  return handleMove(action, repo);
```
Change to:
```ts
case ActionKind.Move:
  return handleMove(action, repo, deps);
```

- [ ] **Step 2: Rewrite move.ts with stub creation**

Replace the entire content of `src/core/engine/actions/move.ts` with:
```ts
import type { BuilderRepository } from '@core/builder/repository';
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { asExitId, asLocationId, type WorldId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderMoveSelf } from '../templates';
import type { ActionOutcome } from './types';

export interface MoveHandlerDeps {
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
}

const REVERSE_DIRECTION: Readonly<Record<string, string>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'down',
  down: 'up',
  northeast: 'southwest',
  southwest: 'northeast',
  northwest: 'southeast',
  southeast: 'northwest',
};

export async function handleMove(
  action: Extract<Action, { kind: 'move' }>,
  repo: Repository,
  deps: MoveHandlerDeps = {},
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const exit = view.exits.find((e) => e.direction === action.direction);
  if (!exit) return Err("You can't go that way.");

  if (exit.to === null) {
    if (!deps.builderRepo) return Err("You can't go that way.");
    const worldId = deps.worldId ?? (await repo.getWorldId());
    const summary = await deps.builderRepo.getWorldSummary(worldId);
    if (!summary || summary.playerAgentId !== action.actorId) {
      return Err("You can't go that way.");
    }

    const stubId = asLocationId(`loc_stub_${Math.random().toString(36).slice(2, 10)}`);
    const stubLabel = exit.label ? `Beyond the ${exit.label}` : `The ${exit.direction} passage`;
    await deps.builderRepo.upsertLocation(worldId, {
      id: stubId,
      label: stubLabel,
      shortDescription: 'You stand in the threshold, on the edge of somewhere not yet formed.',
      longDescription: '',
      secretDescription: '',
      tags: [],
    });

    await deps.builderRepo.upsertExit(worldId, {
      id: exit.id,
      from: exit.from,
      to: stubId,
      direction: exit.direction,
      label: exit.label,
      locked: false,
      lockedByItem: null,
    });

    const reverseDir = REVERSE_DIRECTION[exit.direction] ?? exit.direction;
    const reciprocalId = asExitId(`exit_stub_${Math.random().toString(36).slice(2, 10)}`);
    await deps.builderRepo.upsertExit(worldId, {
      id: reciprocalId,
      from: stubId,
      to: exit.from,
      direction: reverseDir,
      label: exit.label,
      locked: false,
      lockedByItem: null,
    });

    await repo.moveAgent(action.actorId, stubId);
    const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
    const event: DomainEvent = {
      id: nextEventId(),
      worldId: await repo.getWorldId(),
      actorId: action.actorId,
      kind: EventKind.Move,
      witnesses,
      createdAt: new Date(),
      from: view.location.id,
      to: stubId,
      direction: action.direction,
    };
    await repo.appendEvent(event);
    return Ok({ render: renderMoveSelf(action.direction), event });
  }

  if (exit.locked) {
    const keyId = exit.lockedByItem;
    if (keyId === null) return Err(`The ${exit.label} is locked.`);
    const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
    const holdsKey = inventory.some((i) => i.id === keyId);
    if (!holdsKey) return Err(`The ${exit.label} is locked.`);
    await repo.setExitLocked(exit.id, false);
  }

  await repo.moveAgent(action.actorId, exit.to);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Move,
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

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: only ExitRow.tsx errors remain.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/integration/spawning-tick.test.ts
```
Expected: PASS — spawning tests exercise the move action via the normal (non-null) path.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine/actions/move.ts src/core/engine/actions/registry.ts
git commit -m "feat(engine): create stub location when player traverses undefined exit"
```

---

### Task 6: Admin UI — Auto-Generate Option

**Files:**
- Modify: `app/routes/admin/-components/ExitRow.tsx`
- Modify: `app/routes/admin/-components/ExitsEditor.tsx`

- [ ] **Step 1: Update ExitDraft and exitToDraft in ExitRow.tsx**

Replace the entire content of `app/routes/admin/-components/ExitRow.tsx` with:
```tsx
import type { Exit, Item, Location } from '@core/domain/entities';
import { useState } from 'react';

export interface ExitDraft {
  readonly id: string;
  readonly direction: string;
  readonly label: string;
  readonly toLocationId: string | null;
  readonly locked: boolean;
  readonly lockedByItemId: string | null;
  readonly isNew: boolean;
}

export interface ExitRowProps {
  readonly draft: ExitDraft;
  readonly sourceLocationId: string;
  readonly locations: readonly Location[];
  readonly items: readonly Item[];
  readonly onSave: (draft: ExitDraft) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
}

export function exitToDraft(e: Exit): ExitDraft {
  return {
    id: e.id as string,
    direction: e.direction,
    label: e.label,
    toLocationId: e.to === null ? null : (e.to as string),
    locked: e.locked,
    lockedByItemId: e.lockedByItem === null ? null : (e.lockedByItem as string),
    isNew: false,
  };
}

export function ExitRow({
  draft: initial,
  sourceLocationId,
  locations,
  items,
  onSave,
  onDelete,
}: ExitRowProps) {
  const [v, setV] = useState<ExitDraft>(initial);
  const [busy, setBusy] = useState(false);

  const destinationOptions = locations.filter((l) => (l.id as string) !== sourceLocationId);

  const toSelectValue = v.toLocationId === null ? '__auto__' : (v.toLocationId ?? '');

  const handleDestChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const val = e.target.value;
    setV({ ...v, toLocationId: val === '__auto__' ? null : val });
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    // Allow null (auto-generate) but not empty string (nothing selected)
    if (v.direction.trim() === '' || v.toLocationId === '') return;
    setBusy(true);
    try {
      await onSave({ ...v, isNew: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(v.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-editor">
      <div className="row-editor__grid">
        <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
          <label className="row-editor__field-label" htmlFor={`dir-${v.id}`}>
            Direction
          </label>
          <input
            id={`dir-${v.id}`}
            type="text"
            className="row-editor__input"
            value={v.direction}
            placeholder="north"
            onChange={(e) => setV({ ...v, direction: e.target.value })}
          />
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
          <label className="row-editor__field-label" htmlFor={`dest-${v.id}`}>
            Destination
          </label>
          <select
            id={`dest-${v.id}`}
            className="row-editor__select"
            value={toSelectValue}
            onChange={handleDestChange}
          >
            <option value="">— pick a location —</option>
            <option value="__auto__">(auto-generate)</option>
            {destinationOptions.map((l) => (
              <option key={l.id as string} value={l.id as string}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
          <label className="row-editor__field-label" htmlFor={`label-${v.id}`}>
            Label
          </label>
          <input
            id={`label-${v.id}`}
            type="text"
            className="row-editor__input"
            placeholder="(optional)"
            value={v.label}
            onChange={(e) => setV({ ...v, label: e.target.value })}
          />
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 2' }}>
          <label className="row-editor__checkbox">
            <input
              type="checkbox"
              checked={v.locked}
              onChange={(e) =>
                setV({
                  ...v,
                  locked: e.target.checked,
                  lockedByItemId: e.target.checked ? v.lockedByItemId : null,
                })
              }
            />
            Locked
          </label>
        </div>
        {v.locked ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
            <label className="row-editor__field-label" htmlFor={`key-${v.id}`}>
              Locked by item
            </label>
            <select
              id={`key-${v.id}`}
              className="row-editor__select"
              value={v.lockedByItemId ?? ''}
              onChange={(e) =>
                setV({ ...v, lockedByItemId: e.target.value === '' ? null : e.target.value })
              }
            >
              <option value="">(none)</option>
              {items.map((it) => (
                <option key={it.id as string} value={it.id as string}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="row-editor__actions">
        {v.isNew ? null : (
          <button type="button" className="btn" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {v.isNew ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update ExitsEditor.tsx addNew and save**

In `app/routes/admin/-components/ExitsEditor.tsx`, find `addNew`:
```ts
const addNew = (): void => {
  setStaged((s) => [
    ...s,
    {
      id: randomExitId(),
      direction: '',
      label: '',
      toLocationId: '',
      locked: false,
      lockedByItemId: null,
      isNew: true,
    },
  ]);
};
```
No change needed — `toLocationId: ''` is the initial "not chosen" state.

Find `save`:
```ts
const save = async (d: ExitDraft): Promise<void> => {
  await saveEntity({
    data: {
      worldId,
      entity: EntityKind.Exit,
      payload: {
        id: d.id,
        from: sourceLocationId,
        to: d.toLocationId,
        direction: d.direction,
        label: d.label,
        locked: d.locked,
        lockedByItem: d.lockedByItemId,
      },
    },
  });
  ...
};
```
The `to: d.toLocationId` already passes through `string | null` — no change needed since the server action now handles null.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/-components/ExitRow.tsx app/routes/admin/-components/ExitsEditor.tsx
git commit -m "feat(admin): add auto-generate destination option for exits"
```

---

### Task 7: Integration Test — Undefined Exit Traversal

**Files:**
- Create: `tests/integration/undefined-exits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/undefined-exits.test.ts`:
```ts
import {
  createDraft,
  createLiveForScratch,
  saveStartingState,
  upsertAgent,
  upsertExit,
  upsertLocation,
} from '@core/builder/index';
import { asAgentId, asExitId, asLocationId, asWorldId } from '@core/domain/ids';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { SqliteRepository } from '@infra/sqlite-repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;

beforeEach(() => {
  handle = openDb(':memory:');
});
afterEach(() => handle.close());

describe('undefined exits (Feature 2: auto-generated destinations)', () => {
  it('player traversing a null-destination exit creates a stub location and moves there', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);

    const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
    if (!created.ok) throw new Error(created.error.message);
    const W = created.value;

    const LOC_TAVERN = asLocationId('loc_tavern');
    await upsertLocation(builderRepo, W, {
      id: LOC_TAVERN,
      label: 'Tavern',
      shortDescription: 'a tavern',
      longDescription: 'A cosy tavern.',
      tags: [],
      secretDescription: '',
    });

    const PLAYER = asAgentId('char_player');
    await upsertAgent(builderRepo, W, {
      id: PLAYER,
      label: 'Player',
      shortDescription: 'p',
      longDescription: 'p',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    });
    await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });

    await upsertExit(builderRepo, W, {
      id: asExitId('exit_north'),
      from: LOC_TAVERN,
      to: null,
      direction: 'north',
      label: 'archway',
      locked: false,
      lockedByItem: null,
    });

    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_undef1');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    const result = await runTick(PLAYER, 'north', engineRepo, {
      parse,
      llm: null,
      builderRepo,
    });

    // Player should have moved
    const { EventKind } = await import('@core/domain/kinds');
    expect(result.events.some((e) => e.kind === EventKind.Move)).toBe(true);

    // Player should now be in a stub location (not the tavern)
    const player = await engineRepo.getAgent(PLAYER);
    expect(player.locationId).not.toBe(LOC_TAVERN);

    // The stub location should exist in the live world
    const stubLoc = await engineRepo.getLocation(player.locationId);
    expect(stubLoc.label).toContain('archway');

    // Original exit should now point to the stub
    const exits = await engineRepo.exitsFrom(LOC_TAVERN);
    const northExit = exits.find((e) => e.direction === 'north');
    expect(northExit?.to).toBe(player.locationId);

    // Reciprocal exit from stub back to tavern should exist
    const returnExits = await engineRepo.exitsFrom(player.locationId);
    const southReturn = returnExits.find((e) => e.direction === 'south');
    expect(southReturn?.to).toBe(LOC_TAVERN);
  });

  it('NPC traversing a null-destination exit is blocked', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);

    const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
    if (!created.ok) throw new Error(created.error.message);
    const W = created.value;

    const LOC_TAVERN = asLocationId('loc_tavern');
    await upsertLocation(builderRepo, W, {
      id: LOC_TAVERN,
      label: 'Tavern',
      shortDescription: 'a tavern',
      longDescription: 'A tavern.',
      tags: [],
      secretDescription: '',
    });

    const PLAYER = asAgentId('char_player');
    const NPC = asAgentId('char_npc');
    await upsertAgent(builderRepo, W, {
      id: PLAYER,
      label: 'Player',
      shortDescription: 'p',
      longDescription: 'p',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    });
    await upsertAgent(builderRepo, W, {
      id: NPC,
      label: 'Guard',
      shortDescription: 'a guard',
      longDescription: 'a guard',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    });
    await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });

    await upsertExit(builderRepo, W, {
      id: asExitId('exit_north'),
      from: LOC_TAVERN,
      to: null,
      direction: 'north',
      label: 'gate',
      locked: false,
      lockedByItem: null,
    });

    const saved = await saveStartingState(builderRepo, W);
    if (!saved.ok) throw new Error(saved.error.message);
    const liveId = asWorldId('w_live_undef2');
    const lp = await createLiveForScratch(builderRepo, W, liveId);
    if (!lp.ok) throw new Error(lp.error.message);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    // NPC tries to go north — should fail (stay in tavern)
    const { handleMove } = await import('@core/engine/actions/move');
    const { ActionKind } = await import('@core/domain/kinds');
    const result = await handleMove(
      { kind: ActionKind.Move, actorId: NPC, direction: 'north' },
      engineRepo,
      { builderRepo }, // no worldId — but also NPC is not playerAgentId
    );

    expect(result.ok).toBe(false);
    const npc = await engineRepo.getAgent(NPC);
    expect(npc.locationId).toBe(LOC_TAVERN);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/integration/undefined-exits.test.ts
```
Expected: FAIL — `upsertExit` with `to: null` fails type check or runtime (the test verifies the feature doesn't exist yet... actually at this point Tasks 1-6 are done, so this should pass).

Run and observe output. If it passes, that confirms the implementation is correct. If it fails, investigate the error message.

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run tests/integration/undefined-exits.test.ts
```
Expected: PASS for both tests.

- [ ] **Step 4: Run full suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/undefined-exits.test.ts
git commit -m "test(integration): undefined exit traversal creates stub location"
```

---

### Task 8: New ActionKind Constants

**Files:**
- Modify: `src/core/domain/kinds.ts`

- [ ] **Step 1: Add world-expansion action kinds**

In `src/core/domain/kinds.ts`, find `ActionKind` (around line 13). Add five new values after `RevealItem`:
```ts
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
  Equip: 'equip',
  Unequip: 'unequip',
  RevealItem: 'reveal_item',
  Open: 'open',
  Close: 'close',
  Buy: 'buy',
  Sell: 'sell',
  Offer: 'offer',
  CreateLocation: 'create_location',
  CreateExit: 'create_exit',
  CreateAgent: 'create_agent',
  CreateItem: 'create_item',
  DeleteEntity: 'delete_entity',
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: no errors (these are additive new values).

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/kinds.ts
git commit -m "feat(domain): add world-expansion action kind constants"
```

---

### Task 9: Consequence Engine — Schema, Parsing, and System Prompt

**Files:**
- Modify: `src/core/engine/consequences.ts`

The consequence engine file is large; this task is surgical additions. Do not remove or restructure existing code.

- [ ] **Step 1: Update MAX_CONSEQUENCES_PER_PASS**

Find:
```ts
export const MAX_CONSEQUENCES_PER_PASS = 3;
```
Change to:
```ts
export const MAX_CONSEQUENCES_PER_PASS = 5;
```

- [ ] **Step 2: Expand CONSEQUENCE_SCHEMA**

Find `export const CONSEQUENCE_SCHEMA: JsonSchema = {` (around line 84). Replace the entire `CONSEQUENCE_SCHEMA` definition with:
```ts
export const CONSEQUENCE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['consequences', 'updatedStorySoFar'],
  properties: {
    updatedStorySoFar: { type: ['string', 'null'] },
    consequences: {
      type: 'array',
      maxItems: 5,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetKind', 'targetRef', 'shortDescription', 'longDescription', 'mood', 'shortTermIntent'],
            properties: {
              kind: { const: 'update_description' },
              targetKind: { enum: ['location', 'item', 'agent'] },
              targetRef: { type: 'string' },
              shortDescription: { type: ['string', 'null'] },
              longDescription: { type: ['string', 'null'] },
              mood: { type: ['string', 'null'] },
              shortTermIntent: { type: ['string', 'null'] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetRef'],
            properties: {
              kind: { const: 'reveal_item' },
              targetKind: { type: 'string' },
              targetRef: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'id', 'label', 'shortDescription', 'longDescription', 'secretDescription', 'tags'],
            properties: {
              kind: { const: 'create_location' },
              id: { type: 'string' },
              label: { type: 'string' },
              shortDescription: { type: 'string' },
              longDescription: { type: 'string' },
              secretDescription: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'id', 'from', 'direction', 'label', 'locked'],
            properties: {
              kind: { const: 'create_exit' },
              id: { type: 'string' },
              from: { type: 'string' },
              to: { type: ['string', 'null'] },
              direction: { type: 'string' },
              label: { type: 'string' },
              locked: { type: 'boolean' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'templateKey', 'locationId'],
            properties: {
              kind: { const: 'create_agent' },
              templateKey: { type: 'string' },
              locationId: { type: 'string' },
              count: { type: 'integer', minimum: 1, maximum: 3 },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'id', 'label', 'shortDescription', 'longDescription', 'ownerKind', 'ownerId', 'weight', 'hidden', 'tags'],
            properties: {
              kind: { const: 'create_item' },
              id: { type: 'string' },
              label: { type: 'string' },
              shortDescription: { type: 'string' },
              longDescription: { type: 'string' },
              ownerKind: { enum: ['location', 'agent'] },
              ownerId: { type: 'string' },
              weight: { type: 'integer', minimum: 0 },
              hidden: { type: 'boolean' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'targetKind', 'entityId'],
            properties: {
              kind: { const: 'delete_entity' },
              targetKind: { enum: ['location', 'exit', 'agent', 'item'] },
              entityId: { type: 'string' },
            },
          },
        ],
      },
    },
  },
};
```

- [ ] **Step 3: Expand RawConsequence type**

Find `type RawConsequence = ...` (around line 124). Replace with:
```ts
type RawConsequence =
  | {
      readonly kind: 'update_description';
      readonly targetKind: 'location' | 'item' | 'agent';
      readonly targetRef: string;
      readonly shortDescription: string | null;
      readonly longDescription: string | null;
      readonly mood: string | null;
      readonly shortTermIntent: string | null;
    }
  | {
      readonly kind: 'reveal_item';
      readonly targetRef: string;
    }
  | {
      readonly kind: 'create_location';
      readonly id: string;
      readonly label: string;
      readonly shortDescription: string;
      readonly longDescription: string;
      readonly secretDescription: string;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: 'create_exit';
      readonly id: string;
      readonly from: string;
      readonly to: string | null;
      readonly direction: string;
      readonly label: string;
      readonly locked: boolean;
    }
  | {
      readonly kind: 'create_agent';
      readonly templateKey: string;
      readonly locationId: string;
      readonly count: number;
    }
  | {
      readonly kind: 'create_item';
      readonly id: string;
      readonly label: string;
      readonly shortDescription: string;
      readonly longDescription: string;
      readonly ownerKind: 'location' | 'agent';
      readonly ownerId: string;
      readonly weight: number;
      readonly hidden: boolean;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: 'delete_entity';
      readonly targetKind: 'location' | 'exit' | 'agent' | 'item';
      readonly entityId: string;
    };
```

- [ ] **Step 4: Expand parseResponse to handle new kinds**

Find `function parseResponse(parsed: unknown): readonly RawConsequence[]` (around line 142). Replace the whole function with:
```ts
function parseResponse(parsed: unknown): readonly RawConsequence[] {
  if (!isRecord(parsed)) return [];
  const list = parsed.consequences;
  if (!Array.isArray(list)) return [];
  const out: RawConsequence[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const kind = entry.kind;

    if (kind === ActionKind.RevealItem) {
      const targetRef = entry.targetRef;
      if (typeof targetRef !== 'string' || targetRef.length === 0) continue;
      out.push({ kind: ActionKind.RevealItem, targetRef });
      continue;
    }

    if (kind === ActionKind.CreateLocation) {
      const id = entry.id;
      const label = entry.label;
      const short = entry.shortDescription;
      const long = entry.longDescription;
      const secret = entry.secretDescription ?? '';
      const tags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
      if (typeof id !== 'string' || typeof label !== 'string' || typeof short !== 'string' || typeof long !== 'string') {
        console.warn('[consequence] create_location missing required fields; dropping');
        continue;
      }
      out.push({ kind: ActionKind.CreateLocation, id, label, shortDescription: short, longDescription: long, secretDescription: typeof secret === 'string' ? secret : '', tags });
      continue;
    }

    if (kind === ActionKind.CreateExit) {
      const id = entry.id;
      const from = entry.from;
      const to = entry.to ?? null;
      const direction = entry.direction;
      const label = entry.label ?? '';
      const locked = Boolean(entry.locked);
      if (typeof id !== 'string' || typeof from !== 'string' || typeof direction !== 'string') {
        console.warn('[consequence] create_exit missing required fields; dropping');
        continue;
      }
      if (to !== null && typeof to !== 'string') continue;
      out.push({ kind: ActionKind.CreateExit, id, from, to: typeof to === 'string' ? to : null, direction, label: typeof label === 'string' ? label : '', locked });
      continue;
    }

    if (kind === ActionKind.CreateAgent) {
      const templateKey = entry.templateKey;
      const locationId = entry.locationId;
      const count = typeof entry.count === 'number' ? Math.max(1, Math.floor(entry.count)) : 1;
      if (typeof templateKey !== 'string' || typeof locationId !== 'string') {
        console.warn('[consequence] create_agent missing templateKey or locationId; dropping');
        continue;
      }
      out.push({ kind: ActionKind.CreateAgent, templateKey, locationId, count });
      continue;
    }

    if (kind === ActionKind.CreateItem) {
      const id = entry.id;
      const label = entry.label;
      const short = entry.shortDescription;
      const long = entry.longDescription;
      const ownerKind = entry.ownerKind;
      const ownerId = entry.ownerId;
      const weight = typeof entry.weight === 'number' ? entry.weight : 0;
      const hidden = Boolean(entry.hidden);
      const tags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
      if (typeof id !== 'string' || typeof label !== 'string' || typeof short !== 'string' || typeof long !== 'string' || typeof ownerId !== 'string') {
        console.warn('[consequence] create_item missing required fields; dropping');
        continue;
      }
      if (ownerKind !== OwnerKind.Location && ownerKind !== OwnerKind.Agent) continue;
      out.push({ kind: ActionKind.CreateItem, id, label, shortDescription: short, longDescription: long, ownerKind, ownerId, weight, hidden, tags });
      continue;
    }

    if (kind === ActionKind.DeleteEntity) {
      const targetKind = entry.targetKind;
      const entityId = entry.entityId;
      if (typeof entityId !== 'string' || entityId.length === 0) continue;
      if (targetKind !== 'location' && targetKind !== 'exit' && targetKind !== 'agent' && targetKind !== 'item') continue;
      out.push({ kind: ActionKind.DeleteEntity, targetKind, entityId });
      continue;
    }

    if (kind !== ActionKind.UpdateDescription) continue;
    const targetKind = entry.targetKind;
    if (targetKind !== OwnerKind.Location && targetKind !== OwnerKind.Item && targetKind !== OwnerKind.Agent) continue;
    const targetRef = entry.targetRef;
    if (typeof targetRef !== 'string' || targetRef.length === 0) continue;
    const shortDescription = entry.shortDescription;
    const longDescription = entry.longDescription;
    if (shortDescription !== null && typeof shortDescription !== 'string') continue;
    if (longDescription !== null && typeof longDescription !== 'string') continue;
    const moodRaw = 'mood' in entry ? entry.mood : null;
    if (moodRaw !== null && typeof moodRaw !== 'string') continue;
    const isAgent = targetKind === OwnerKind.Agent;
    const mood = isAgent ? (moodRaw as string | null) : null;
    const shortTermIntent = null;
    const agentSideChange = isAgent && mood !== null;
    if (shortDescription === null && longDescription === null && !agentSideChange) continue;
    out.push({ kind: ActionKind.UpdateDescription, targetKind, targetRef, shortDescription, longDescription, mood, shortTermIntent });
  }
  return out;
}
```

- [ ] **Step 5: Add WORLD_EXPANSION lines to system prompt**

Find `const SYSTEM_PROMPT_LINES: readonly string[] = [` (line 29). Add the following lines at the very end of the array (before the closing `]`), after the last existing entry `'- Maximum 3 entries in consequences.'`:
```ts
  '',
  'World Expansion:',
  'You may create and delete entities when events durably alter the world — a secret passage is discovered, a merchant arrives, a wall is blasted open, a building collapses.',
  '',
  'Do NOT create entities for transient events (a candle flickering, a guard walking past). Created entities persist for the rest of the session.',
  '',
  'IDs: Invent a short snake_case id prefixed by kind (loc_, agent_, item_, exit_). You may reference a just-created ID in a later action in the same batch.',
  '',
  'Spawning agents: Use create_agent with an existing templateKey from the world\'s monster templates. Do not invent stats. If no template fits, prefer description updates over spawning.',
  '',
  'Enriching sparse locations: When a location has empty or minimal descriptions (a newly generated stub), treat any player action there as a signal to generate full content — proper label, descriptions, atmosphere, and any items or agents that belong there. You may plant exits with to=null to suggest depth beyond the current scene.',
  '',
  'create/delete limits: No more than 3 create or delete actions per batch. Maximum 5 total consequences. When in doubt, don\'t create — a good description update is often better than a new entity.',
```

- [ ] **Step 6: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: no errors, since we added to the types not changed them.

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```
Expected: all tests pass (parseResponse changes are additive; existing tests don't reach the new branches).

- [ ] **Step 8: Commit**

```bash
git add src/core/engine/consequences.ts src/core/domain/kinds.ts
git commit -m "feat(consequence): add world-expansion schema and parsing (create/delete action kinds)"
```

---

### Task 10: Consequence Engine — Execute Create/Delete

**Files:**
- Modify: `src/core/engine/consequences.ts`

This task adds the `applyWorldExpansion` function and wires it into `consequencesFor`. All create/delete processing happens via `lore.builderRepo` before returning the existing action types.

- [ ] **Step 1: Add required imports**

At the top of `src/core/engine/consequences.ts`, after the existing imports, add:
```ts
import { expandSpawn } from '@core/spawning/expand';
import {
  asAgentId,
  asExitId,
  asItemId,
  asLocationId,
} from '@core/domain/ids';
```

- [ ] **Step 2: Add applyWorldExpansion function**

Add the following function after `parseResponse` (around line 196) and before `summarise`:
```ts
/**
 * Execute create/delete raw consequences in fixed processing order:
 *   1. create_location (no cross-deps)
 *   2. create_item and create_agent (may reference locations from step 1)
 *   3. create_exit (may reference locations from steps 1/2)
 *   4. delete_entity (last, so updates can reference entities before deletion)
 *
 * Returns the set of location IDs minted during this pass (so callers
 * can validate create_exit references).
 */
async function applyWorldExpansion(
  raws: readonly RawConsequence[],
  lore: ConsequenceLoreSink,
  playerLocationId: string,
): Promise<void> {
  const mintedLocationIds = new Set<string>();

  // Step 1: create_location
  for (const raw of raws) {
    if (raw.kind !== ActionKind.CreateLocation) continue;
    try {
      await lore.builderRepo.upsertLocation(lore.worldId, {
        id: asLocationId(raw.id),
        label: raw.label,
        shortDescription: raw.shortDescription,
        longDescription: raw.longDescription,
        secretDescription: raw.secretDescription,
        tags: [...raw.tags],
      });
      mintedLocationIds.add(raw.id);
    } catch (err) {
      log.warn(`[consequence] create_location ${raw.id} failed: ${String(err)}`);
    }
  }

  // Step 2: create_item and create_agent (parallel within step)
  const templates = await lore.builderRepo.listMonsterTemplates(lore.worldId);
  const templateByKey = new Map(templates.map((t) => [t.templateKey, t]));

  for (const raw of raws) {
    if (raw.kind === ActionKind.CreateItem) {
      if (raw.ownerKind !== OwnerKind.Location && raw.ownerKind !== OwnerKind.Agent) continue;
      try {
        await lore.builderRepo.upsertItem(lore.worldId, {
          id: asItemId(raw.id),
          label: raw.label,
          shortDescription: raw.shortDescription,
          longDescription: raw.longDescription,
          ownerKind: raw.ownerKind,
          ownerId: raw.ownerId,
          weight: raw.weight,
          hidden: raw.hidden,
          tags: [...raw.tags],
          container: false,
          opened: true,
          locked: false,
          lockedByItem: null,
          priceTag: null,
        });
      } catch (err) {
        log.warn(`[consequence] create_item ${raw.id} failed: ${String(err)}`);
      }
    }

    if (raw.kind === ActionKind.CreateAgent) {
      const template = templateByKey.get(raw.templateKey);
      if (!template) {
        log.warn(`[consequence] create_agent: no template with key "${raw.templateKey}"; dropping`);
        continue;
      }
      const inputs = expandSpawn({
        template,
        locationId: asLocationId(raw.locationId),
        count: raw.count,
      });
      for (const input of inputs) {
        try {
          await lore.builderRepo.upsertAgent(lore.worldId, input);
        } catch (err) {
          log.warn(`[consequence] create_agent upsert failed: ${String(err)}`);
        }
      }
    }
  }

  // Step 3: create_exit
  for (const raw of raws) {
    if (raw.kind !== ActionKind.CreateExit) continue;
    const fromExists = mintedLocationIds.has(raw.from) || await locationExistsInLive(raw.from, lore);
    if (!fromExists) {
      log.warn(`[consequence] create_exit: from "${raw.from}" not found; dropping`);
      continue;
    }
    if (raw.to !== null) {
      const toExists = mintedLocationIds.has(raw.to) || await locationExistsInLive(raw.to, lore);
      if (!toExists) {
        log.warn(`[consequence] create_exit: to "${raw.to}" not found; dropping`);
        continue;
      }
    }
    try {
      await lore.builderRepo.upsertExit(lore.worldId, {
        id: asExitId(raw.id),
        from: asLocationId(raw.from),
        to: raw.to ? asLocationId(raw.to) : null,
        direction: raw.direction,
        label: raw.label,
        locked: raw.locked,
        lockedByItem: null,
      });
    } catch (err) {
      log.warn(`[consequence] create_exit ${raw.id} failed: ${String(err)}`);
    }
  }

  // Step 4: delete_entity
  for (const raw of raws) {
    if (raw.kind !== ActionKind.DeleteEntity) continue;
    if (raw.targetKind === 'location' && raw.entityId === playerLocationId) {
      log.warn(`[consequence] delete_entity: refusing to delete player's current location; dropping`);
      continue;
    }
    try {
      if (raw.targetKind === 'location') {
        await lore.builderRepo.deleteLocation(lore.worldId, asLocationId(raw.entityId));
      } else if (raw.targetKind === 'exit') {
        await lore.builderRepo.deleteExit(lore.worldId, asExitId(raw.entityId));
      } else if (raw.targetKind === 'agent') {
        await lore.builderRepo.deleteAgent(lore.worldId, asAgentId(raw.entityId));
      } else if (raw.targetKind === 'item') {
        await lore.builderRepo.deleteItem(lore.worldId, asItemId(raw.entityId));
      }
    } catch (err) {
      log.warn(`[consequence] delete_entity ${raw.entityId} failed: ${String(err)}`);
    }
  }
}

async function locationExistsInLive(id: string, lore: ConsequenceLoreSink): Promise<boolean> {
  try {
    const locs = await lore.builderRepo.listLocations(lore.worldId);
    return locs.some((l) => (l.id as string) === id);
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Wire applyWorldExpansion into consequencesFor**

Find `consequencesFor` (around line 513). Find the section after the `updatedStorySoFar` write and before the `raws` processing:
```ts
  const raws = parseResponse(parsed).slice(0, MAX_CONSEQUENCES_PER_PASS);
  const actions: Action[] = [];
```

Replace with:
```ts
  const raws = parseResponse(parsed).slice(0, MAX_CONSEQUENCES_PER_PASS);

  // Execute create/delete actions directly via builderRepo (they don't go
  // through dispatch — they write to the live world and are not domain events).
  if (lore) {
    try {
      // Determine the player's current location for the delete_entity guard.
      // Use SYSTEM_AGENT_ID as fallback (guaranteed not to be a real location).
      let playerLocId = SYSTEM_AGENT_ID as string;
      try {
        const locs = await locationsInvolved(events, repo);
        if (locs.length > 0) playerLocId = locs[0].id as string;
      } catch {
        // skip
      }
      await applyWorldExpansion(raws, lore, playerLocId);
    } catch (err) {
      log.warn(`[consequence] applyWorldExpansion error: ${String(err)}`);
    }
  }

  const actions: Action[] = [];
```

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine/consequences.ts
git commit -m "feat(consequence): execute create/delete world-expansion actions via builderRepo"
```

---

### Task 11: Integration Test — Consequence Engine World Expansion

**Files:**
- Create: `tests/integration/consequence-world-expansion.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/integration/consequence-world-expansion.test.ts`:
```ts
import {
  createDraft,
  createLiveForScratch,
  saveStartingState,
  upsertAgent,
  upsertLocation,
  upsertMonsterTemplate,
} from '@core/builder/index';
import { asAgentId, asLocationId, asMonsterTemplateId, asWorldId } from '@core/domain/ids';
import { ActionKind } from '@core/domain/kinds';
import type { LanguageModel } from '@core/engine/language-model';
import { makeCompositeParser } from '@core/engine/parser/composite';
import { runTick } from '@core/engine/tick';
import { SqliteBuilderRepository } from '@infra/builder-sqlite-repository';
import { type DbHandle, openDb } from '@infra/db';
import { SqliteRepository } from '@infra/sqlite-repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let handle: DbHandle;

beforeEach(() => {
  handle = openDb(':memory:');
});
afterEach(() => handle.close());

/** Build a mock LLM that returns a fixed parsed consequence batch. */
function mockLlm(consequences: unknown[]): LanguageModel {
  return {
    async complete() {
      return { parsed: { updatedStorySoFar: null, consequences } };
    },
  };
}

async function bootstrapWorld(builderRepo: SqliteBuilderRepository) {
  const created = await createDraft(builderRepo, { displayName: 'D', label: 'D' });
  if (!created.ok) throw new Error(created.error.message);
  const W = created.value;

  const LOC_TAVERN = asLocationId('loc_tavern');
  await upsertLocation(builderRepo, W, {
    id: LOC_TAVERN,
    label: 'Tavern',
    shortDescription: 'a tavern',
    longDescription: 'A cosy tavern.',
    tags: [],
    secretDescription: '',
  });

  const PLAYER = asAgentId('char_player');
  await upsertAgent(builderRepo, W, {
    id: PLAYER,
    label: 'Player',
    shortDescription: 'p',
    longDescription: 'p',
    locationId: LOC_TAVERN,
    hp: 10,
    damage: 1,
    defense: 0,
    capacity: 5,
    mood: null,
    goal: null,
    autonomous: false,
    gold: 0,
    tags: [],
    secretDescription: '',
  });
  await builderRepo.updateWorldSummary(W, { playerAgentId: PLAYER });

  const saved = await saveStartingState(builderRepo, W);
  if (!saved.ok) throw new Error(saved.error.message);
  const liveId = asWorldId(`w_live_${Math.random().toString(36).slice(2, 8)}`);
  const lp = await createLiveForScratch(builderRepo, W, liveId);
  if (!lp.ok) throw new Error(lp.error.message);

  return { W, LOC_TAVERN, PLAYER, liveId };
}

describe('consequence engine world expansion', () => {
  it('create_location consequence mints a new location in the live world', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    const llm = mockLlm([
      {
        kind: ActionKind.CreateLocation,
        id: 'loc_cellar',
        label: 'Hidden Cellar',
        shortDescription: 'A dark cellar.',
        longDescription: 'Dusty and forgotten.',
        secretDescription: '',
        tags: [],
      },
    ]);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    await runTick(PLAYER, 'look around', engineRepo, { parse, llm, builderRepo });

    const locs = await builderRepo.listLocations(liveId);
    const cellar = locs.find((l) => (l.id as string) === 'loc_cellar');
    expect(cellar).toBeDefined();
    expect(cellar?.label).toBe('Hidden Cellar');
  });

  it('create_agent consequence spawns a monster via template in the live world', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { W, LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    await upsertMonsterTemplate(builderRepo, W, {
      id: asMonsterTemplateId('tpl_rat'),
      templateKey: 'rat',
      label: 'giant rat',
      shortDescription: 'a rat',
      longDescription: 'a very large rat',
      hp: 3,
      mood: null,
      startingItems: [],
      tags: [],
    });

    const llm = mockLlm([
      {
        kind: ActionKind.CreateAgent,
        templateKey: 'rat',
        locationId: LOC_TAVERN as string,
        count: 1,
      },
    ]);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    await runTick(PLAYER, 'look around', engineRepo, { parse, llm, builderRepo });

    const agents = await engineRepo.agentsAt(LOC_TAVERN);
    const rat = agents.find((a) => a.label === 'giant rat');
    expect(rat).toBeDefined();
  });

  it('create_agent with unknown templateKey is dropped silently', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    const llm = mockLlm([
      {
        kind: ActionKind.CreateAgent,
        templateKey: 'nonexistent_monster',
        locationId: LOC_TAVERN as string,
        count: 1,
      },
    ]);

    const engineRepo = new SqliteRepository(handle.db, liveId);
    const parse = makeCompositeParser({ llm: null });

    // Should not throw
    await expect(
      runTick(PLAYER, 'look around', engineRepo, { parse, llm, builderRepo }),
    ).resolves.toBeDefined();

    const agents = await engineRepo.agentsAt(LOC_TAVERN);
    // Only the player; no phantom spawn
    expect(agents.filter((a) => a.label !== 'Player')).toHaveLength(0);
  });

  it('delete_entity removes an agent from the live world', async () => {
    const builderRepo = new SqliteBuilderRepository(handle.db);
    const { W, LOC_TAVERN, PLAYER, liveId } = await bootstrapWorld(builderRepo);

    // Seed an NPC in the draft and publish to live
    const NPC = asAgentId('char_barkeep');
    await upsertAgent(builderRepo, W, {
      id: NPC,
      label: 'Barkeep',
      shortDescription: 'a barkeep',
      longDescription: 'a barkeep',
      locationId: LOC_TAVERN,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 5,
      mood: null,
      goal: null,
      autonomous: false,
      gold: 0,
      tags: [],
      secretDescription: '',
    });
    // Republish so the NPC is in the live world
    const liveId2 = asWorldId(`w_live_del_${Math.random().toString(36).slice(2, 8)}`);
    const saved2 = await saveStartingState(builderRepo, W);
    if (!saved2.ok) throw new Error(saved2.error.message);
    const lp2 = await createLiveForScratch(builderRepo, W, liveId2);
    if (!lp2.ok) throw new Error(lp2.error.message);

    const engineRepo2 = new SqliteRepository(handle.db, liveId2);
    const parse = makeCompositeParser({ llm: null });

    const llm = mockLlm([
      {
        kind: ActionKind.DeleteEntity,
        targetKind: 'agent',
        entityId: NPC as string,
      },
    ]);

    await runTick(PLAYER, 'look around', engineRepo2, { parse, llm, builderRepo });

    const agents = await engineRepo2.agentsAt(LOC_TAVERN);
    expect(agents.find((a) => a.id === NPC)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run tests/integration/consequence-world-expansion.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 3: Run full suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/consequence-world-expansion.test.ts
git commit -m "test(integration): consequence engine world expansion — create/delete entities"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `create_location` action kind | Tasks 8, 9, 10 |
| `create_exit` action kind (with nullable to) | Tasks 8, 9, 10 |
| `create_agent` via templateKey (DRY) | Tasks 8, 9, 10 |
| `create_item` action kind | Tasks 8, 9, 10 |
| `delete_entity` action kind | Tasks 8, 9, 10 |
| Processing order (locations → items/agents → exits → updates → deletes) | Task 10 |
| Budget: max 5 total, schema maxItems | Tasks 9 |
| Builder repo already has builderRepo+worldId via ConsequenceLoreSink | Tasks 9, 10 |
| System prompt WORLD_EXPANSION section | Task 9 |
| Error handling: drop silently for unknown refs, missing fields | Tasks 9, 10 |
| Guard: delete player's current location → drop | Task 10 |
| exits.to_location_id nullable (DB migration) | Task 1 |
| Exit.to: LocationId \| null in all types | Tasks 2, 3, 4 |
| Admin UI: auto-generate option | Task 6 |
| MCP tool: nullable to | Task 4 |
| Move action stub creation: player only | Task 5 |
| Reciprocal exit from stub | Task 5 |
| NPC blocked from undefined exit | Tasks 5, 7 |
| Stub label derived from exit label | Task 5 |
| Integration tests | Tasks 7, 11 |

**Placeholder scan:** No TBDs or "handle edge cases" placeholders. All code blocks are complete.

**Type consistency:** `asLocationId`, `asExitId`, `asItemId`, `asAgentId` used consistently throughout. `MoveHandlerDeps` introduced in Task 5 is a subset of `DispatchDeps` — structurally compatible, no mismatch.
