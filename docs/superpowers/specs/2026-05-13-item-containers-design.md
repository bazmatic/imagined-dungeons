# Item Containers — Design

**Date:** 2026-05-13
**Status:** Approved (brainstormed in-conversation; awaiting written-spec review)

## Goal

Let items contain other items. A closed container hides its contents from perception until opened. Containers may start locked; the matching key auto-unlocks on open.

Concrete authoring target: the Wooden Box at the Flaming Goblet should hold the Rusty Key. `search the room` reveals the box (already works). `open the wooden box` reveals the key.

## Non-goals

- No `lock` action — locks are author-set initial state only.
- No `unlock` action — opening with the key in inventory auto-unlocks.
- No nested-locking UI (lockpicking, hint systems, etc.).
- No engine-level "weight in container" accounting beyond what already exists on `Item.weight`.
- No multi-key locks. `lockedByItem` is a single `ItemId | null`.

## Data model

`Item` gains four fields:

| Field | Type | Default | Notes |
|---|---|---|---|
| `container` | `boolean` | `false` | Authored intent. Gates open/close. |
| `opened` | `boolean` | `true` | Runtime state. Meaningful only when `container=true`. |
| `locked` | `boolean` | `false` | Runtime state. Meaningful only when `container=true`. |
| `lockedByItem` | `ItemId \| null` | `null` | The item-id that unlocks. Mirrors `Exit.lockedByItem`. |

`Item.owner` already supports `ownerKind=item`. No ownership-shape changes.

### Schema migration

`drizzle/0012_item_container.sql` (next slot after current `0011_secret_description.sql`) adds:

```sql
ALTER TABLE items ADD COLUMN container INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN opened INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN locked_by_item TEXT;
```

`UpsertItemInput`, `snapshotJson`, and `copyBlobIntoWorld` all pick up the four fields. Old snapshots without these fields are coerced to the defaults above.

## Perception

`perceive()` filters out any item whose owner-chain passes through a container item with `opened=false`.

Algorithm: for each candidate item at the location, walk `owner` upward. If any ancestor item has `container=true && opened=false`, drop the candidate. Authored `hidden=true` filtering still applies independently. The walk terminates at the first non-item owner (`location` or `agent`).

Looking at a closed container renders only its `longDescription`. The renderer does not enumerate contents. (Author responsibility to keep the description spoiler-free.)

Search behaviour is unchanged: `search` reveals items with `hidden=true` at the location. It does NOT open closed containers. The Rusty Key inside the closed Wooden Box stays invisible until `open` runs.

## Actions

### `open <item>`

Resolution: against the actor's visible items at the location + inventory.

Cases (in order):

1. Target not a container → fail (no state change). Render: `You can't open the <label>.`
2. Already `opened=true` → no-op success. Render: `The <label> is already open.`
3. `locked=true` and `lockedByItem` is held by the actor (carried or equipped) → set `locked=false`, then proceed to step 5.
4. `locked=true` and key not held → fail (no state change). Render: `The <label> is locked.`
5. Set `opened=true`. Render to actor: `You open the <label>. Inside: <comma-list of contents>.` (Empty content list: `You open the <label>. It is empty.`)
   - Auto-unlock case prepends: `You unlock the <label> and open it. Inside: ...`

Observers in the room see: `<Actor> opens the <label>.` No contents leak — the inspection is private to the opener.

Domain event: `EventKind.Open`. Witnesses = everyone in the room including actor.

### `close <item>`

Resolution: same as open.

Cases:

1. Target not a container → fail. Render: `You can't close the <label>.`
2. Already `opened=false` → no-op. Render: `The <label> is already closed.`
3. Otherwise → set `opened=false`. Render: `You close the <label>.` Observers: `<Actor> closes the <label>.`

Domain event: `EventKind.Close`.

### Parser

New verbs in `parser.ts`:

- `open` → Open action.
- `close`, `shut` → Close action.

Both resolve their target via `resolveItem` against `[...view.items, ...inventory]`.

### LLM-interpret

`PLAYER_ACTION_SCHEMA` gains `open` and `close` as recognised action kinds. The emote section of the system prompt drops the "open the box → emote" guidance (added earlier this session) and replaces it with: *"open / close / shut are real actions. Emit `open` / `close` with `itemRef` set to the target. Never route opening or closing of a container, chest, door, lid, etc. to emote."*

`llmInterpret` resolves `itemRef` via `resolveItem` against `[...view.items, ...inventory]` for both verbs. Unresolved → return `null` (composite parser surfaces an impossible-action fallback).

## Admin UI

`ItemForm.tsx` metadata column gains:

- **Container** checkbox.
- **Starts opened** checkbox, default on. Hidden when `container=false`.
- **Starts locked** checkbox, default off. Hidden when `container=false`.
- **Unlocked by** searchable item picker, shown only when `container=true && locked=true`. Lists items in the same world, excluding the current item.

The existing owner picker gains a third option `item`, with a searchable picker of items in the world (excluding the current item).

Server-side `upsertItem` rejects an item whose owner chain would form a cycle (a contains b contains a). Returns a `Result.Err` with `BuilderErrorKind.OwnerCycle`.

## Authoring flow

1. Edit Wooden Box → Container ✓, Starts opened ✗. (Optional: Starts locked ✓, Unlocked by → Brass Key.)
2. Edit Rusty Key → Owner → Item → Wooden Box.
3. Save seed → Reset live.
4. In game: `search the room` → reveals box. `open the wooden box` → reveals key.

## Tests

- **perception.test** — item inside `opened=false` container is filtered; same item visible after `opened=true`; nested chain (item inside item inside closed container) also filtered.
- **parser.test** — `open the box`, `close the chest`, `shut the lid` parse to Open/Close actions; missing-arg and ambiguous-target surface standard errors.
- **actions/open.test** — non-container target fails with no state change; already-open is a no-op success; locked + key-held auto-unlocks and opens; locked + no-key fails without state change; opening reveals contents in actor narration; observer narration omits contents.
- **actions/close.test** — non-container target fails; already-closed no-op; contents disappear from perception after close.
- **llm-interpret.test** — `open <thing>` routes to Open action when target resolves; unresolved target returns null.
- **builder upsert** — server rejects an item whose owner chain forms a cycle (returns `BuilderErrorKind.OwnerCycle`).

## File touch list

Domain / schema:
- `src/infra/schema.ts`
- `drizzle/0012_item_container.sql`
- `src/core/domain/entities.ts`
- `src/core/domain/builder-types.ts`
- `src/core/domain/actions.ts`
- `src/core/domain/kinds.ts` (add `ActionKind.Open`, `ActionKind.Close`, `EventKind.Open`, `EventKind.Close`, `BuilderErrorKind.OwnerCycle`)
- `src/core/domain/events.ts`

Builder / persistence:
- `src/core/builder/index.ts` (snapshot copy paths, owner-cycle validation)
- `src/infra/builder-repository.ts` (writes / reads new columns)

Engine:
- `src/core/engine/perception.ts`
- `src/core/engine/parser.ts`
- `src/core/engine/templates.ts`
- `src/core/engine/actions/open.ts` (new)
- `src/core/engine/actions/close.ts` (new)
- `src/core/engine/actions/registry.ts`
- `src/core/engine/llm-interpret.ts`
- `src/core/engine/llm-output.ts` (schema additions)
- `src/core/engine/llm-prompt.ts` (replace the "open → emote" guidance added earlier)

Admin:
- `app/routes/admin/-components/ItemForm.tsx`
- `app/server/admin/entities.ts` or wherever `upsertItem` lives (server cycle validation)

Tests: matching files under the directories above plus new `open.test.ts` and `close.test.ts`.
