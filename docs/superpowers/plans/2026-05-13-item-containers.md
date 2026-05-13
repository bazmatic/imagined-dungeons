# Item Containers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Items can contain other items. A closed container hides its contents until opened; locked containers auto-unlock when the actor holds the matching key.

**Architecture:** Add `container`, `opened`, `locked`, `lockedByItem` to the Item domain entity (and its DB row + UpsertItemInput + snapshot blob). Perception filters items whose owner-chain passes through a closed container. Two new real actions — `open` and `close` — with parser cases, LLM-interpret integration, and admin UI controls for authoring.

**Tech Stack:** TypeScript strict mode, Drizzle ORM + better-sqlite3, Vitest, TanStack Start/React (admin UI). Const-object discriminators only (no string literals in logic).

**Spec:** [docs/superpowers/specs/2026-05-13-item-containers-design.md](../specs/2026-05-13-item-containers-design.md)

---

## File touch map

| Concern | Files |
|---|---|
| Domain kinds | `src/core/domain/kinds.ts`, `src/core/domain/builder-kinds.ts`, `src/core/domain/events.ts`, `src/core/domain/actions.ts`, `src/core/domain/entities.ts`, `src/core/domain/builder-types.ts` |
| Schema + adapters | `src/infra/schema.ts`, `drizzle/0012_item_container.sql`, `src/infra/builder-sqlite-repository.ts`, `src/infra/builder-memory-repository.ts`, `src/infra/memory-repository.ts` |
| Builder snapshot + cycle check | `src/core/builder/index.ts` |
| Perception | `src/core/engine/perception.ts` |
| Templates | `src/core/engine/templates.ts` |
| Handlers | `src/core/engine/actions/open.ts` (new), `src/core/engine/actions/close.ts` (new), `src/core/engine/actions/registry.ts` |
| Parser | `src/core/engine/parser.ts` |
| LLM | `src/core/engine/llm-output.ts`, `src/core/engine/llm-interpret.ts`, `src/core/engine/llm-prompt.ts` |
| Admin UI | `app/routes/admin/-components/ItemForm.tsx` |

Each task below is one logical change with a test, an implementation, and a commit.

---

### Task 1: Domain discriminators (Open/Close action + event + OwnerCycle error)

**Files:**
- Modify: `src/core/domain/kinds.ts`
- Modify: `src/core/domain/builder-kinds.ts`

- [ ] **Step 1: Add `Open` and `Close` to `ActionKind`**

In `src/core/domain/kinds.ts`, inside the `ActionKind` const object (currently ending at `RevealItem`):

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
} as const;
```

- [ ] **Step 2: Add `Open` and `Close` to `EventKind`**

In the same file, inside `EventKind`:

```ts
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
  Equip: 'equip',
  Unequip: 'unequip',
  Reveal: 'reveal',
  Open: 'open',
  Close: 'close',
} as const;
```

- [ ] **Step 3: Add `OwnerCycle` to `BuilderErrorKind`**

In `src/core/domain/builder-kinds.ts`, inside `BuilderErrorKind`, after `TagLoreDuplicate`:

```ts
  TagLoreDuplicate: 'tag_lore_duplicate',
  ItemOwnerCycle: 'item_owner_cycle',
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (only enum additions; no callers yet).

- [ ] **Step 5: Commit**

```bash
git add src/core/domain/kinds.ts src/core/domain/builder-kinds.ts
git commit -m "domain: add Open/Close action+event kinds and ItemOwnerCycle error kind"
```

---

### Task 2: Item entity gains container fields

**Files:**
- Modify: `src/core/domain/entities.ts:40-58`
- Modify: `src/core/domain/builder-types.ts` (UpsertItemInput)

- [ ] **Step 1: Add container fields to `Item`**

In `src/core/domain/entities.ts`, replace the `Item` interface (currently lines 40–58):

```ts
export interface Item {
  readonly id: ItemId;
  readonly worldId: WorldId;
  readonly label: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly owner: Owner;
  readonly weight: number;
  readonly hidden: boolean;
  readonly tags: readonly string[];
  /**
   * Runtime flag. True while the owning agent is wearing or wielding this
   * item — narrated via equip / unequip. Engine doesn't track separate
   * worn/wielded sub-states; both are conveyed by the emote-description
   * the actor chose at equip time. Always false for items owned by a
   * location or another item.
   */
  readonly equipped: boolean;
  /**
   * Authored intent. True means this item can be opened / closed and may
   * hold other items inside it. Gates the open/close actions and the
   * perception filter for contents.
   */
  readonly container: boolean;
  /** Runtime state. Meaningful only when `container` is true. */
  readonly opened: boolean;
  /** Runtime state. Meaningful only when `container` is true. */
  readonly locked: boolean;
  /** The item-id whose presence in the actor's inventory auto-unlocks this container. */
  readonly lockedByItem: ItemId | null;
}
```

- [ ] **Step 2: Add the same fields to `UpsertItemInput`**

Open `src/core/domain/builder-types.ts`, find `UpsertItemInput`, and add the four fields at the bottom of the interface (mirror the names, types, and nullability above).

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: many errors at every site that constructs an Item literal (memory repo, seeder, tests, etc.) — that's the next tasks' job. Don't fix here; the errors anchor the rest of the work.

- [ ] **Step 4: Commit (broken intermediate, but compiles after Task 3)**

Don't commit yet — bundle with Task 3 to keep `main` green between commits.

---

### Task 3: Memory repo + adapters carry the new fields

**Files:**
- Modify: `src/infra/builder-memory-repository.ts` (around line 139, item construction)
- Modify: `src/infra/memory-repository.ts` (engine-side, if it stores items literally)
- Modify: `src/infra/builder-sqlite-repository.ts:181-200` and `:578-590`

- [ ] **Step 1: Find every literal that builds an `Item`**

Run: `grep -rn "hidden: false\|hidden: true" src/ app/ | grep -v ".test\." | grep -v "node_modules"`
For each line that's constructing an `Item` (not a tagged spawn input on the discovery LLM side), append the four defaults:

```ts
container: false,
opened: true,
locked: false,
lockedByItem: null,
```

For `UpsertItemInput` literals (seeder, builder server fns), do the same.

- [ ] **Step 2: SQLite adapter — extend the insert payload**

In `src/infra/builder-sqlite-repository.ts` near line 185 (`upsertItem` insert path) and line 197 (`onConflictDoUpdate` set), add:

```ts
container: i.container,
opened: i.opened,
locked: i.locked,
lockedByItemId: i.lockedByItem,
```

- [ ] **Step 3: SQLite adapter — extend the row → Item mapper**

Near line 580 of the same file, in the function that builds an `Item` from a row:

```ts
container: r.container,
opened: r.opened,
locked: r.locked,
lockedByItem: r.lockedByItemId === null ? null : asItemId(r.lockedByItemId),
```

- [ ] **Step 4: Memory adapter — same mapping**

In `src/infra/builder-memory-repository.ts` around line 139:

```ts
container: i.container ?? false,
opened: i.opened ?? true,
locked: i.locked ?? false,
lockedByItem: i.lockedByItem ?? null,
```

The `??` defaults absorb old snapshot rows that don't have these fields yet.

- [ ] **Step 5: Engine-side memory repo (if separate)**

Open `src/infra/memory-repository.ts`. If it has a constructor that stores `Item`s, no change is needed — it already accepts whatever shape the caller hands it. Tests in Task 6 will validate.

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Run existing tests**

Run: `npx vitest run`
Expected: every test that constructs an `Item` literal in-line now FAILS with "Property 'container' is missing in type". Fix each by adding the four defaults to the literal. Repeat until all tests pass.

- [ ] **Step 8: Commit**

```bash
git add -u
git commit -m "domain+infra: extend Item with container/opened/locked/lockedByItem (defaults)"
```

---

### Task 4: Drizzle schema + migration

**Files:**
- Modify: `src/infra/schema.ts:58-79`
- Create: `drizzle/0012_item_container.sql`

- [ ] **Step 1: Add columns to the Drizzle table definition**

In `src/infra/schema.ts`, inside the `items = sqliteTable(...)` definition, after the existing `equipped` column:

```ts
container: integer('container', { mode: 'boolean' }).notNull().default(false),
opened: integer('opened', { mode: 'boolean' }).notNull().default(true),
locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
lockedByItemId: text('locked_by_item_id'),
```

(`lockedByItemId` is nullable — no `.notNull()`.)

- [ ] **Step 2: Write the SQL migration**

Create `drizzle/0012_item_container.sql`:

```sql
ALTER TABLE items ADD COLUMN container INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN opened INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN locked_by_item_id TEXT;
```

- [ ] **Step 3: Verify migration applies cleanly**

Run: `rm -f db.sqlite && npx drizzle-kit migrate`
Expected: all migrations including `0012_item_container.sql` apply without error. (If your dev DB lives elsewhere — `var/dev.sqlite`, etc. — substitute the path.)

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infra/schema.ts drizzle/0012_item_container.sql
git commit -m "schema: add container/opened/locked/locked_by_item_id columns to items"
```

---

### Task 5: Builder snapshot copy carries new fields

**Files:**
- Modify: `src/core/builder/index.ts` (search for `copyBlobIntoWorld` and any `asLocInput` / `asItemInput` style helpers; mirror their pattern)

- [ ] **Step 1: Find the snapshot helpers**

Run: `grep -n "container\|opened\|copyBlobIntoWorld\|snapshotJson\|asItemInput\|hidden:" src/core/builder/index.ts`
You should see helpers that fan items in and out of the snapshot blob. Extend each item-shaped record with the four new fields.

- [ ] **Step 2: Update the inbound mapping**

In the function that turns a blob entry into an `UpsertItemInput` (look for one named like `asItemInput` or inline inside `copyBlobIntoWorld`), append:

```ts
container: typeof raw.container === 'boolean' ? raw.container : false,
opened: typeof raw.opened === 'boolean' ? raw.opened : true,
locked: typeof raw.locked === 'boolean' ? raw.locked : false,
lockedByItem:
  typeof raw.lockedByItem === 'string' && raw.lockedByItem.length > 0
    ? asItemId(raw.lockedByItem)
    : null,
```

(Defaults must match the schema defaults so old snapshots round-trip identically.)

- [ ] **Step 3: Update the outbound mapping (snapshotJson)**

Find `snapshotJson` (or equivalent). In the item-serialiser branch, include the four fields verbatim from the in-memory `Item`. Example (adapt to the existing shape):

```ts
container: item.container,
opened: item.opened,
locked: item.locked,
lockedByItem: item.lockedByItem,
```

- [ ] **Step 4: Run snapshot tests**

Run: `npx vitest run src/core/builder`
Expected: PASS. If any test compares snapshots verbatim, update the expected blob to include the new fields.

- [ ] **Step 5: Commit**

```bash
git add src/core/builder/index.ts
git commit -m "builder: snapshot copy carries container/opened/locked/lockedByItem"
```

---

### Task 6: Perception filters by owner-chain

**Files:**
- Modify: `src/core/engine/perception.ts`
- Test: `src/core/engine/perception.test.ts` (or create if missing — check first with `ls src/core/engine/perception.test.ts`)

- [ ] **Step 1: Write the failing test**

Add (or create the file with) the following test. Adapt imports to match the codebase's style (look at `src/core/engine/actions/equip.test.ts` for the canonical Memory-repo-driven test shape):

```ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { perceive } from './perception';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const BOX = asItemId('item_box');
const KEY = asItemId('item_key');
const ACTOR = asAgentId('char_p');

const loc: Location = {
  id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '',
  tags: [], secretDescription: '',
};
const actor: Agent = {
  id: ACTOR, worldId: W, label: 'P', shortDescription: '', longDescription: '',
  locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10,
  mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, tags: [],
};
const closedBox: Item = {
  id: BOX, worldId: W, label: 'wooden box', shortDescription: '', longDescription: '',
  owner: { kind: OwnerKind.Location, id: A }, weight: 1, hidden: false, tags: [], equipped: false,
  container: true, opened: false, locked: false, lockedByItem: null,
};
const keyInBox: Item = {
  id: KEY, worldId: W, label: 'rusty key', shortDescription: '', longDescription: '',
  owner: { kind: OwnerKind.Item, id: BOX }, weight: 0, hidden: false, tags: [], equipped: false,
  container: false, opened: true, locked: false, lockedByItem: null,
};

describe('perceive — container chain', () => {
  it('hides items inside a closed container', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [closedBox, keyInBox], agents: [actor] });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).toContain(BOX as string);
    expect(ids).not.toContain(KEY as string);
  });

  it('reveals items inside an opened container', async () => {
    const opened = { ...closedBox, opened: true };
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [opened, keyInBox], agents: [actor] });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).toContain(BOX as string);
    expect(ids).toContain(KEY as string);
  });

  it('filters through nested closed containers', async () => {
    const INNER = asItemId('item_inner_box');
    const innerBox: Item = { ...closedBox, id: INNER, label: 'inner box',
      owner: { kind: OwnerKind.Item, id: BOX }, container: true, opened: true };
    const keyInInner: Item = { ...keyInBox, owner: { kind: OwnerKind.Item, id: INNER } };
    const repo = new MemoryRepository(W, {
      locations: [loc], exits: [], items: [closedBox, innerBox, keyInInner], agents: [actor],
    });
    const view = await perceive(ACTOR, repo);
    const ids = view.items.map((i) => i.id as string);
    expect(ids).toContain(BOX as string);
    expect(ids).not.toContain(INNER as string); // still inside closed outer
    expect(ids).not.toContain(KEY as string);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npx vitest run src/core/engine/perception.test.ts`
Expected: FAIL — the perceive() function currently returns the key in `view.items` because itemsOwnedBy(location) only returns directly-owned items. The new tests expect transitive items to be included for opened containers, and excluded for closed ones, so the test fails. (If your `itemsOwnedBy` only returns directly-owned items at the location, the perception layer needs to also walk into items at the location and gather their contents — see Step 3.)

- [ ] **Step 3: Implement the perception filter**

Replace `src/core/engine/perception.ts` body with:

```ts
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import { type AgentId, type ItemId, SYSTEM_AGENT_ID } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import type { Repository } from './repository';

export interface PerceptionView {
  readonly actor: Agent;
  readonly location: Location;
  readonly items: readonly Item[];
  readonly agents: readonly Agent[];
  readonly exits: readonly Exit[];
}

/**
 * Walk an item's owner-chain upward. If the chain reaches any container item
 * with `opened === false`, the item is hidden from perception. The walk
 * terminates as soon as it leaves the item layer (owner becomes location/agent).
 */
function isReachable(item: Item, byId: ReadonlyMap<ItemId, Item>): boolean {
  let cursor: Item | undefined = item;
  while (cursor && cursor.owner.kind === OwnerKind.Item) {
    const parent = byId.get(cursor.owner.id);
    if (!parent) return false; // dangling owner → drop
    if (parent.container && !parent.opened) return false;
    cursor = parent;
  }
  return true;
}

export async function perceive(actorId: AgentId, repo: Repository): Promise<PerceptionView> {
  const actor = await repo.getAgent(actorId);
  const location = await repo.getLocation(actor.locationId);
  // All items at the location, plus items transitively owned by those items.
  // The repo's itemsOwnedBy(location) returns only the items DIRECTLY owned
  // by the location. To surface contents of opened containers, we collect
  // every item at the location and walk into items recursively.
  const direct = await repo.itemsOwnedBy({ kind: OwnerKind.Location, id: location.id });
  const collected = new Map<ItemId, Item>();
  const stack: Item[] = [...direct];
  while (stack.length > 0) {
    const it = stack.pop();
    if (!it || collected.has(it.id)) continue;
    collected.set(it.id, it);
    const children = await repo.itemsOwnedBy({ kind: OwnerKind.Item, id: it.id });
    for (const c of children) stack.push(c);
  }
  const items = [...collected.values()].filter(
    (i) => !i.hidden && isReachable(i, collected),
  );
  const agentsHere = await repo.agentsAt(location.id);
  const agents = agentsHere.filter((a) => a.id !== actorId && a.id !== SYSTEM_AGENT_ID);
  const exits = await repo.exitsFrom(location.id);
  return { actor, location, items, agents, exits };
}
```

- [ ] **Step 4: Confirm `Repository.itemsOwnedBy` accepts `OwnerKind.Item`**

Run: `grep -n "itemsOwnedBy" src/infra/memory-repository.ts src/infra/builder-sqlite-repository.ts`
If the in-engine memory repo currently only handles location/agent owners, extend it now to also filter by item-owner. Mirror the existing pattern.

- [ ] **Step 5: Run perception test**

Run: `npx vitest run src/core/engine/perception.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: PASS. (Some look/search tests may now also see additional items if their fixtures place items inside non-existent containers — fix the fixtures to use `container=false`.)

- [ ] **Step 7: Commit**

```bash
git add src/core/engine/perception.ts src/core/engine/perception.test.ts src/infra/memory-repository.ts
git commit -m "engine: perception filters items inside closed containers via owner-chain walk"
```

---

### Task 7: Templates for open/close

**Files:**
- Modify: `src/core/engine/templates.ts` (after the existing `renderUnequipObserved`)

- [ ] **Step 1: Add render functions**

```ts
export function renderOpenSelf(item: Item, contents: readonly Item[], unlocked: boolean): string {
  const lead = unlocked
    ? `You unlock the ${item.label} and open it.`
    : `You open the ${item.label}.`;
  if (contents.length === 0) return `${lead} It is empty.`;
  const names = contents.map((c) => c.label).join(', ');
  return `${lead} Inside: ${names}.`;
}

export function renderOpenObserved(actor: Agent, item: Item): string {
  return `${actor.label} opens the ${item.label}.`;
}

export function renderCloseSelf(item: Item): string {
  return `You close the ${item.label}.`;
}

export function renderCloseObserved(actor: Agent, item: Item): string {
  return `${actor.label} closes the ${item.label}.`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/templates.ts
git commit -m "engine: add open/close render templates"
```

---

### Task 8: Open action

**Files:**
- Create: `src/core/engine/actions/open.ts`
- Create: `src/core/engine/actions/open.test.ts`
- Modify: `src/core/domain/actions.ts` (add `{ kind: 'open'; actorId: AgentId; itemId: ItemId }`)

- [ ] **Step 1: Add to the `Action` union**

In `src/core/domain/actions.ts`, after the `unequip` line:

```ts
  | { kind: 'open'; actorId: AgentId; itemId: ItemId }
  | { kind: 'close'; actorId: AgentId; itemId: ItemId }
```

- [ ] **Step 2: Write the failing test**

Create `src/core/engine/actions/open.test.ts`. Mirror the fixture pattern from `equip.test.ts`. The five required cases:

```ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleOpen } from './open';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const BOX = asItemId('item_box');
const KEY = asItemId('item_key');
const ACTOR = asAgentId('char_p');

const loc: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };
const actor: Agent = { id: ACTOR, worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, tags: [] };
const baseItem = { worldId: W, shortDescription: '', longDescription: '', weight: 1, hidden: false, tags: [], equipped: false } as const;
const closedBox: Item = { ...baseItem, id: BOX, label: 'wooden box', owner: { kind: OwnerKind.Location, id: A }, container: true, opened: false, locked: false, lockedByItem: null };
const keyInBox: Item = { ...baseItem, id: KEY, label: 'rusty key', owner: { kind: OwnerKind.Item, id: BOX }, container: false, opened: true, locked: false, lockedByItem: null };
const heldKey: Item = { ...keyInBox, owner: { kind: OwnerKind.Agent, id: ACTOR } };
const swordOnFloor: Item = { ...baseItem, id: asItemId('item_sword'), label: 'sword', owner: { kind: OwnerKind.Location, id: A }, container: false, opened: true, locked: false, lockedByItem: null };

describe('handleOpen', () => {
  it('opens an unlocked container and reveals contents in actor render', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [closedBox, keyInBox], agents: [actor] });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('You open the wooden box. Inside: rusty key.');
    expect(r.value.event.kind).toBe(EventKind.Open);
    const updated = await repo.getItem(BOX);
    expect(updated.opened).toBe(true);
  });

  it('renders "It is empty." when the container has no contents', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [closedBox], agents: [actor] });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('You open the wooden box. It is empty.');
  });

  it('is a no-op when the container is already open', async () => {
    const opened = { ...closedBox, opened: true };
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [opened], agents: [actor] });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('The wooden box is already open.');
  });

  it('fails when the target is not a container', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [swordOnFloor], agents: [actor] });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: swordOnFloor.id }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/can't open/i);
  });

  it('auto-unlocks when actor carries the matching key', async () => {
    const lockedBox = { ...closedBox, locked: true, lockedByItem: KEY };
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [lockedBox, heldKey], agents: [actor] });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toMatch(/^You unlock the wooden box and open it\./);
    const updated = await repo.getItem(BOX);
    expect(updated.locked).toBe(false);
    expect(updated.opened).toBe(true);
  });

  it('fails when locked and the key is not held', async () => {
    const lockedBox = { ...closedBox, locked: true, lockedByItem: KEY };
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [lockedBox, keyInBox], agents: [actor] });
    const r = await handleOpen({ kind: ActionKind.Open, actorId: ACTOR, itemId: BOX }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toBe('The wooden box is locked.');
    const updated = await repo.getItem(BOX);
    expect(updated.locked).toBe(true);
    expect(updated.opened).toBe(false);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `npx vitest run src/core/engine/actions/open.test.ts`
Expected: FAIL ("Cannot find module './open'").

- [ ] **Step 4: Implement the handler**

Create `src/core/engine/actions/open.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderOpenSelf } from '../templates';
import type { ActionOutcome } from './types';

export async function handleOpen(
  action: Extract<Action, { kind: 'open' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);

  if (!item.container) return Err(`You can't open the ${item.label}.`);
  if (item.opened) return Ok({ render: `The ${item.label} is already open.`, event: await emitOpenEvent(view.location.id, repo, action, item, false) });

  let unlocked = false;
  if (item.locked) {
    const key = item.lockedByItem;
    const inventory = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: action.actorId });
    const holdsKey = key !== null && inventory.some((i) => i.id === key);
    if (!holdsKey) return Err(`The ${item.label} is locked.`);
    await repo.setItemLocked(item.id, false);
    unlocked = true;
  }

  await repo.setItemOpened(item.id, true);
  const contents = await repo.itemsOwnedBy({ kind: OwnerKind.Item, id: item.id });
  const event = await emitOpenEvent(view.location.id, repo, action, item, unlocked);
  return Ok({ render: renderOpenSelf(item, contents, unlocked), event });
}

async function emitOpenEvent(
  locationId: ReturnType<typeof Object>['id'] extends string ? string : string,
  repo: Repository,
  action: Extract<Action, { kind: 'open' }>,
  item: Awaited<ReturnType<Repository['getItem']>>,
  unlocked: boolean,
): Promise<DomainEvent> {
  // (locationId param kept loose to avoid an extra import; tighten if you like.)
  void locationId;
  const witnesses = (await repo.agentsAt(item.owner.kind === OwnerKind.Location ? item.owner.id : (await repo.getAgent(action.actorId)).locationId)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(),
    worldId: await repo.getWorldId(),
    actorId: action.actorId,
    kind: EventKind.Open,
    witnesses,
    createdAt: new Date(),
    itemId: item.id,
    unlocked,
  };
  await repo.appendEvent(event);
  return event;
}
```

Note: the `Open` event shape (`itemId`, `unlocked`) must be added to `src/core/domain/events.ts`. If `events.ts` uses a discriminated union, append:

```ts
  | {
      readonly kind: typeof EventKind.Open;
      readonly id: EventId;
      readonly worldId: WorldId;
      readonly actorId: AgentId;
      readonly witnesses: readonly AgentId[];
      readonly createdAt: Date;
      readonly itemId: ItemId;
      readonly unlocked: boolean;
    }
```

Also add `setItemOpened(id, value)` and `setItemLocked(id, value)` to the `Repository` port and implement them in `src/infra/memory-repository.ts` and `src/infra/builder-sqlite-repository.ts` (mirror the existing `setItemEquipped` / `setItemHidden` pattern).

- [ ] **Step 5: Run test**

Run: `npx vitest run src/core/engine/actions/open.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine/actions/open.ts src/core/engine/actions/open.test.ts src/core/domain/actions.ts src/core/domain/events.ts src/core/engine/repository.ts src/infra/memory-repository.ts src/infra/builder-sqlite-repository.ts
git commit -m "engine: open action — reveals contents, auto-unlocks with held key"
```

---

### Task 9: Close action

**Files:**
- Create: `src/core/engine/actions/close.ts`
- Create: `src/core/engine/actions/close.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { ActionKind, EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleClose } from './close';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const BOX = asItemId('item_box');
const ACTOR = asAgentId('char_p');
const loc: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };
const actor: Agent = { id: ACTOR, worldId: W, label: 'Paff', shortDescription: '', longDescription: '', locationId: A, hp: 10, damage: 0, defense: 0, capacity: 10, mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, tags: [] };
const baseItem = { worldId: W, shortDescription: '', longDescription: '', weight: 1, hidden: false, tags: [], equipped: false } as const;
const openedBox: Item = { ...baseItem, id: BOX, label: 'wooden box', owner: { kind: OwnerKind.Location, id: A }, container: true, opened: true, locked: false, lockedByItem: null };
const sword: Item = { ...baseItem, id: asItemId('item_sword'), label: 'sword', owner: { kind: OwnerKind.Location, id: A }, container: false, opened: true, locked: false, lockedByItem: null };

describe('handleClose', () => {
  it('closes an opened container', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [openedBox], agents: [actor] });
    const r = await handleClose({ kind: ActionKind.Close, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('You close the wooden box.');
    expect(r.value.event.kind).toBe(EventKind.Close);
    expect((await repo.getItem(BOX)).opened).toBe(false);
  });

  it('is a no-op when already closed', async () => {
    const closed = { ...openedBox, opened: false };
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [closed], agents: [actor] });
    const r = await handleClose({ kind: ActionKind.Close, actorId: ACTOR, itemId: BOX }, repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.render).toBe('The wooden box is already closed.');
  });

  it('fails when target is not a container', async () => {
    const repo = new MemoryRepository(W, { locations: [loc], exits: [], items: [sword], agents: [actor] });
    const r = await handleClose({ kind: ActionKind.Close, actorId: ACTOR, itemId: sword.id }, repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toMatch(/can't close/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/core/engine/actions/close.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/core/engine/actions/close.ts`:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { nextEventId } from '../ids-gen';
import { perceive } from '../perception';
import type { Repository } from '../repository';
import { renderCloseSelf } from '../templates';
import type { ActionOutcome } from './types';

export async function handleClose(
  action: Extract<Action, { kind: 'close' }>,
  repo: Repository,
): Promise<Result<ActionOutcome, string>> {
  const view = await perceive(action.actorId, repo);
  const item = await repo.getItem(action.itemId);
  if (!item.container) return Err(`You can't close the ${item.label}.`);
  if (!item.opened) {
    const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
    const event: DomainEvent = {
      id: nextEventId(), worldId: await repo.getWorldId(), actorId: action.actorId,
      kind: EventKind.Close, witnesses, createdAt: new Date(), itemId: item.id,
    };
    await repo.appendEvent(event);
    return Ok({ render: `The ${item.label} is already closed.`, event });
  }
  await repo.setItemOpened(item.id, false);
  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const event: DomainEvent = {
    id: nextEventId(), worldId: await repo.getWorldId(), actorId: action.actorId,
    kind: EventKind.Close, witnesses, createdAt: new Date(), itemId: item.id,
  };
  await repo.appendEvent(event);
  return Ok({ render: renderCloseSelf(item), event });
}
```

Add the `Close` event variant to `src/core/domain/events.ts` (same shape as Open minus `unlocked`).

- [ ] **Step 4: Run test**

Run: `npx vitest run src/core/engine/actions/close.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine/actions/close.ts src/core/engine/actions/close.test.ts src/core/domain/events.ts
git commit -m "engine: close action — flips opened=false on container"
```

---

### Task 10: Parser verbs

**Files:**
- Modify: `src/core/engine/parser.ts` (add `open` and `close`/`shut` cases in the switch around line 73)
- Modify: `src/core/engine/parser.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/core/engine/parser.test.ts`:

```ts
describe('open / close verbs', () => {
  it('parses "open the box" to an Open action against the visible item', () => {
    // Use the existing test harness — copy a `view()`/`inv()` helper from a nearby test.
    // Make a container item available in `view`, then:
    const r = parse('open the box', ACTOR, view([containerBox]), inv());
    if (r.kind !== ActionKind.Open) throw new Error('expected open');
    expect(r.itemId).toBe(containerBox.id);
  });

  it('parses "shut the chest" to Close', () => {
    const r = parse('shut the chest', ACTOR, view([chestItem]), inv());
    if (r.kind !== ActionKind.Close) throw new Error('expected close');
  });

  it('returns NoSuchTarget when the item is not visible', () => {
    const r = parse('open the box', ACTOR, view([]), inv());
    if ('actorId' in r) throw new Error('expected error');
    expect(r.kind).toBe(ParseErrorKind.NoSuchTarget);
  });

  it('returns MissingArgument for a bare "open"', () => {
    const r = parse('open', ACTOR, view(), inv());
    if ('actorId' in r) throw new Error('expected error');
    expect(r.kind).toBe(ParseErrorKind.MissingArgument);
  });
});
```

(Refer to the existing tests around lines 130–150 in `parser.test.ts` for the `view()`/`inv()` helper shape and reuse them.)

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/core/engine/parser.test.ts`
Expected: FAIL — `parse` returns `unknown_verb` for `open`.

- [ ] **Step 3: Add cases to the parser**

In `src/core/engine/parser.ts`, immediately after the `attack`/`kill`/`fight` case (around line 499 — locate it before the trailing `}` of the switch):

```ts
    case 'open': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };
      const ref = rest.join(' ');
      const r = resolveItem(ref, [...view.items, ...inventory]);
      if (!r.ok) return r.error;
      return { kind: ActionKind.Open, actorId: actor.id, itemId: r.item.id };
    }

    case 'close':
    case 'shut': {
      const rest = stripStopWords(toks.slice(1));
      if (rest.length === 0) return { kind: ParseErrorKind.MissingArgument, verb: first };
      const ref = rest.join(' ');
      const r = resolveItem(ref, [...view.items, ...inventory]);
      if (!r.ok) return r.error;
      return { kind: ActionKind.Close, actorId: actor.id, itemId: r.item.id };
    }
```

- [ ] **Step 4: Run parser tests**

Run: `npx vitest run src/core/engine/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine/parser.ts src/core/engine/parser.test.ts
git commit -m "engine: parser — open/close/shut verbs route to Open/Close actions"
```

---

### Task 11: Action registry wires the handlers

**Files:**
- Modify: `src/core/engine/actions/registry.ts`

- [ ] **Step 1: Add dispatch cases**

Open `src/core/engine/actions/registry.ts`. Find the dispatch switch (look for existing `handleEquip` / `handleUnequip` cases). Add:

```ts
import { handleOpen } from './open';
import { handleClose } from './close';

// ... inside the switch:
    case ActionKind.Open:
      return handleOpen(action, repo);
    case ActionKind.Close:
      return handleClose(action, repo);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/engine/actions/registry.ts
git commit -m "engine: registry — dispatch Open and Close actions"
```

---

### Task 12: LLM-interpret learns open/close as real actions

**Files:**
- Modify: `src/core/engine/llm-output.ts` (PLAYER_ACTION_SCHEMA enums + validator)
- Modify: `src/core/engine/llm-interpret.ts` (switch case)
- Modify: `src/core/engine/llm-prompt.ts` (replace the "open → emote" guidance from earlier this session)

- [ ] **Step 1: Extend the LLM action schema**

In `src/core/engine/llm-output.ts`, find the `kind` enum (covers `move`/`look`/.../`unequip`/`impossible`/`unknown`) and add `'open'` and `'close'`. Wherever `itemRef` is documented, note that it's required for both.

If there's a `validatePlayerAction` that has a switch on `kind`, add branches:

```ts
case ActionKind.Open:
  if (typeof parsed.itemRef !== 'string') return { kind: 'invalid' };
  return { kind: ActionKind.Open, itemRef: parsed.itemRef };

case ActionKind.Close:
  if (typeof parsed.itemRef !== 'string') return { kind: 'invalid' };
  return { kind: ActionKind.Close, itemRef: parsed.itemRef };
```

- [ ] **Step 2: Dispatch in `llmInterpret`**

In `src/core/engine/llm-interpret.ts`, after the `Unequip` case:

```ts
case ActionKind.Open: {
  const r = resolveItem(validated.itemRef, [...view.items, ...inventory]);
  if (!r.ok) return null;
  return { kind: ActionKind.Open, actorId: actor.id, itemId: r.item.id };
}
case ActionKind.Close: {
  const r = resolveItem(validated.itemRef, [...view.items, ...inventory]);
  if (!r.ok) return null;
  return { kind: ActionKind.Close, actorId: actor.id, itemId: r.item.id };
}
```

- [ ] **Step 3: Replace the prompt guidance**

In `src/core/engine/llm-prompt.ts`, find the `open the wooden box` example added earlier (it routes to emote). Remove that line. Then add, in the "Available kinds" section near the other real actions:

```
- open: open a container, chest, drawer, lid, door, etc. Emit when the input says "open <thing>". Set kind="open", itemRef=the item to open. All other fields null. Never route opening to emote. Never tell the player "<thing> is closed; you need to open it" — that is exactly what they just tried.
  Example "open the wooden box" -> { "kind":"open", "itemRef":"wooden box" }.

- close: shut a container. Set kind="close", itemRef=the target. All other fields null.
  Example "shut the chest" -> { "kind":"close", "itemRef":"chest" }.
```

- [ ] **Step 4: Write a regression test**

Add to `src/core/engine/llm-interpret.test.ts` (or wherever the LLM interpret tests live — `grep -l "llmInterpret" src/core/engine/*.test.ts`):

```ts
it('routes "open the box" to an Open action when the item resolves', async () => {
  const llm = stubLlm({ kind: 'open', itemRef: 'wooden box' });
  const result = await llmInterpret('open the box', actor, viewWithBox, [], llm);
  if (!result || !('actorId' in result)) throw new Error('expected action');
  expect(result.kind).toBe(ActionKind.Open);
});

it('returns null when "open <thing>" cannot resolve', async () => {
  const llm = stubLlm({ kind: 'open', itemRef: 'nonsense' });
  const result = await llmInterpret('open nonsense', actor, viewWithBox, [], llm);
  expect(result).toBeNull();
});
```

(Use whatever `stubLlm` helper already exists in the test file.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/core/engine/llm-interpret.test.ts src/core/engine/llm-output.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine/llm-output.ts src/core/engine/llm-interpret.ts src/core/engine/llm-prompt.ts src/core/engine/llm-interpret.test.ts
git commit -m "engine: LLM-interpret routes open/close as real actions (not emote)"
```

---

### Task 13: Owner-cycle validation in builder upsertItem

**Files:**
- Modify: `src/core/builder/index.ts` (the `upsertItem` server function — find via `grep -n "upsertItem" src/core/builder/index.ts`)
- Test: same file's test suite or `src/core/builder/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the builder test file:

```ts
it('rejects an item whose owner chain forms a cycle', async () => {
  const repo = makeBuilderRepo(); // existing helper
  const w = await createWorld(repo, { displayName: 'X', label: 'x' });
  if (!w.ok) throw new Error('world create failed');
  const worldId = w.value;
  // box owns key; key owns box → cycle.
  await upsertItem(repo, worldId, { id: asItemId('box'), label: 'box', shortDescription: '', longDescription: '', ownerKind: OwnerKind.Location, ownerId: 'loc_a', weight: 1, hidden: false, tags: [], container: true, opened: false, locked: false, lockedByItem: null });
  await upsertItem(repo, worldId, { id: asItemId('key'), label: 'key', shortDescription: '', longDescription: '', ownerKind: OwnerKind.Item, ownerId: 'box', weight: 0, hidden: false, tags: [], container: false, opened: true, locked: false, lockedByItem: null });
  const r = await upsertItem(repo, worldId, { id: asItemId('box'), label: 'box', shortDescription: '', longDescription: '', ownerKind: OwnerKind.Item, ownerId: 'key', weight: 1, hidden: false, tags: [], container: true, opened: false, locked: false, lockedByItem: null });
  if (r.ok) throw new Error('expected cycle rejection');
  expect(r.error.kind).toBe(BuilderErrorKind.ItemOwnerCycle);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/core/builder`
Expected: FAIL.

- [ ] **Step 3: Implement the cycle check**

In `src/core/builder/index.ts`, in the body of `upsertItem` (after the basic field validation, before persisting), insert:

```ts
if (input.ownerKind === OwnerKind.Item) {
  // Walk the proposed parent chain. If we re-encounter `input.id`, it's a cycle.
  const seen = new Set<string>([input.id as string]);
  let cursor: string | null = input.ownerId;
  while (cursor !== null) {
    if (seen.has(cursor)) {
      return Err(err(BuilderErrorKind.ItemOwnerCycle, `item ${input.id} would form an ownership cycle through ${cursor}`));
    }
    seen.add(cursor);
    // Load parent. If parent is not an item, the chain ends.
    const parent = await repo.getItem(worldId, asItemId(cursor)).catch(() => null);
    if (!parent || parent.owner.kind !== OwnerKind.Item) break;
    cursor = parent.owner.id as string;
  }
}
```

(Adapt the exact API to whatever the builder repo's `getItem` signature is — see the existing `upsertItem` for the pattern.)

- [ ] **Step 4: Run test**

Run: `npx vitest run src/core/builder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/builder/index.ts src/core/builder/index.test.ts
git commit -m "builder: upsertItem rejects owner chains that form a cycle"
```

---

### Task 14: Admin ItemForm — container + opened + locked + owner-item picker

**Files:**
- Modify: `app/routes/admin/-components/ItemForm.tsx`

- [ ] **Step 1: Read the current form**

Run: `cat app/routes/admin/-components/ItemForm.tsx`
Identify the metadata column (look for `MetadataColumn` / `row-editor__grid`) and the existing owner picker.

- [ ] **Step 2: Extend local state and form state**

The form's `useState<{...}>` initial-value block needs `container`, `opened`, `locked`, `lockedByItem` initialised from the existing item (or sensible defaults — `container: false, opened: true, locked: false, lockedByItem: null`).

- [ ] **Step 3: Render the new controls**

Inside `<MetadataColumn>`, after the existing controls, add:

```tsx
<label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
  <input type="checkbox" checked={v.container} onChange={(e) => setV({ ...v, container: e.target.checked })} />
  Container
</label>
{v.container ? (
  <>
    <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
      <input type="checkbox" checked={v.opened} onChange={(e) => setV({ ...v, opened: e.target.checked })} />
      Starts opened
    </label>
    <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
      <input type="checkbox" checked={v.locked} onChange={(e) => setV({ ...v, locked: e.target.checked, lockedByItem: e.target.checked ? v.lockedByItem : null })} />
      Starts locked
    </label>
    {v.locked ? (
      <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
        <label className="row-editor__field-label" htmlFor="itm-key">Unlocked by</label>
        <select id="itm-key" className="row-editor__select" value={v.lockedByItem ?? ''} onChange={(e) => setV({ ...v, lockedByItem: e.target.value === '' ? null : e.target.value })}>
          <option value="">(none)</option>
          {tree.items.filter((i) => (i.id as string) !== v.id).map((i) => (
            <option key={i.id as string} value={i.id as string}>{i.label}</option>
          ))}
        </select>
      </div>
    ) : null}
  </>
) : null}
```

- [ ] **Step 4: Extend the owner picker**

Find the current owner picker (a `<select>` of locations + agents). Add a third sub-group for items. The simplest approach: a top-level "owner kind" select (`location` / `agent` / `item`) plus a dependent select of candidates. Adapt to whatever shape the form already uses — preserve its visual conventions.

When `ownerKind === 'item'`, the candidate `<select>` lists `tree.items.filter((i) => (i.id as string) !== v.id)`.

- [ ] **Step 5: Pass the new fields into the save payload**

In the `save` callback, include the four fields in the `payload` object passed to `upsertItem`/`saveEntity`.

- [ ] **Step 6: Typecheck and start dev server**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `pnpm dev` (or whatever the project uses).
Manually: open a draft world's Items category, mark an item as Container ✓ Starts opened ✗, save, reload — verify the values persist. Save another item with Owner → Item → that container, save, reload — verify owner persists.

- [ ] **Step 7: Commit**

```bash
git add app/routes/admin/-components/ItemForm.tsx
git commit -m "admin: ItemForm — container/opened/locked controls + item-owner picker"
```

---

### Task 15: End-to-end smoke test

**Files:** none — manual.

- [ ] **Step 1: Reseed**

Open the seed world (Seed Version) for your campaign. Edit the Wooden Box: Container ✓, Starts opened ✗. Edit the Rusty Key: Owner → Item → Wooden Box. Save Seed. Reset live from the admin index.

- [ ] **Step 2: Play through**

Start a session. Then:

```
> search the room
You spot the wooden box you hadn't noticed before. (...narration...)
> open the wooden box
You open the wooden box. Inside: rusty key.
> take the rusty key
Taken: rusty key.
```

- [ ] **Step 3: Locked variant**

Add a Brass Key item at the same location. Edit Wooden Box: Starts locked ✓, Unlocked by → Brass Key. Save Seed → Reset.

```
> open the wooden box
The wooden box is locked.
> take the brass key
Taken: brass key.
> open the wooden box
You unlock the wooden box and open it. Inside: rusty key.
```

- [ ] **Step 4: Close & rehide**

```
> close the wooden box
You close the wooden box.
> look
(rusty key no longer listed in the room)
```

- [ ] **Step 5: Final commit (if any leftover docs / changelog updates)**

If you keep a CHANGELOG, add a one-line entry. Otherwise nothing to commit.

---

## Self-review notes

**Spec coverage:**
- Data model (entities + UpsertItemInput) → Task 2.
- Schema migration → Task 4.
- Snapshot copy → Task 5.
- Perception chain-walk → Task 6.
- Open / Close handlers → Tasks 8, 9.
- Parser verbs → Task 10.
- LLM-interpret (schema + prompt + dispatch) → Task 12.
- Owner-cycle validation → Task 13.
- Admin UI (container/opened/locked + owner-item picker) → Task 14.
- Tests for perception, open, close, parser, llm-interpret, builder → Tasks 6, 8, 9, 10, 12, 13.

**Type/name consistency check:**
- `container`, `opened`, `locked`, `lockedByItem` — used consistently across tasks (entities, repo adapters, snapshot, perception, handlers, UI).
- `ActionKind.Open` / `ActionKind.Close` and `EventKind.Open` / `EventKind.Close` — added in Task 1, referenced in Tasks 8–12.
- `BuilderErrorKind.ItemOwnerCycle` — added in Task 1, referenced in Task 13.
- `setItemOpened` / `setItemLocked` — introduced in Task 8 as new repo port methods; the migration of memory + sqlite repos happens in that same task.

**Notable risks called out for the implementer:**
- Task 6 changes the meaning of "items in the perception view" — it now includes items inside opened containers. Pre-existing tests that built fixtures assuming contents are filtered may now break; the task tells the implementer to fix fixtures.
- Task 3 will produce a long tail of compile errors at every Item literal in tests; the task explicitly tells the implementer to expect and chase them down.
- Task 12 replaces the prompt example added earlier this session (`open the wooden box -> emote`). The implementer must remove the old example, not just append the new one.
