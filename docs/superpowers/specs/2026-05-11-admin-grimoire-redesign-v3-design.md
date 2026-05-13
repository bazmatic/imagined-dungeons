# Admin Grimoire Redesign v3 — Design Spec

**Date:** 2026-05-11
**Predecessors:** v1 + v2 (committed). v3 restructures master-pane navigation, replaces JSON forms with real per-entity forms, and fixes the Bestiary click bug.
**Driving feedback:** exits should live on the location page (not as separate tree nodes); agents and items need their own panes with a location/owner picker; clicking Bestiary in the side nav does nothing.

## Goal

Restructure the detail-route master pane from "one hierarchical tree of everything" to "four flat per-category lists" driven by the side nav. Replace JSON fallback editors with real structured forms for Exit, Agent, Item, MonsterTemplate, and LocationSpawnTrigger. Move Exits and Triggers off the tree and onto the Location detail as inline editable sub-lists. Move World Settings off the tree and into a top-bar button.

## Non-goals

- Mobile responsive collapse.
- Schema changes (none required; everything we need is already in the data model).
- Pixel-exact reproduction of any prior mockup. The visual language stays exactly as v2.
- Replacing the JSON form *itself* — the file stays as a last-resort escape hatch, but no entity should default to it after v3.

## Information architecture (after v3)

```
Top bar
├─ Imagined Archive title (link to /admin)
├─ Draft / Live / Archive tabs
└─ Right side
   ├─ Search/palette trigger
   ├─ Draft chip (if draft)
   ├─ World Settings button   ← NEW: opens the world-settings entity in the detail pane
   ├─ Reset / Publish (if draft)
   └─ Problems flag button (existing drawer trigger)

Side nav (detail route)
├─ Locations    ← active by default
├─ Bestiary
├─ Agents
└─ Items
   (Lore / Characters categories removed; they were stubs in v2 and confused the IA)

Master pane (driven by ?cat=…)
└─ Flat alphabetical list of the active category's entities

Detail pane
└─ Per-entity form (no JSON fallback for the five entity kinds listed above)
```

Selected category persists in the URL as `?cat=locations|bestiary|agents|items` (default: `locations`).
Selected entity persists in the URL as `?sel=<entityId>` (default: none — detail pane shows an empty-state hint).

These are search params on the existing `/admin/$worldId` route — no new routes.

## Per-pane shapes

### Locations pane

Master list: flat alphabetical, one row per location. Each row shows label + ID dim subtitle. Row click sets `?sel=<locationId>`.

Detail form (top to bottom):
- EntityHeader: kind "Location", title = label.
- Two-column form grid (8/4):
  - **Left**: Label, Short Description, Long Description (Manuscript card).
  - **Right**: Key Visual placeholder (read-only here — only world settings is editable), Tags panel (existing v2).
- **Exits sub-section** (full-width below the grid): a list of editable exit rows + an "Add Exit" affordance. See "Exit row" below.
- **Triggers sub-section** (full-width below exits): a list of editable trigger rows + "Add Trigger". See "Trigger row".
- FootnoteBar with word count + delete.

#### Exit row (NEW component)

A single exit shown inline on its source location. Fields:
- **Direction** — text input (e.g., "north", "down", "iron gate"). The DESIGN.md treats direction as free-form text since v1; we preserve that.
- **Destination** — `<select>` populated from `tree.locations` (excluding the current location to prevent self-loops; existing self-loops still display but the option list won't add new ones — that's tolerable UX).
- **Locked** — checkbox.
- **Locked by item** — `<select>` populated from `tree.items`, shown only when "Locked" is checked. "(none)" option clears it.
- **Delete** — small × button removes the exit immediately (no confirm — exits are cheap to recreate).

The form is uncontrolled per-row state to avoid re-render storms when typing in one row's direction field. Saving is implicit-on-blur or explicit-on-save? **Explicit**: each exit row has its own "Save" pill that fires `upsertExit`. The location's main Save button does NOT batch-save exits — exits save individually. (Rationale: a batch save means typing in one exit then switching to another could silently lose the unsaved row. Per-row save is verbose but predictable.)

The "Add Exit" affordance is a single button that creates a new row in local state with a generated id (`exit_<random>`) and stages it. The new row's Save button performs the initial insert.

#### Trigger row (NEW component)

Mirrors Exit row. Fields:
- **Event kind** — `<select>` over `TriggerEventKind` values (PlayerEnters, CombatStarts, ItemTaken, Speech, LlmJudgement).
- **Template** — `<select>` populated from `tree.templates` (the bestiary).
- **Count** — number input.
- **One-shot** — checkbox.
- **Fire on initial publish** — checkbox.
- **Conditional fields** based on event kind: `itemTemplateKey` text input (ItemTaken only), `phrase` text input (Speech only), `predicate` text input (LlmJudgement only). Hidden otherwise.

Per-row Save and Delete buttons.

### Bestiary pane

Master list: flat alphabetical of templates. Detail form:
- EntityHeader: kind "Monster Template", title = label.
- Form fields: Label, Template Key (read-only after creation), Short Description, Long Description (Manuscript), HP (number), Mood (text, optional).
- Starting Items: a list of inline starter-pack rows. Each row: label, short description, long description, weight, hidden checkbox. Plus an "Add starter item". This is a slightly larger sub-form so we extract it as `StarterItemsEditor`.
- Save / Delete in FootnoteBar.

### Agents pane

Master list: flat alphabetical. Each row shows label + a dim italic subtitle giving the current location's label.

Detail form:
- EntityHeader: kind "Agent", title = label.
- Form fields: Label, Location (`<select>` from `tree.locations`), Short Description, Long Description (Manuscript), HP, Damage, Defense, Capacity, Mood (optional), Goal (optional), Autonomous (checkbox).
- Save / Delete in FootnoteBar.

### Items pane

Master list: flat alphabetical. Each row shows label + a dim italic subtitle showing owner. Owner subtitle resolves as: "in Location <label>" or "carried by <agent label>" or "inside <item label>". The third only appears for nested items, which remain editable via JSON fallback (see below).

Detail form:
- EntityHeader: kind "Item", title = label.
- Form fields: Label, **Owner kind** (radio: Location / Agent), **Owner** (`<select>` populated from the appropriate collection based on the radio), Short Description, Long Description (Manuscript), Weight (number), Hidden (checkbox).
- For items whose existing owner is `OwnerKind.Item` (nested in another item), the form shows a read-only banner: "This item is nested inside another item. Edit via the JSON fallback to change its owner." The form's other fields still work; just the owner pickers are replaced by the banner. Add a small "Edit raw JSON" button that swaps the entire form to `RawJsonForm` for this item.
- Save / Delete in FootnoteBar.

### JSON fallback

`RawJsonForm` stays in the codebase but is no longer the default for any entity. It's reachable via:
1. The nested-item escape hatch described above.
2. A small "advanced: raw JSON" link at the bottom of every detail form (future polish — not in v3 scope).

For v3, only path 1 reaches the JSON form. The component itself doesn't need changes beyond it no longer being the default in `$worldId.tsx`.

## Top-bar World Settings button

A new button in the top bar's right cluster, between the draft chip and the Reset/Publish actions:

- Visible on every detail-route load.
- Label: "World Settings".
- Click: sets `?sel=` (clears entity selection) and a new `?view=settings` flag. The detail pane checks this flag first; if set, it renders the world settings form (currently the cover image URL panel — same as v2's "world entity" detail) instead of the per-category empty state.
- The Locations side-nav stays the active category when world settings is open; we just override the detail pane content.

When the user clicks any entity in the master pane (or any category in the side nav), `?view=` gets cleared, returning the detail pane to the entity-form mode.

## Bestiary click bug fix

The side-nav `onSelect` in `$worldId.tsx` is currently `() => undefined`. v3 wires it to update `?cat=` on the URL. With `?cat=bestiary` driving the master pane content, clicking Bestiary now works.

## Components added in v3

Under `app/routes/admin/-components/`:

- `MasterList.tsx` — generic flat list. Props: `{ items: Array<{id, label, subtitle?}>, selectedId, onSelect, filterPlaceholder }`. Replaces the per-category list-rendering code. Used by all four panes.
- `CategoryRouter.tsx` — given the active `?cat=`, returns the right list and the right detail form. Keeps `$worldId.tsx` slim.
- `ExitsEditor.tsx` — full sub-section: heading, list of `ExitRow`s, "Add Exit" button.
- `ExitRow.tsx` — single editable exit row.
- `TriggersEditor.tsx` — same shape for triggers.
- `TriggerRow.tsx` — single editable trigger row.
- `StarterItemsEditor.tsx` — for bestiary detail.
- `LocationForm.tsx` *(moved out of `$worldId.tsx`)* — extracted from the inline definition; now includes `ExitsEditor` and `TriggersEditor`.
- `AgentForm.tsx`
- `ItemForm.tsx`
- `TemplateForm.tsx`
- `WorldSettingsForm.tsx` *(extracted from the v2 inline definition for the world-entity detail)*

`RawJsonForm` stays in `$worldId.tsx` for now (only reached via the nested-item escape hatch); it can be extracted later when we add the "advanced: raw JSON" links.

`WorldHierarchyTree.tsx` is **deleted** — replaced by `MasterList` driven by `?cat=`.

## Data flow

No new endpoints. Existing `saveEntity`, `deleteEntity`, `upsertTemplate`, `deleteTemplate`, `upsertTrigger`, `deleteTrigger` cover everything. Each new form calls into them with the appropriate entity kind.

Exit upsert specifically uses `saveEntity({ entity: EntityKind.Exit, payload: UpsertExitInput })`. The payload shape matches `UpsertExitInput` exactly — id, from, to, direction, label, locked, lockedByItem.

Trigger upsert uses `upsertTrigger` (which already exists for v1's RawJsonForm path).

## URL search params

Route: `/admin/$worldId`. Two new query params, both optional:

- `cat` ∈ `{ locations, bestiary, agents, items }`. Default: `locations`.
- `sel` — string entity id. Default: none.
- `view` ∈ `{ settings }`. Default: none. When `settings`, the detail pane shows the world settings form.

TanStack Router lets us validate search params via `Route.useSearch()` and `Route.useNavigate({ search })`. We add a small `searchSchema` validator in the route's `validateSearch`.

Browser back/forward and refresh preserve the view.

## Error handling

Unchanged from v2. Per-row Save and Delete buttons surface their own `alert()` on failure (consistent with the rest of the admin). Validation errors from the server bubble up as before.

## Testing

- **Unit:** `categoryToCollection` helper that maps `cat` to the entity list, plus `resolveOwnerSubtitle` for items. One Vitest file.
- **Unit:** small `searchSchema` test verifying default values and rejecting unknown `cat` values.
- **No new integration tests.** The forms are exercised by the existing server tests; the UI is verified visually.

## Done criteria

- Clicking Locations / Bestiary / Agents / Items in the side nav swaps the master pane content.
- The URL reflects the active category and the selected entity; refresh preserves them.
- Locations no longer show exits/agents/items/triggers as tree children — exits and triggers are inline editable sub-lists on the location detail; agents and items live in their own panes.
- Creating an exit, selecting a destination, and saving persists and round-trips through publish.
- Creating an agent, picking its location, and saving persists.
- Creating an item with a Location owner persists; switching the radio to Agent and picking an agent persists.
- A nested-item (`OwnerKind.Item`) shows the banner and can be edited via the raw JSON escape hatch.
- The top-bar "World Settings" button opens the cover-image URL form.
- Clicking Bestiary now does something (was the reported bug).
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.
