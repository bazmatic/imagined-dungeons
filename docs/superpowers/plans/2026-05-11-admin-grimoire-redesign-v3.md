# Admin Grimoire Redesign v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restructure the detail-route master pane into four category-driven flat lists (Locations/Bestiary/Agents/Items), replace JSON fallback editors with real per-entity forms, move exits and triggers off the tree and onto the location detail as inline editable sub-lists, fix the Bestiary click bug, and move World Settings to a top-bar button. Spec: `docs/superpowers/specs/2026-05-11-admin-grimoire-redesign-v3-design.md`.

**Architecture:** No schema or backend changes. URL search params (`cat`, `sel`, `view`) drive the detail-route view state. The master pane becomes a generic `MasterList`. A new `CategoryRouter` switches between four per-category list+form pairs. Five new entity forms (Location, Agent, Item, Template, plus Exit/Trigger row-level editors) replace the JSON fallback for every entity except nested items.

**Tech Stack:** No new dependencies. React 19, TanStack Router (search-param validation), plain CSS, Vitest, Biome.

---

## File Structure

**Created (frontend):**
- `app/routes/admin/-components/MasterList.tsx`
- `app/routes/admin/-components/CategoryRouter.tsx`
- `app/routes/admin/-components/LocationForm.tsx`
- `app/routes/admin/-components/AgentForm.tsx`
- `app/routes/admin/-components/ItemForm.tsx`
- `app/routes/admin/-components/TemplateForm.tsx`
- `app/routes/admin/-components/WorldSettingsForm.tsx`
- `app/routes/admin/-components/ExitsEditor.tsx`
- `app/routes/admin/-components/ExitRow.tsx`
- `app/routes/admin/-components/TriggersEditor.tsx`
- `app/routes/admin/-components/TriggerRow.tsx`
- `app/routes/admin/-components/StarterItemsEditor.tsx`
- `app/routes/admin/-components/category-helpers.ts` — `categoryToCollection`, `resolveOwnerSubtitle`, `searchSchema`.
- `app/routes/admin/-components/category-helpers.test.ts`

**Modified:**
- `app/routes/admin/$worldId.tsx` — slimmed dramatically: route definition + AdminShell + master/detail wiring delegated to `MasterList` and `CategoryRouter`. The inline `LocationForm`/`RawJsonForm`/`DetailBody` definitions are extracted.
- `app/routes/admin/-components/SideNav.tsx` — remove the disabled `Lore` and `Characters` items.
- `app/routes/admin/-components/TopBar.tsx` — add an optional `onWorldSettings` prop and render a "World Settings" button when provided.
- `app/routes/admin/admin.css` — small additions for the new row editors (exit-row, trigger-row, starter-item-row) and the world-settings button.

**Deleted:**
- `app/routes/admin/-components/WorldHierarchyTree.tsx` — replaced by per-category MasterLists.

**Untouched:**
- All `src/` files. No domain or repository changes.
- `app/server/` files.
- Player routes.

---

## Task 1: Pure helpers + search schema (TDD)

**Files:**
- Create: `app/routes/admin/-components/category-helpers.ts`
- Create: `app/routes/admin/-components/category-helpers.test.ts`

- [ ] **Step 1: Write the test file**

Create `app/routes/admin/-components/category-helpers.test.ts`:

```ts
import { OwnerKind } from '@core/domain/kinds';
import type { Agent, Exit, Item, Location } from '@core/domain/entities';
import type {
  AgentId,
  ItemId,
  LocationId,
  WorldId,
} from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  isCategory,
  parseSearchParams,
  resolveOwnerSubtitle,
} from './category-helpers';

describe('CATEGORIES', () => {
  it('exposes exactly the four supported categories', () => {
    expect(CATEGORIES).toEqual(['locations', 'bestiary', 'agents', 'items']);
  });
});

describe('isCategory', () => {
  it('accepts known values', () => {
    expect(isCategory('locations')).toBe(true);
    expect(isCategory('bestiary')).toBe(true);
    expect(isCategory('agents')).toBe(true);
    expect(isCategory('items')).toBe(true);
  });
  it('rejects unknown values', () => {
    expect(isCategory('lore')).toBe(false);
    expect(isCategory('')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });
});

describe('parseSearchParams', () => {
  it('defaults cat to locations and sel/view to undefined', () => {
    expect(parseSearchParams({})).toEqual({ cat: 'locations' });
  });
  it('preserves valid params', () => {
    expect(parseSearchParams({ cat: 'agents', sel: 'agent-1', view: 'settings' })).toEqual({
      cat: 'agents',
      sel: 'agent-1',
      view: 'settings',
    });
  });
  it('drops invalid cat (falls back to locations)', () => {
    expect(parseSearchParams({ cat: 'lore' })).toEqual({ cat: 'locations' });
  });
  it('drops invalid view', () => {
    expect(parseSearchParams({ view: 'nonsense' })).toEqual({ cat: 'locations' });
  });
});

describe('resolveOwnerSubtitle', () => {
  const locations: readonly Location[] = [
    {
      id: 'loc-tavern' as LocationId,
      worldId: 'w' as WorldId,
      label: 'The Tavern',
      shortDescription: '',
      longDescription: '',
      tags: [],
    },
  ];
  const agents: readonly Agent[] = [
    {
      id: 'agent-barkeep' as AgentId,
      worldId: 'w' as WorldId,
      label: 'Barkeep',
      shortDescription: '',
      longDescription: '',
      locationId: 'loc-tavern' as LocationId,
      hp: 10,
      damage: 1,
      defense: 0,
      capacity: 10,
      mood: null,
      goal: null,
      autonomous: false,
      shortTermIntent: null,
      awake: false,
    },
  ];
  const items: readonly Item[] = [
    {
      id: 'item-key' as ItemId,
      worldId: 'w' as WorldId,
      label: 'Brass Key',
      shortDescription: '',
      longDescription: '',
      owner: { kind: OwnerKind.Location, id: 'loc-tavern' as LocationId },
      weight: 1,
      hidden: false,
    },
  ];

  it('formats a location owner', () => {
    const item = items[0];
    if (!item) throw new Error('fixture missing');
    expect(resolveOwnerSubtitle(item, locations, agents, items)).toBe('in The Tavern');
  });

  it('formats an agent owner', () => {
    const item: Item = {
      ...(items[0] as Item),
      owner: { kind: OwnerKind.Agent, id: 'agent-barkeep' as AgentId },
    };
    expect(resolveOwnerSubtitle(item, locations, agents, items)).toBe('carried by Barkeep');
  });

  it('formats a nested-item owner', () => {
    const parent: Item = {
      ...(items[0] as Item),
      id: 'item-pouch' as ItemId,
      label: 'Leather Pouch',
    };
    const nested: Item = {
      ...(items[0] as Item),
      owner: { kind: OwnerKind.Item, id: 'item-pouch' as ItemId },
    };
    expect(resolveOwnerSubtitle(nested, locations, agents, [...items, parent])).toBe(
      'inside Leather Pouch',
    );
  });

  it('falls back to the id when the owner is missing', () => {
    const orphan: Item = {
      ...(items[0] as Item),
      owner: { kind: OwnerKind.Location, id: 'loc-missing' as LocationId },
    };
    expect(resolveOwnerSubtitle(orphan, locations, agents, items)).toBe('in loc-missing');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run app/routes/admin/-components/category-helpers.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement helpers**

Create `app/routes/admin/-components/category-helpers.ts`:

```ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { OwnerKind } from '@core/domain/kinds';

export const CATEGORIES = ['locations', 'bestiary', 'agents', 'items'] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

export const VIEWS = ['settings'] as const;
export type View = (typeof VIEWS)[number];

export interface AdminSearch {
  readonly cat: Category;
  readonly sel?: string;
  readonly view?: View;
}

export function parseSearchParams(raw: Record<string, unknown>): AdminSearch {
  const cat = isCategory(raw.cat) ? raw.cat : 'locations';
  const sel = typeof raw.sel === 'string' && raw.sel.length > 0 ? raw.sel : undefined;
  const view = raw.view === 'settings' ? ('settings' as const) : undefined;
  const result: AdminSearch = sel !== undefined && view !== undefined
    ? { cat, sel, view }
    : sel !== undefined
      ? { cat, sel }
      : view !== undefined
        ? { cat, view }
        : { cat };
  return result;
}

export function resolveOwnerSubtitle(
  item: Item,
  locations: readonly Location[],
  agents: readonly Agent[],
  items: readonly Item[],
): string {
  const ownerId = item.owner.id as string;
  if (item.owner.kind === OwnerKind.Location) {
    const loc = locations.find((l) => (l.id as string) === ownerId);
    return `in ${loc?.label ?? ownerId}`;
  }
  if (item.owner.kind === OwnerKind.Agent) {
    const a = agents.find((x) => (x.id as string) === ownerId);
    return `carried by ${a?.label ?? ownerId}`;
  }
  const parent = items.find((x) => (x.id as string) === ownerId);
  return `inside ${parent?.label ?? ownerId}`;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run app/routes/admin/-components/category-helpers.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/-components/category-helpers.ts app/routes/admin/-components/category-helpers.test.ts
git commit -m "$(cat <<'EOF'
admin v3: category helpers, search-param parser, owner subtitle (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: SideNav cleanup, TopBar World Settings button, CSS additions

**Files:**
- Modify: `app/routes/admin/-components/SideNav.tsx`
- Modify: `app/routes/admin/-components/TopBar.tsx`
- Modify: `app/routes/admin/admin.css`

- [ ] **Step 1: SideNav — remove the disabled stubs**

In `app/routes/admin/-components/SideNav.tsx`, change `SideNavCategory` and `ITEMS` to drop Lore and Characters:

```tsx
export type SideNavCategory = 'locations' | 'bestiary' | 'agents' | 'items';

const ITEMS: ReadonlyArray<{
  readonly key: SideNavCategory;
  readonly label: string;
}> = [
  { key: 'locations', label: 'Locations' },
  { key: 'bestiary', label: 'Bestiary' },
  { key: 'agents', label: 'Agents' },
  { key: 'items', label: 'Items' },
];
```

Then simplify the render — every item is now enabled, so remove the `enabled` field, the `disabled` attribute, the `title` tooltip, and the disabled-class branch. The body becomes:

```tsx
<ul className="side-nav__list">
  {ITEMS.map((item) => (
    <li key={item.key}>
      <button
        type="button"
        className={`side-nav__link${active === item.key ? ' side-nav__link--active' : ''}`}
        onClick={() => onSelect(item.key)}
      >
        {item.label}
      </button>
    </li>
  ))}
</ul>
```

- [ ] **Step 2: TopBar — World Settings button**

In `app/routes/admin/-components/TopBar.tsx`, add an optional callback prop:

```tsx
export interface TopBarProps {
  readonly activeTab: 'draft' | 'live' | 'archive';
  readonly showDraftChip?: boolean;
  readonly onSearch?: (q: string) => void;
  readonly onPaletteOpen?: () => void;
  readonly onPublish?: () => void;
  readonly onReset?: () => void;
  readonly onWorldSettings?: () => void;
  readonly publishLabel?: string;
  readonly extra?: ReactNode;
}
```

Render it in the right cluster, placed between the draft chip and Reset/Publish:

```tsx
{props.onWorldSettings ? (
  <button type="button" className="btn" onClick={props.onWorldSettings}>
    World Settings
  </button>
) : null}
```

Adjust the destructuring at the top of the component to include `onWorldSettings`. (Read the current file to see whether it uses `props.x` everywhere or destructures — match the existing style.)

- [ ] **Step 3: CSS — exit/trigger/starter row classes**

Append to `app/routes/admin/admin.css`:

```css
/* === v3: row editors === */
.admin-root .row-editor {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-4);
  border: 1px solid var(--border);
  background: var(--surface-low);
  margin-bottom: var(--s-3);
}
.admin-root .row-editor__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--s-3);
  align-items: end;
}
.admin-root .row-editor__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.admin-root .row-editor__field-label {
  font-family: var(--font-label);
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--parchment-dim);
}
.admin-root .row-editor__actions {
  display: flex;
  gap: var(--s-3);
  justify-content: flex-end;
}
.admin-root .row-editor__select,
.admin-root .row-editor__input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--parchment);
  font-family: var(--font-data);
  font-size: 14px;
  padding: var(--s-2) 0;
  width: 100%;
  outline: none;
}
.admin-root .row-editor__select {
  appearance: none;
  background:
    linear-gradient(45deg, transparent 50%, var(--parchment-dim) 50%) calc(100% - 12px) 50% / 6px 6px no-repeat,
    linear-gradient(135deg, var(--parchment-dim) 50%, transparent 50%) calc(100% - 6px) 50% / 6px 6px no-repeat,
    transparent;
  padding-right: 20px;
}
.admin-root .row-editor__select option {
  background: var(--charcoal);
  color: var(--parchment);
}
.admin-root .row-editor__select:focus,
.admin-root .row-editor__input:focus {
  border-bottom-color: var(--gold-bright);
}
.admin-root .row-editor__checkbox {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--parchment);
}

.admin-root .sub-section {
  margin-top: var(--s-6);
  padding-top: var(--s-5);
  border-top: 1px solid var(--border);
}
.admin-root .sub-section__heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--s-4);
}
.admin-root .sub-section__title {
  font-family: var(--font-label);
  font-size: 13px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--parchment-dim);
}

.admin-root .nested-banner {
  background: var(--surface-low);
  border-left: 2px solid var(--gold);
  padding: var(--s-4);
  color: var(--parchment-dim);
  font-family: var(--font-label);
  font-style: italic;
  margin-bottom: var(--s-4);
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. The SideNav and TopBar consumers may have a transient typecheck error if any current `<SideNav>` or `<TopBar>` invocation references the removed categories or passes positional args differently — none do in v2 (SideNav's consumer already passes `active: 'locations'`).

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/-components/SideNav.tsx app/routes/admin/-components/TopBar.tsx app/routes/admin/admin.css
git commit -m "$(cat <<'EOF'
admin v3: SideNav drops dead Lore/Characters; TopBar gains World Settings;
add row-editor and sub-section CSS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: MasterList

**Files:**
- Create: `app/routes/admin/-components/MasterList.tsx`

- [ ] **Step 1: Create the component**

Create `app/routes/admin/-components/MasterList.tsx`:

```tsx
import { useMemo, useState } from 'react';

export interface MasterListItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
}

export interface MasterListProps {
  readonly items: readonly MasterListItem[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  readonly filterPlaceholder?: string;
  readonly emptyHint?: string;
}

export function MasterList({
  items,
  selectedId,
  onSelect,
  filterPlaceholder,
  emptyHint,
}: MasterListProps) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const visible = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label));
    if (q === '') return sorted;
    return sorted.filter(
      (i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
    );
  }, [items, q]);

  return (
    <>
      <div className="master-pane__body">
        {visible.length === 0 ? (
          <p className="t-metadata" style={{ fontStyle: 'italic', padding: 'var(--s-3)' }}>
            {q === '' ? (emptyHint ?? 'No entries.') : 'No matches.'}
          </p>
        ) : (
          visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tree-leaf${selectedId === item.id ? ' tree-leaf--selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div>{item.label}</div>
              {item.subtitle ? (
                <div
                  className="t-data-sm"
                  style={{ color: 'var(--parchment-dim)', fontStyle: 'italic' }}
                >
                  {item.subtitle}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
      <div className="master-pane__footer">
        <input
          type="text"
          className="master-pane__filter"
          placeholder={filterPlaceholder ?? 'Filter…'}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/-components/MasterList.tsx
git commit -m "$(cat <<'EOF'
admin v3: MasterList — generic flat list for per-category panes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ExitRow and ExitsEditor

**Files:**
- Create: `app/routes/admin/-components/ExitRow.tsx`
- Create: `app/routes/admin/-components/ExitsEditor.tsx`

- [ ] **Step 1: ExitRow**

Create `app/routes/admin/-components/ExitRow.tsx`:

```tsx
import type { Exit, Item, Location } from '@core/domain/entities';
import type { ExitId, ItemId, LocationId } from '@core/domain/ids';
import { useState } from 'react';

export interface ExitDraft {
  readonly id: string;
  readonly direction: string;
  readonly label: string;
  readonly toLocationId: string;
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
    toLocationId: e.to as string,
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

  const save = async (): Promise<void> => {
    if (busy) return;
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
            value={v.toLocationId}
            onChange={(e) => setV({ ...v, toLocationId: e.target.value })}
          >
            <option value="">— pick a location —</option>
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
              onChange={(e) => setV({ ...v, locked: e.target.checked, lockedByItemId: e.target.checked ? v.lockedByItemId : null })}
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

- [ ] **Step 2: ExitsEditor**

Create `app/routes/admin/-components/ExitsEditor.tsx`:

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { Exit, Item, Location } from '@core/domain/entities';
import { useMemo, useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { ExitRow, type ExitDraft, exitToDraft } from './ExitRow';

export interface ExitsEditorProps {
  readonly worldId: string;
  readonly sourceLocationId: string;
  readonly exits: readonly Exit[];
  readonly locations: readonly Location[];
  readonly items: readonly Item[];
  readonly onChanged: () => void;
}

function randomExitId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `exit_${rnd}`;
}

export function ExitsEditor({
  worldId,
  sourceLocationId,
  exits,
  locations,
  items,
  onChanged,
}: ExitsEditorProps) {
  const persisted = useMemo(() => exits.map(exitToDraft), [exits]);
  const [staged, setStaged] = useState<readonly ExitDraft[]>([]);

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
    setStaged((s) => s.filter((r) => r.id !== d.id));
    onChanged();
  };

  const remove = async (id: string): Promise<void> => {
    await deleteEntity({
      data: { worldId, entity: EntityKind.Exit, id },
    });
    setStaged((s) => s.filter((r) => r.id !== id));
    onChanged();
  };

  const all: readonly ExitDraft[] = [...persisted, ...staged];

  return (
    <section className="sub-section">
      <header className="sub-section__heading">
        <h3 className="sub-section__title">Exits ({persisted.length})</h3>
        <button type="button" className="btn" onClick={addNew}>
          Add exit
        </button>
      </header>
      {all.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No exits from this location.
        </p>
      ) : (
        all.map((d) => (
          <ExitRow
            key={d.id}
            draft={d}
            sourceLocationId={sourceLocationId}
            locations={locations}
            items={items}
            onSave={save}
            onDelete={remove}
          />
        ))
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/ExitRow.tsx app/routes/admin/-components/ExitsEditor.tsx
git commit -m "$(cat <<'EOF'
admin v3: ExitRow + ExitsEditor for inline exit editing on Location

Per-row Save and Delete; destination dropdown excludes the source
location; locked-by-item dropdown shown only when Locked is checked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TriggerRow and TriggersEditor

**Files:**
- Create: `app/routes/admin/-components/TriggerRow.tsx`
- Create: `app/routes/admin/-components/TriggersEditor.tsx`

- [ ] **Step 1: TriggerRow**

Create `app/routes/admin/-components/TriggerRow.tsx`:

```tsx
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type { LocationSpawnTrigger, MonsterTemplate } from '@core/domain/builder-types';
import { useState } from 'react';

type EventKindValue = (typeof TriggerEventKind)[keyof typeof TriggerEventKind];

export interface TriggerDraft {
  readonly id: string;
  readonly eventKind: EventKindValue;
  readonly templateId: string;
  readonly count: number;
  readonly oneShot: boolean;
  readonly fireOnInitialPublish: boolean;
  readonly itemTemplateKey: string;
  readonly phrase: string;
  readonly predicate: string;
  readonly isNew: boolean;
}

export function triggerToDraft(t: LocationSpawnTrigger): TriggerDraft {
  return {
    id: t.id as string,
    eventKind: t.params.kind,
    templateId: t.templateId as string,
    count: t.count,
    oneShot: t.oneShot,
    fireOnInitialPublish: t.fireOnInitialPublish,
    itemTemplateKey: t.params.kind === TriggerEventKind.ItemTaken ? (t.params.itemTemplateKey ?? '') : '',
    phrase: t.params.kind === TriggerEventKind.Speech ? t.params.phrase : '',
    predicate: t.params.kind === TriggerEventKind.LlmJudgement ? t.params.predicate : '',
    isNew: false,
  };
}

const EVENT_OPTIONS: ReadonlyArray<{ readonly value: EventKindValue; readonly label: string }> = [
  { value: TriggerEventKind.PlayerEnters, label: 'Player enters' },
  { value: TriggerEventKind.CombatStarts, label: 'Combat starts' },
  { value: TriggerEventKind.ItemTaken, label: 'Item taken' },
  { value: TriggerEventKind.Speech, label: 'Speech' },
  { value: TriggerEventKind.LlmJudgement, label: 'LLM judgement' },
];

export interface TriggerRowProps {
  readonly draft: TriggerDraft;
  readonly templates: readonly MonsterTemplate[];
  readonly onSave: (draft: TriggerDraft) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
}

export function TriggerRow({ draft: initial, templates, onSave, onDelete }: TriggerRowProps) {
  const [v, setV] = useState<TriggerDraft>(initial);
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    if (v.templateId === '' || v.count < 1) return;
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
        <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
          <label className="row-editor__field-label" htmlFor={`tev-${v.id}`}>
            Event
          </label>
          <select
            id={`tev-${v.id}`}
            className="row-editor__select"
            value={v.eventKind}
            onChange={(e) => setV({ ...v, eventKind: e.target.value as EventKindValue })}
          >
            {EVENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
          <label className="row-editor__field-label" htmlFor={`ttpl-${v.id}`}>
            Template
          </label>
          <select
            id={`ttpl-${v.id}`}
            className="row-editor__select"
            value={v.templateId}
            onChange={(e) => setV({ ...v, templateId: e.target.value })}
          >
            <option value="">— pick a template —</option>
            {templates.map((t) => (
              <option key={t.id as string} value={t.id as string}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 2' }}>
          <label className="row-editor__field-label" htmlFor={`tcount-${v.id}`}>
            Count
          </label>
          <input
            id={`tcount-${v.id}`}
            type="number"
            min={1}
            className="row-editor__input"
            value={v.count}
            onChange={(e) => setV({ ...v, count: Number(e.target.value) })}
          />
        </div>
        <div className="row-editor__field" style={{ gridColumn: 'span 2' }}>
          <label className="row-editor__checkbox">
            <input
              type="checkbox"
              checked={v.oneShot}
              onChange={(e) => setV({ ...v, oneShot: e.target.checked })}
            />
            One-shot
          </label>
          <label className="row-editor__checkbox">
            <input
              type="checkbox"
              checked={v.fireOnInitialPublish}
              onChange={(e) => setV({ ...v, fireOnInitialPublish: e.target.checked })}
            />
            Fire on publish
          </label>
        </div>
        {v.eventKind === TriggerEventKind.ItemTaken ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
            <label className="row-editor__field-label" htmlFor={`titk-${v.id}`}>
              Item template key (optional)
            </label>
            <input
              id={`titk-${v.id}`}
              type="text"
              className="row-editor__input"
              value={v.itemTemplateKey}
              onChange={(e) => setV({ ...v, itemTemplateKey: e.target.value })}
            />
          </div>
        ) : null}
        {v.eventKind === TriggerEventKind.Speech ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
            <label className="row-editor__field-label" htmlFor={`tphr-${v.id}`}>
              Phrase
            </label>
            <input
              id={`tphr-${v.id}`}
              type="text"
              className="row-editor__input"
              value={v.phrase}
              onChange={(e) => setV({ ...v, phrase: e.target.value })}
            />
          </div>
        ) : null}
        {v.eventKind === TriggerEventKind.LlmJudgement ? (
          <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
            <label className="row-editor__field-label" htmlFor={`tpred-${v.id}`}>
              Predicate
            </label>
            <input
              id={`tpred-${v.id}`}
              type="text"
              className="row-editor__input"
              value={v.predicate}
              onChange={(e) => setV({ ...v, predicate: e.target.value })}
            />
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

- [ ] **Step 2: TriggersEditor**

Create `app/routes/admin/-components/TriggersEditor.tsx`:

```tsx
import { TriggerEventKind } from '@core/domain/builder-kinds';
import type {
  LocationSpawnTrigger,
  MonsterTemplate,
  TriggerParams,
} from '@core/domain/builder-types';
import { useMemo, useState } from 'react';
import { deleteTrigger, upsertTrigger } from '~/server/admin/templates';
import { TriggerRow, type TriggerDraft, triggerToDraft } from './TriggerRow';

export interface TriggersEditorProps {
  readonly worldId: string;
  readonly sourceLocationId: string;
  readonly triggers: readonly LocationSpawnTrigger[];
  readonly templates: readonly MonsterTemplate[];
  readonly onChanged: () => void;
}

function randomTriggerId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `trg_${rnd}`;
}

function draftToParams(d: TriggerDraft): TriggerParams {
  switch (d.eventKind) {
    case TriggerEventKind.PlayerEnters:
      return { kind: TriggerEventKind.PlayerEnters };
    case TriggerEventKind.CombatStarts:
      return { kind: TriggerEventKind.CombatStarts };
    case TriggerEventKind.ItemTaken:
      return d.itemTemplateKey === ''
        ? { kind: TriggerEventKind.ItemTaken }
        : { kind: TriggerEventKind.ItemTaken, itemTemplateKey: d.itemTemplateKey };
    case TriggerEventKind.Speech:
      return { kind: TriggerEventKind.Speech, phrase: d.phrase };
    case TriggerEventKind.LlmJudgement:
      return { kind: TriggerEventKind.LlmJudgement, predicate: d.predicate };
  }
}

export function TriggersEditor({
  worldId,
  sourceLocationId,
  triggers,
  templates,
  onChanged,
}: TriggersEditorProps) {
  const persisted = useMemo(() => triggers.map(triggerToDraft), [triggers]);
  const [staged, setStaged] = useState<readonly TriggerDraft[]>([]);

  const addNew = (): void => {
    setStaged((s) => [
      ...s,
      {
        id: randomTriggerId(),
        eventKind: TriggerEventKind.PlayerEnters,
        templateId: '',
        count: 1,
        oneShot: true,
        fireOnInitialPublish: false,
        itemTemplateKey: '',
        phrase: '',
        predicate: '',
        isNew: true,
      },
    ]);
  };

  const save = async (d: TriggerDraft): Promise<void> => {
    await upsertTrigger({
      data: {
        worldId,
        payload: {
          id: d.id,
          locationId: sourceLocationId,
          templateId: d.templateId,
          params: draftToParams(d),
          count: d.count,
          oneShot: d.oneShot,
          fireOnInitialPublish: d.fireOnInitialPublish,
        },
      },
    });
    setStaged((s) => s.filter((r) => r.id !== d.id));
    onChanged();
  };

  const remove = async (id: string): Promise<void> => {
    await deleteTrigger({ data: { worldId, id } });
    setStaged((s) => s.filter((r) => r.id !== id));
    onChanged();
  };

  const all: readonly TriggerDraft[] = [...persisted, ...staged];

  return (
    <section className="sub-section">
      <header className="sub-section__heading">
        <h3 className="sub-section__title">Triggers ({persisted.length})</h3>
        <button type="button" className="btn" onClick={addNew}>
          Add trigger
        </button>
      </header>
      {all.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No triggers on this location.
        </p>
      ) : (
        all.map((d) => (
          <TriggerRow
            key={d.id}
            draft={d}
            templates={templates}
            onSave={save}
            onDelete={remove}
          />
        ))
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/TriggerRow.tsx app/routes/admin/-components/TriggersEditor.tsx
git commit -m "$(cat <<'EOF'
admin v3: TriggerRow + TriggersEditor for inline trigger editing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: LocationForm, WorldSettingsForm

**Files:**
- Create: `app/routes/admin/-components/LocationForm.tsx`
- Create: `app/routes/admin/-components/WorldSettingsForm.tsx`

- [ ] **Step 1: LocationForm**

Create `app/routes/admin/-components/LocationForm.tsx`:

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { EntityHeader } from './EntityHeader';
import { ExitsEditor } from './ExitsEditor';
import { FootnoteBar } from './FootnoteBar';
import { KeyVisualPanel } from './KeyVisualPanel';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { TagsPanel } from './TagsPanel';
import { TriggersEditor } from './TriggersEditor';

export interface LocationFormProps {
  readonly tree: WorldTree;
  readonly locationId: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function LocationForm({
  tree,
  locationId,
  problemCount,
  onSaved,
  onDeleted,
}: LocationFormProps) {
  const loc = tree.locations.find((l) => (l.id as string) === locationId);
  const initial = loc
    ? {
        id: loc.id as string,
        label: loc.label,
        shortDescription: loc.shortDescription,
        longDescription: loc.longDescription,
        tags: loc.tags,
      }
    : null;
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);

  if (!loc || !v) return <p className="t-metadata">Location not found.</p>;

  const wordCount = v.longDescription.trim() === '' ? 0 : v.longDescription.trim().split(/\s+/).length;
  const charCount = v.longDescription.length;

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Location,
          payload: v,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const exitsHere = tree.exits.filter((e) => (e.from as string) === locationId);
  const triggersHere = tree.triggers.filter((t) => (t.locationId as string) === locationId);

  return (
    <>
      <EntityHeader kindLabel="Location" title={v.label || v.id} id={v.id} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="loc-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="loc-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="loc-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="loc-short"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--italic"
              value={v.shortDescription}
              onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long Description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => setV({ ...v, longDescription: next })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
          </div>
        </div>
        <MetadataColumn>
          <KeyVisualPanel
            src={tree.summary.coverImageUrl}
            fallbackLetter={(v.label[0] ?? '?').toUpperCase()}
            editable={false}
          />
          <div>
            <span className="form-grid__field-label">Attributes &amp; Tags</span>
            <TagsPanel
              tags={v.tags}
              onChange={(next) => setV({ ...v, tags: next })}
            />
          </div>
        </MetadataColumn>
      </div>

      <ExitsEditor
        worldId={tree.summary.id as string}
        sourceLocationId={locationId}
        exits={exitsHere}
        locations={tree.locations}
        items={tree.items}
        onChanged={onSaved}
      />

      <TriggersEditor
        worldId={tree.summary.id as string}
        sourceLocationId={locationId}
        triggers={triggersHere}
        templates={tree.templates}
        onChanged={onSaved}
      />

      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Location,
              id: v.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: WorldSettingsForm**

Create `app/routes/admin/-components/WorldSettingsForm.tsx`:

```tsx
import type { WorldTree } from '@core/domain/builder-types';
import { updateWorldCover } from '~/server/admin/worlds';
import { EntityHeader } from './EntityHeader';
import { KeyVisualPanel } from './KeyVisualPanel';
import { MetadataColumn } from './MetadataColumn';

export interface WorldSettingsFormProps {
  readonly tree: WorldTree;
  readonly onSaved: () => void;
}

export function WorldSettingsForm({ tree, onSaved }: WorldSettingsFormProps) {
  const name = tree.summary.displayName || tree.summary.label;
  return (
    <>
      <EntityHeader kindLabel="World" title={name} id={tree.summary.id as string} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <p className="t-metadata" style={{ fontStyle: 'italic' }}>
            World-level settings. Cover art appears on the campaign builder and on the world's
            key-visual panel.
          </p>
        </div>
        <MetadataColumn>
          <KeyVisualPanel
            src={tree.summary.coverImageUrl}
            fallbackLetter={(name[0] ?? '?').toUpperCase()}
            editable
            onChange={async (next) => {
              await updateWorldCover({
                data: { id: tree.summary.id as string, coverImageUrl: next },
              });
              onSaved();
            }}
          />
        </MetadataColumn>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/LocationForm.tsx app/routes/admin/-components/WorldSettingsForm.tsx
git commit -m "$(cat <<'EOF'
admin v3: LocationForm with inline exits/triggers; WorldSettingsForm extracted

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: AgentForm, ItemForm

**Files:**
- Create: `app/routes/admin/-components/AgentForm.tsx`
- Create: `app/routes/admin/-components/ItemForm.tsx`

- [ ] **Step 1: AgentForm**

Create `app/routes/admin/-components/AgentForm.tsx`:

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';

export interface AgentFormProps {
  readonly tree: WorldTree;
  readonly agentId: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function AgentForm({
  tree,
  agentId,
  problemCount,
  onSaved,
  onDeleted,
}: AgentFormProps) {
  const ag = tree.agents.find((a) => (a.id as string) === agentId);
  const [v, setV] = useState(
    ag
      ? {
          id: ag.id as string,
          label: ag.label,
          shortDescription: ag.shortDescription,
          longDescription: ag.longDescription,
          locationId: ag.locationId as string,
          hp: ag.hp,
          damage: ag.damage,
          defense: ag.defense,
          capacity: ag.capacity,
          mood: ag.mood ?? '',
          goal: ag.goal ?? '',
          autonomous: ag.autonomous,
        }
      : null,
  );
  const [saving, setSaving] = useState(false);

  if (!ag || !v) return <p className="t-metadata">Agent not found.</p>;

  const wordCount = v.longDescription.trim() === '' ? 0 : v.longDescription.trim().split(/\s+/).length;
  const charCount = v.longDescription.length;

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Agent,
          payload: {
            id: v.id,
            label: v.label,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            locationId: v.locationId,
            hp: v.hp,
            damage: v.damage,
            defense: v.defense,
            capacity: v.capacity,
            mood: v.mood === '' ? null : v.mood,
            goal: v.goal === '' ? null : v.goal,
            autonomous: v.autonomous,
          },
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <EntityHeader kindLabel="Agent" title={v.label || v.id} id={v.id} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="ag-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="ag-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="ag-loc" className="form-grid__field-label">
              Location
            </label>
            <select
              id="ag-loc"
              className="row-editor__select"
              value={v.locationId}
              onChange={(e) => setV({ ...v, locationId: e.target.value })}
            >
              {tree.locations.map((l) => (
                <option key={l.id as string} value={l.id as string}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ag-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="ag-short"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--italic"
              value={v.shortDescription}
              onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long Description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => setV({ ...v, longDescription: next })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Goal</span>
            <input
              type="text"
              className="manuscript-input-v2"
              value={v.goal}
              onChange={(e) => setV({ ...v, goal: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
          </div>
        </div>
        <MetadataColumn>
          <div className="row-editor__grid" style={{ gap: 'var(--s-4)' }}>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-hp">HP</label>
              <input id="ag-hp" type="number" className="row-editor__input" value={v.hp}
                onChange={(e) => setV({ ...v, hp: Number(e.target.value) })} />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-cap">Capacity</label>
              <input id="ag-cap" type="number" className="row-editor__input" value={v.capacity}
                onChange={(e) => setV({ ...v, capacity: Number(e.target.value) })} />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-dmg">Damage</label>
              <input id="ag-dmg" type="number" className="row-editor__input" value={v.damage}
                onChange={(e) => setV({ ...v, damage: Number(e.target.value) })} />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="ag-def">Defense</label>
              <input id="ag-def" type="number" className="row-editor__input" value={v.defense}
                onChange={(e) => setV({ ...v, defense: Number(e.target.value) })} />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
              <label className="row-editor__field-label" htmlFor="ag-mood">Mood</label>
              <input id="ag-mood" type="text" className="row-editor__input" value={v.mood}
                placeholder="(optional)"
                onChange={(e) => setV({ ...v, mood: e.target.value })} />
            </div>
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.autonomous}
                onChange={(e) => setV({ ...v, autonomous: e.target.checked })}
              />
              Autonomous
            </label>
          </div>
        </MetadataColumn>
      </div>
      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Agent,
              id: v.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: ItemForm**

Create `app/routes/admin/-components/ItemForm.tsx`:

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';

type SimpleOwnerKind = typeof OwnerKind.Location | typeof OwnerKind.Agent;

export interface ItemFormProps {
  readonly tree: WorldTree;
  readonly itemId: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
  readonly onRequestJsonFallback: () => void;
}

export function ItemForm({
  tree,
  itemId,
  problemCount,
  onSaved,
  onDeleted,
  onRequestJsonFallback,
}: ItemFormProps) {
  const item = tree.items.find((i) => (i.id as string) === itemId);
  const isNested = item?.owner.kind === OwnerKind.Item;
  const initialOwnerKind: SimpleOwnerKind =
    item?.owner.kind === OwnerKind.Agent ? OwnerKind.Agent : OwnerKind.Location;
  const [v, setV] = useState(
    item
      ? {
          id: item.id as string,
          label: item.label,
          shortDescription: item.shortDescription,
          longDescription: item.longDescription,
          ownerKind: initialOwnerKind,
          ownerId: isNested ? '' : (item.owner.id as string),
          weight: item.weight,
          hidden: item.hidden,
        }
      : null,
  );
  const [saving, setSaving] = useState(false);

  if (!item || !v) return <p className="t-metadata">Item not found.</p>;

  const wordCount = v.longDescription.trim() === '' ? 0 : v.longDescription.trim().split(/\s+/).length;
  const charCount = v.longDescription.length;

  const save = async (): Promise<void> => {
    if (saving) return;
    if (v.ownerId === '') return;
    setSaving(true);
    try {
      await saveEntity({
        data: {
          worldId: tree.summary.id as string,
          entity: EntityKind.Item,
          payload: {
            id: v.id,
            label: v.label,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            ownerKind: v.ownerKind,
            ownerId: v.ownerId,
            weight: v.weight,
            hidden: v.hidden,
          },
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const ownerOptions =
    v.ownerKind === OwnerKind.Location ? tree.locations : tree.agents;

  return (
    <>
      <EntityHeader kindLabel="Item" title={v.label || v.id} id={v.id} />
      {isNested ? (
        <div className="nested-banner">
          This item is nested inside another item. Edit the owner via the JSON fallback.{' '}
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            onClick={onRequestJsonFallback}
          >
            Open raw JSON editor
          </button>
        </div>
      ) : null}
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="it-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="it-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          {isNested ? null : (
            <div className="row-editor__grid">
              <div className="row-editor__field" style={{ gridColumn: 'span 4' }}>
                <span className="row-editor__field-label">Owner kind</span>
                <label className="row-editor__checkbox">
                  <input
                    type="radio"
                    name="owner-kind"
                    checked={v.ownerKind === OwnerKind.Location}
                    onChange={() =>
                      setV({ ...v, ownerKind: OwnerKind.Location, ownerId: '' })
                    }
                  />
                  Location
                </label>
                <label className="row-editor__checkbox">
                  <input
                    type="radio"
                    name="owner-kind"
                    checked={v.ownerKind === OwnerKind.Agent}
                    onChange={() => setV({ ...v, ownerKind: OwnerKind.Agent, ownerId: '' })}
                  />
                  Agent
                </label>
              </div>
              <div className="row-editor__field" style={{ gridColumn: 'span 8' }}>
                <label className="row-editor__field-label" htmlFor="it-owner">
                  Owner
                </label>
                <select
                  id="it-owner"
                  className="row-editor__select"
                  value={v.ownerId}
                  onChange={(e) => setV({ ...v, ownerId: e.target.value })}
                >
                  <option value="">— pick an owner —</option>
                  {ownerOptions.map((o) => (
                    <option key={o.id as string} value={o.id as string}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="it-short" className="form-grid__field-label">
              Short Description
            </label>
            <input
              id="it-short"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--italic"
              value={v.shortDescription}
              onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long Description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => setV({ ...v, longDescription: next })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={save}
              disabled={saving || isNested || v.ownerId === ''}
            >
              Save
            </button>
          </div>
        </div>
        <MetadataColumn>
          <div className="row-editor__grid" style={{ gap: 'var(--s-4)' }}>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="it-weight">Weight</label>
              <input id="it-weight" type="number" className="row-editor__input" value={v.weight}
                onChange={(e) => setV({ ...v, weight: Number(e.target.value) })} />
            </div>
            <label className="row-editor__checkbox" style={{ gridColumn: 'span 12' }}>
              <input
                type="checkbox"
                checked={v.hidden}
                onChange={(e) => setV({ ...v, hidden: e.target.checked })}
              />
              Hidden
            </label>
          </div>
        </MetadataColumn>
      </div>
      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        onDelete={async () => {
          await deleteEntity({
            data: {
              worldId: tree.summary.id as string,
              entity: EntityKind.Item,
              id: v.id,
            },
          });
          onDeleted();
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/AgentForm.tsx app/routes/admin/-components/ItemForm.tsx
git commit -m "$(cat <<'EOF'
admin v3: AgentForm and ItemForm with location/owner pickers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: TemplateForm + StarterItemsEditor

**Files:**
- Create: `app/routes/admin/-components/StarterItemsEditor.tsx`
- Create: `app/routes/admin/-components/TemplateForm.tsx`

- [ ] **Step 1: StarterItemsEditor**

Create `app/routes/admin/-components/StarterItemsEditor.tsx`:

```tsx
import { StarterPackEntryKind } from '@core/domain/builder-kinds';
import type { StarterPackEntry } from '@core/domain/builder-types';

export interface StarterItemsEditorProps {
  readonly entries: readonly StarterPackEntry[];
  readonly onChange: (next: readonly StarterPackEntry[]) => void;
}

export function StarterItemsEditor({ entries, onChange }: StarterItemsEditorProps) {
  const update = (idx: number, patch: Partial<StarterPackEntry>): void => {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    onChange(next);
  };
  const remove = (idx: number): void => onChange(entries.filter((_, i) => i !== idx));
  const add = (): void =>
    onChange([
      ...entries,
      {
        kind: StarterPackEntryKind.Inline,
        label: '',
        shortDescription: '',
        longDescription: '',
        weight: 1,
        hidden: false,
      },
    ]);

  return (
    <section className="sub-section">
      <header className="sub-section__heading">
        <h3 className="sub-section__title">Starting items ({entries.length})</h3>
        <button type="button" className="btn" onClick={add}>
          Add starter item
        </button>
      </header>
      {entries.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No starting items.
        </p>
      ) : (
        entries.map((e, idx) => (
          <div key={idx} className="row-editor">
            <div className="row-editor__grid">
              <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
                <label className="row-editor__field-label" htmlFor={`si-label-${idx}`}>
                  Label
                </label>
                <input
                  id={`si-label-${idx}`}
                  type="text"
                  className="row-editor__input"
                  value={e.label}
                  onChange={(ev) => update(idx, { label: ev.target.value })}
                />
              </div>
              <div className="row-editor__field" style={{ gridColumn: 'span 3' }}>
                <label className="row-editor__field-label" htmlFor={`si-weight-${idx}`}>
                  Weight
                </label>
                <input
                  id={`si-weight-${idx}`}
                  type="number"
                  className="row-editor__input"
                  value={e.weight}
                  onChange={(ev) => update(idx, { weight: Number(ev.target.value) })}
                />
              </div>
              <label className="row-editor__checkbox" style={{ gridColumn: 'span 3' }}>
                <input
                  type="checkbox"
                  checked={e.hidden}
                  onChange={(ev) => update(idx, { hidden: ev.target.checked })}
                />
                Hidden
              </label>
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor={`si-short-${idx}`}>
                  Short description
                </label>
                <input
                  id={`si-short-${idx}`}
                  type="text"
                  className="row-editor__input"
                  value={e.shortDescription}
                  onChange={(ev) => update(idx, { shortDescription: ev.target.value })}
                />
              </div>
              <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
                <label className="row-editor__field-label" htmlFor={`si-long-${idx}`}>
                  Long description
                </label>
                <input
                  id={`si-long-${idx}`}
                  type="text"
                  className="row-editor__input"
                  value={e.longDescription}
                  onChange={(ev) => update(idx, { longDescription: ev.target.value })}
                />
              </div>
            </div>
            <div className="row-editor__actions">
              <button type="button" className="btn" onClick={() => remove(idx)}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
```

- [ ] **Step 2: TemplateForm**

Create `app/routes/admin/-components/TemplateForm.tsx`:

```tsx
import type { WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { deleteTemplate, upsertTemplate } from '~/server/admin/templates';
import { EntityHeader } from './EntityHeader';
import { FootnoteBar } from './FootnoteBar';
import { ManuscriptCard } from './ManuscriptCard';
import { MetadataColumn } from './MetadataColumn';
import { StarterItemsEditor } from './StarterItemsEditor';

export interface TemplateFormProps {
  readonly tree: WorldTree;
  readonly templateId: string;
  readonly problemCount: number;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function TemplateForm({
  tree,
  templateId,
  problemCount,
  onSaved,
  onDeleted,
}: TemplateFormProps) {
  const tpl = tree.templates.find((t) => (t.id as string) === templateId);
  const [v, setV] = useState(
    tpl
      ? {
          id: tpl.id as string,
          templateKey: tpl.templateKey,
          label: tpl.label,
          shortDescription: tpl.shortDescription,
          longDescription: tpl.longDescription,
          hp: tpl.hp,
          mood: tpl.mood ?? '',
          startingItems: tpl.startingItems,
        }
      : null,
  );
  const [saving, setSaving] = useState(false);

  if (!tpl || !v) return <p className="t-metadata">Template not found.</p>;

  const wordCount = v.longDescription.trim() === '' ? 0 : v.longDescription.trim().split(/\s+/).length;
  const charCount = v.longDescription.length;

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      await upsertTemplate({
        data: {
          worldId: tree.summary.id as string,
          payload: {
            id: v.id,
            templateKey: v.templateKey,
            label: v.label,
            shortDescription: v.shortDescription,
            longDescription: v.longDescription,
            hp: v.hp,
            mood: v.mood === '' ? null : v.mood,
            startingItems: v.startingItems,
          },
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <EntityHeader kindLabel="Monster Template" title={v.label || v.id} id={v.id} />
      <div className="form-grid">
        <div className="form-grid__primary">
          <div>
            <label htmlFor="tpl-label" className="form-grid__field-label">
              Label
            </label>
            <input
              id="tpl-label"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--large"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="tpl-key" className="form-grid__field-label">
              Template key (read-only)
            </label>
            <input
              id="tpl-key"
              type="text"
              className="manuscript-input-v2 input--readonly"
              value={v.templateKey}
              readOnly
            />
          </div>
          <div>
            <label htmlFor="tpl-short" className="form-grid__field-label">
              Short description
            </label>
            <input
              id="tpl-short"
              type="text"
              className="manuscript-input-v2 manuscript-input-v2--italic"
              value={v.shortDescription}
              onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
            />
          </div>
          <div>
            <span className="form-grid__field-label">Long description</span>
            <ManuscriptCard
              value={v.longDescription}
              onChange={(next) => setV({ ...v, longDescription: next })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              Save
            </button>
          </div>
        </div>
        <MetadataColumn>
          <div className="row-editor__grid" style={{ gap: 'var(--s-4)' }}>
            <div className="row-editor__field" style={{ gridColumn: 'span 6' }}>
              <label className="row-editor__field-label" htmlFor="tpl-hp">HP</label>
              <input id="tpl-hp" type="number" className="row-editor__input" value={v.hp}
                onChange={(e) => setV({ ...v, hp: Number(e.target.value) })} />
            </div>
            <div className="row-editor__field" style={{ gridColumn: 'span 12' }}>
              <label className="row-editor__field-label" htmlFor="tpl-mood">Mood</label>
              <input id="tpl-mood" type="text" className="row-editor__input" value={v.mood}
                placeholder="(optional)"
                onChange={(e) => setV({ ...v, mood: e.target.value })} />
            </div>
          </div>
        </MetadataColumn>
      </div>

      <StarterItemsEditor
        entries={v.startingItems}
        onChange={(next) => setV({ ...v, startingItems: next })}
      />

      <FootnoteBar
        wordCount={wordCount}
        charCount={charCount}
        problemCount={problemCount}
        onDelete={async () => {
          await deleteTemplate({
            data: { worldId: tree.summary.id as string, id: v.id },
          });
          onDeleted();
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/-components/StarterItemsEditor.tsx app/routes/admin/-components/TemplateForm.tsx
git commit -m "$(cat <<'EOF'
admin v3: TemplateForm with StarterItemsEditor sub-section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CategoryRouter

**Files:**
- Create: `app/routes/admin/-components/CategoryRouter.tsx`

- [ ] **Step 1: Create CategoryRouter**

Create `app/routes/admin/-components/CategoryRouter.tsx`:

```tsx
import type { Problem, WorldTree } from '@core/domain/builder-types';
import { useState } from 'react';
import { AgentForm } from './AgentForm';
import { type Category, resolveOwnerSubtitle } from './category-helpers';
import { ItemForm } from './ItemForm';
import { LocationForm } from './LocationForm';
import { MasterList, type MasterListItem } from './MasterList';
import { TemplateForm } from './TemplateForm';

export interface CategoryRouterProps {
  readonly tree: WorldTree;
  readonly category: Category;
  readonly selectedId?: string;
  readonly problems: readonly Problem[];
  readonly onSelect: (id: string | undefined) => void;
  readonly onSaved: () => void;
  readonly onDeleted: () => void;
}

export function CategoryRouter({
  tree,
  category,
  selectedId,
  problems,
  onSelect,
  onSaved,
  onDeleted,
}: CategoryRouterProps) {
  const items = listItemsForCategory(category, tree);
  const [jsonFallback, setJsonFallback] = useState<string | null>(null);

  const masterList = (
    <MasterList
      items={items}
      selectedId={selectedId}
      onSelect={(id) => {
        setJsonFallback(null);
        onSelect(id);
      }}
      filterPlaceholder={`Filter ${category}…`}
    />
  );

  const detail = renderDetail({
    tree,
    category,
    selectedId,
    problems,
    jsonFallback,
    onJsonFallback: setJsonFallback,
    onSaved,
    onDeleted,
  });

  return { masterList, detail };
}

function listItemsForCategory(category: Category, tree: WorldTree): readonly MasterListItem[] {
  if (category === 'locations') {
    return tree.locations.map((l) => ({ id: l.id as string, label: l.label }));
  }
  if (category === 'bestiary') {
    return tree.templates.map((t) => ({ id: t.id as string, label: t.label }));
  }
  if (category === 'agents') {
    return tree.agents.map((a) => {
      const loc = tree.locations.find((l) => (l.id as string) === (a.locationId as string));
      return {
        id: a.id as string,
        label: a.label,
        subtitle: loc ? `in ${loc.label}` : '(unplaced)',
      };
    });
  }
  return tree.items.map((it) => ({
    id: it.id as string,
    label: it.label,
    subtitle: resolveOwnerSubtitle(it, tree.locations, tree.agents, tree.items),
  }));
}

function renderDetail(args: {
  tree: WorldTree;
  category: Category;
  selectedId: string | undefined;
  problems: readonly Problem[];
  jsonFallback: string | null;
  onJsonFallback: (id: string | null) => void;
  onSaved: () => void;
  onDeleted: () => void;
}): React.ReactNode {
  const { tree, category, selectedId, problems, jsonFallback, onJsonFallback, onSaved, onDeleted } = args;
  if (selectedId === undefined) {
    return (
      <p className="t-metadata" style={{ fontStyle: 'italic' }}>
        Select a {singular(category)} from the list to the left.
      </p>
    );
  }
  const problemCount = problems.filter((p) => p.entityId === selectedId).length;
  if (category === 'locations') {
    return (
      <LocationForm
        tree={tree}
        locationId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === 'bestiary') {
    return (
      <TemplateForm
        tree={tree}
        templateId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  if (category === 'agents') {
    return (
      <AgentForm
        tree={tree}
        agentId={selectedId}
        problemCount={problemCount}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  // items
  return (
    <ItemForm
      tree={tree}
      itemId={selectedId}
      problemCount={problemCount}
      onSaved={onSaved}
      onDeleted={onDeleted}
      onRequestJsonFallback={() => onJsonFallback(selectedId)}
    />
  );
  // jsonFallback handled by $worldId.tsx itself (it opens a dedicated overlay or replaces the form)
}

function singular(c: Category): string {
  if (c === 'locations') return 'location';
  if (c === 'bestiary') return 'template';
  if (c === 'agents') return 'agent';
  return 'item';
}
```

Note: `CategoryRouter` returns an object `{ masterList, detail }`. The consumer destructures this and renders each piece in the right pane. This is a deliberate departure from a single-element return because `$worldId.tsx` has two slot positions (master pane and detail pane) and a single component can't render into both via React's tree.

If TS or React lint dislikes returning a non-React-element object from a function named like a component, rename `CategoryRouter` to `useCategoryRouter` (it's effectively a render-helper hook). Alternative: turn it into two siblings (`<CategoryMasterList>` and `<CategoryDetail>`) that the route renders separately. Either is fine; pick whichever the lint allows. The plan code uses the function-returning-pair pattern; if it bites, refactor to two named components and pass the same props twice.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, possibly with the rename to `useCategoryRouter` if Biome flags PascalCase-returning-non-JSX.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/-components/CategoryRouter.tsx
git commit -m "$(cat <<'EOF'
admin v3: CategoryRouter — picks master list + detail form per category

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Rewire $worldId.tsx and delete WorldHierarchyTree

**Files:**
- Modify: `app/routes/admin/$worldId.tsx`
- Delete: `app/routes/admin/-components/WorldHierarchyTree.tsx`

- [ ] **Step 1: Replace the route**

Replace `app/routes/admin/$worldId.tsx` with:

```tsx
import { WorldKind } from '@core/domain/builder-kinds';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { publish, resetLive } from '~/server/admin/publish';
import { validate } from '~/server/admin/validate';
import { getWorld } from '~/server/admin/worlds';
import { AdminShell } from './-components/AdminShell';
import { Breadcrumbs } from './-components/Breadcrumbs';
import { CategoryRouter } from './-components/CategoryRouter';
import { type AdminSearch, parseSearchParams } from './-components/category-helpers';
import { CommandPalette } from './-components/CommandPalette';
import { Fonts } from './-components/Fonts';
import { ProblemsRail } from './-components/ProblemsRail';
import { WorldSettingsForm } from './-components/WorldSettingsForm';

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  validateSearch: (raw): AdminSearch => parseSearchParams(raw),
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // hooks must run unconditionally — derive bits regardless of tree.ok
  const problemDots = useMemo<ReadonlySet<string>>(() => {
    const s = new Set<string>();
    for (const p of problems) s.add(`${p.entity}:${p.entityId}`);
    return s;
  }, [problems]);

  if (!tree.ok) {
    return (
      <div className="admin-root" style={{ padding: 24 }}>
        World not found.
      </div>
    );
  }
  const t = tree.value;
  const isDraft = t.summary.kind === WorldKind.Draft;

  const refresh = (): void => {
    void router.invalidate();
  };

  const onPublish = async (): Promise<void> => {
    const r = await publish({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Publish failed: ${r.error.message}`);
    else alert(`Published. Skipped: ${r.value.skipped.length}`);
  };

  const onReset = async (): Promise<void> => {
    if (!confirm('Reset live world to this draft? This replaces live structural rows.')) return;
    const r = await resetLive({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Reset failed: ${r.error.message}`);
  };

  const setCategory = (cat: AdminSearch['cat']): void => {
    void navigate({ search: { cat } });
  };
  const setSelected = (sel: string | undefined): void => {
    void navigate({
      search: (prev) => {
        const base = { cat: prev.cat };
        return sel === undefined ? base : { ...base, sel };
      },
    });
  };
  const openWorldSettings = (): void => {
    void navigate({
      search: (prev) => ({ cat: prev.cat, view: 'settings' as const }),
    });
  };

  const { masterList, detail } = CategoryRouter({
    tree: t,
    category: search.cat,
    selectedId: search.sel,
    problems,
    onSelect: setSelected,
    onSaved: refresh,
    onDeleted: () => {
      setSelected(undefined);
      refresh();
    },
  });

  const showingSettings = search.view === 'settings';

  return (
    <div className="admin-root">
      <Fonts />
      <AdminShell
        route="detail"
        topBar={{
          activeTab: isDraft ? 'draft' : 'live',
          showDraftChip: isDraft,
          onSearch: () => setPaletteOpen(true),
          onPaletteOpen: () => setPaletteOpen(true),
          onWorldSettings: openWorldSettings,
          ...(isDraft ? { onPublish, onReset } : {}),
          extra: (
            <button
              type="button"
              className="btn"
              onClick={() => setProblemsOpen((p) => !p)}
              title="Problems"
            >
              ⚑ {problems.length}
            </button>
          ),
        }}
        sideNav={{
          active: search.cat,
          onSelect: setCategory,
          onCreateNew: () => setPaletteOpen(true),
        }}
      >
        <div className="detail-shell-v2">
          <section className="master-pane">
            <div className="master-pane__header">
              <span className="t-label-caps">
                {search.cat === 'locations'
                  ? 'Locations'
                  : search.cat === 'bestiary'
                    ? 'Bestiary'
                    : search.cat === 'agents'
                      ? 'Agents'
                      : 'Items'}
              </span>
            </div>
            {masterList}
          </section>

          <section className="detail-pane-v2">
            <div className="detail-pane-v2__inner">
              <Breadcrumbs
                tree={t}
                sel={
                  showingSettings
                    ? { kind: 'world' }
                    : search.sel !== undefined
                      ? ({ kind: categoryToEntityKind(search.cat), id: search.sel } as never)
                      : { kind: 'world' }
                }
              />
              {showingSettings ? <WorldSettingsForm tree={t} onSaved={refresh} /> : detail}
            </div>
          </section>
        </div>
      </AdminShell>

      <CommandPalette
        tree={t}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(s) => {
          // route the palette pick to the right category
          const cat = entityKindToCategory(s.kind);
          if (cat === null) return; // exits and triggers are inline on Location
          void navigate({ search: { cat, sel: s.id } });
        }}
      />
      <ProblemsRail
        problems={problems}
        open={problemsOpen}
        onClose={() => setProblemsOpen(false)}
        onSelect={(s) => {
          const cat = entityKindToCategory(s.kind);
          if (cat === null) return;
          void navigate({ search: { cat, sel: s.id } });
          setProblemsOpen(false);
        }}
      />
    </div>
  );

  void problemDots; // dots aren't used in v3's flat lists; helper kept for problems drawer
}

function entityKindToCategory(kind: string): AdminSearch['cat'] | null {
  if (kind === 'location') return 'locations';
  if (kind === 'agent') return 'agents';
  if (kind === 'item') return 'items';
  if (kind === 'monster_template') return 'bestiary';
  return null; // exit, trigger — they live inline on Location
}

function categoryToEntityKind(cat: AdminSearch['cat']): string {
  if (cat === 'locations') return 'location';
  if (cat === 'agents') return 'agent';
  if (cat === 'items') return 'item';
  return 'monster_template';
}
```

Notes on friction the implementer may hit:

- The `CategoryRouter({...})` call is intentionally not JSX. If Biome's `useJsxKeyInIterable` or similar flags this, rename `CategoryRouter` to `useCategoryRouter` everywhere (function name and file/export). It's effectively a hook returning a render-pair.
- The `useMemo` for `problemDots` is in the v3 flat-list world unused. Keep it (cheap) or remove and remove the trailing `void problemDots`. Either passes typecheck/lint; the plan keeps it because the problems drawer in a later iteration may want it.
- `entityKindToCategory`: the string values `'location'`, `'agent'`, `'item'`, `'monster_template'` correspond to the values in `EntityKind`. To avoid string literals failing the project's "no string literals in logic" rule (see CLAUDE.md / memory), import `EntityKind` and compare against constants instead. Concretely:
  ```ts
  import { EntityKind } from '@core/domain/builder-kinds';
  function entityKindToCategory(kind: string): AdminSearch['cat'] | null {
    if (kind === EntityKind.Location) return 'locations';
    if (kind === EntityKind.Agent) return 'agents';
    if (kind === EntityKind.Item) return 'items';
    if (kind === EntityKind.MonsterTemplate) return 'bestiary';
    return null;
  }
  ```
  Same for `categoryToEntityKind` — return `EntityKind.Location` etc.

- [ ] **Step 2: Delete the old tree component**

Run: `rm app/routes/admin/-components/WorldHierarchyTree.tsx`

Verify no other file imports it:

Run: `grep -R "WorldHierarchyTree" app src 2>/dev/null`
Expected: no output.

- [ ] **Step 3: Verify all gates**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. Test count should be unchanged plus the 12 from Task 1's category-helpers tests.

- [ ] **Step 4: Commit**

```bash
git add 'app/routes/admin/$worldId.tsx' app/routes/admin/-components/WorldHierarchyTree.tsx
git commit -m "$(cat <<'EOF'
admin v3: rewire $worldId.tsx with CategoryRouter; delete WorldHierarchyTree

Route now uses URL search params (cat/sel/view) for view state.
Master pane content is driven by ?cat and shows a flat list per
category. Detail pane uses the per-entity form components. World
Settings opens via the top-bar button. Bestiary click bug fixed
because side-nav onSelect is now wired to ?cat=.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Visual verification

**Files:** none modified.

- [ ] **Step 1: Start the dev server.**

Run: `pnpm dev`

- [ ] **Step 2: Verify side-nav navigation**

Open a draft world. Click each category:
- **Locations** — flat list shows all locations sorted alphabetically. Filter input works.
- **Bestiary** — flat list shows all monster templates (the bug fix).
- **Agents** — flat list with location subtitle per row.
- **Items** — flat list with owner subtitle per row.

Each category change should update the URL (`?cat=...`). Refreshing the page keeps the category.

- [ ] **Step 3: Verify Location detail with inline exits/triggers**

Select a location. Confirm:
- Form fields work as before.
- Below the form: an "Exits" sub-section with editable rows.
- Each existing exit shows direction, destination dropdown (with all other locations as options), label, locked checkbox.
- Clicking "Add exit" stages a new row at the bottom. Picking a destination and clicking Create persists. Reload preserves it.
- Editing an existing exit's direction and clicking Save persists.
- Delete on an exit removes it.
- The "Triggers" sub-section works analogously: event dropdown, template dropdown, count, one-shot/fire-on-publish checkboxes, kind-specific extra fields.

- [ ] **Step 4: Verify Agent detail**

Switch to Agents. Select an agent. Confirm:
- Form shows the location dropdown — changing the value and clicking Save persists.
- The agent's row in the master list updates its subtitle to the new location after save.

- [ ] **Step 5: Verify Item detail**

Switch to Items. Select an item. Confirm:
- Owner kind radio + owner dropdown. Switching between Location and Agent swaps the dropdown contents.
- Saving an item with a new owner kind/id persists.
- If you have a nested item (`OwnerKind.Item`), confirm the banner appears with the "Open raw JSON editor" affordance. (Skip if none exist in your seed data.)

- [ ] **Step 6: Verify World Settings**

Click "World Settings" in the top bar. Confirm:
- Detail pane shows the World entity header and the cover image URL editor.
- Saving a cover image URL persists. Going back to `/admin` shows it on the hero card.
- Clicking any category in the side nav clears `?view=settings` and returns to the regular per-category view.

- [ ] **Step 7: Verify the Cmd-K palette routes to the right category**

Press Cmd-K. Search for an agent. Selecting it should switch the category to Agents and select the agent.

- [ ] **Step 8: Stop the dev server.**

---

## Self-Review

- **Spec coverage:** helpers + parser (T1); side-nav/top-bar/CSS (T2); MasterList (T3); ExitRow/ExitsEditor (T4); TriggerRow/TriggersEditor (T5); LocationForm/WorldSettingsForm (T6); AgentForm/ItemForm (T7); StarterItemsEditor/TemplateForm (T8); CategoryRouter (T9); rewired `$worldId.tsx` + delete WorldHierarchyTree (T10); verification (T11). Bestiary bug fix: T2 (no more disabled flag) and T10 (onSelect now drives `?cat=`).
- **Placeholders:** none.
- **Type consistency:** `AdminSearch` defined in `category-helpers.ts` and consumed everywhere. `Category` type used in `MasterList`-consumer code via `CategoryRouter`. The route's `validateSearch` returns `AdminSearch` and `Route.useSearch()` returns it.
- **String-literal hygiene:** The `entityKindToCategory` / `categoryToEntityKind` helpers in T10 use `EntityKind.*` constants per the project's no-string-literals memory.
- **JSON fallback path:** Only the nested-item escape hatch reaches it. The plan provisionally calls `onRequestJsonFallback` in `ItemForm`; the actual JSON form rendering inside `$worldId.tsx` is intentionally not wired in v3 — clicking the banner button calls the callback but `$worldId.tsx` doesn't render the form yet. **This is a known gap.** Either accept it for v3 (nested items are rare; the banner without action is acceptable user feedback) or extend Task 10 to render a JSON-fallback overlay when `jsonFallback !== null`. For v3 the plan accepts the gap; flag in the Task 10 commit body.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-admin-grimoire-redesign-v3.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
