# Admin Grimoire Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the admin UI to the "Digital Grimoire" design system and add a Manuscript card, Problems rail, status badge, breadcrumbs, and Cmd/Ctrl-K Command Palette. Spec: `docs/superpowers/specs/2026-05-11-admin-grimoire-redesign-design.md`.

**Architecture:** A single scoped stylesheet (`app/routes/admin/admin.css`) defines design tokens as CSS custom properties under `.admin-root`. Two admin route components consume these via class names. New behavior lives in small co-located components under `app/routes/admin/_components/`. No new dependencies, no backend changes.

**Tech Stack:** React 19, TanStack Router/Start, plain CSS (no Tailwind, no CSS-in-JS), Vitest for the one new unit test, Biome for lint/format.

---

## File Structure

**Created:**
- `app/routes/admin/admin.css` — design tokens + component classes.
- `app/routes/admin/_components/Fonts.tsx` — Google Fonts `<link>` tags + stylesheet import.
- `app/routes/admin/_components/StatusBadge.tsx` — DRAFT/LIVE chip.
- `app/routes/admin/_components/Breadcrumbs.tsx` — slash-separated trail.
- `app/routes/admin/_components/ManuscriptCard.tsx` — long-form description container.
- `app/routes/admin/_components/ProblemsRail.tsx` — right-rail problems list.
- `app/routes/admin/_components/CommandPalette.tsx` — Cmd/Ctrl-K overlay.
- `app/routes/admin/_components/filter-tree.ts` — pure search function used by CommandPalette.
- `app/routes/admin/_components/filter-tree.test.ts` — Vitest for `filterTree`.

**Modified:**
- `app/routes/admin/index.tsx` — replace inline styles with classes; restructure into header + ledger sections.
- `app/routes/admin/$worldId.tsx` — three-pane layout; wire in new components; introduce a top-level `<div className="admin-root">` wrapper.

**Untouched:** anything under `app/server/`, `src/`, `app/routes/__root.tsx`, `app/routes/index.tsx`. The root document body styles stay; admin's `.admin-root` overrides on its subtree.

---

## Task 1: Add the admin stylesheet with tokens and core classes

**Files:**
- Create: `app/routes/admin/admin.css`

- [ ] **Step 1: Create `app/routes/admin/admin.css`**

```css
/* Digital Grimoire — admin-only stylesheet.
   Scoped via .admin-root so it cannot leak into player routes. */

.admin-root {
  --ink-black: #0a0a0a;
  --charcoal: #121212;
  --charcoal-hover: #1a1a1a;
  --parchment: #d1d1d1;
  --parchment-dim: #a78a88;
  --crimson: #9e2a2b;
  --crimson-bright: #ffb3ae;
  --gold: #b69121;
  --gold-bright: #ebc24f;
  --border: #262626;
  --tertiary: #8bd2db;

  --font-display: 'Playfair Display', Georgia, serif;
  --font-label: 'EB Garamond', Georgia, serif;
  --font-data: 'JetBrains Mono', ui-monospace, monospace;

  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-8: 48px;
  --container-max: 1440px;

  background: var(--ink-black);
  color: var(--parchment);
  font-family: var(--font-data);
  min-height: 100vh;
}

.admin-root * {
  box-sizing: border-box;
}

/* Typography */
.admin-root .t-headline-lg {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin: 0;
}
.admin-root .t-headline-md {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 500;
  line-height: 1.3;
  margin: 0;
}
.admin-root .t-label-caps {
  font-family: var(--font-label);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--parchment-dim);
  margin: 0;
}
.admin-root .t-data {
  font-family: var(--font-data);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: -0.01em;
}
.admin-root .t-data-sm {
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
.admin-root .t-metadata {
  font-family: var(--font-label);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--parchment-dim);
}
.admin-root .t-breadcrumb {
  font-family: var(--font-label);
  font-style: italic;
  font-size: 14px;
  color: var(--parchment-dim);
}

/* Buttons */
.admin-root .btn {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--parchment);
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: var(--s-2) 0;
  cursor: pointer;
}
.admin-root .btn:hover {
  border-bottom-color: var(--gold-bright);
  color: var(--gold-bright);
}
.admin-root .btn--primary {
  border-bottom-color: var(--crimson);
  color: var(--crimson-bright);
}
.admin-root .btn--primary:hover {
  border-bottom-color: var(--crimson-bright);
  color: var(--crimson-bright);
}

/* Inputs */
.admin-root .input {
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
.admin-root .input:focus {
  border-bottom-color: var(--gold-bright);
}
.admin-root .input--readonly {
  color: var(--parchment-dim);
}
.admin-root textarea.input {
  resize: vertical;
  min-height: 120px;
  line-height: 1.6;
}

/* Chips */
.admin-root .chip {
  display: inline-block;
  border: 1px solid var(--border);
  color: var(--parchment-dim);
  font-family: var(--font-data);
  font-size: 12px;
  letter-spacing: 0.05em;
  padding: 2px var(--s-2);
  text-transform: uppercase;
}
.admin-root .chip--crimson {
  border-color: var(--crimson);
  color: var(--crimson-bright);
}
.admin-root .chip--gold {
  border-color: var(--gold);
  color: var(--gold-bright);
}

/* Ledger tables (used on /admin index) */
.admin-root .ledger {
  width: 100%;
  border-collapse: collapse;
}
.admin-root .ledger th,
.admin-root .ledger td {
  text-align: left;
  border-bottom: 1px solid var(--border);
  padding: var(--s-3) var(--s-2);
  font-family: var(--font-data);
  font-size: 14px;
}
.admin-root .ledger th {
  font-family: var(--font-label);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--parchment-dim);
}
.admin-root .ledger tbody tr:hover {
  background: var(--charcoal-hover);
}
.admin-root .ledger a {
  color: var(--parchment);
  text-decoration: none;
}
.admin-root .ledger a:hover {
  color: var(--gold-bright);
}

/* Detail shell — three-pane layout for /admin/$worldId */
.admin-root .detail-shell {
  display: grid;
  grid-template-columns: 320px 1fr 280px;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
}
.admin-root .detail-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--s-5);
  padding: var(--s-5) var(--s-6);
  border-bottom: 1px solid var(--border);
}
.admin-root .detail-header__actions {
  margin-left: auto;
  display: flex;
  gap: var(--s-4);
}
.admin-root .tree-pane {
  background: var(--charcoal);
  border-right: 1px solid var(--border);
  padding: var(--s-5);
  overflow-y: auto;
}
.admin-root .detail-pane {
  padding: var(--s-5) var(--s-6);
  overflow-y: auto;
  max-width: var(--container-max);
}
.admin-root .problems-pane {
  background: var(--charcoal);
  border-left: 1px solid var(--border);
  padding: var(--s-5);
  overflow-y: auto;
}

/* Tree */
.admin-root .tree-section + .tree-section {
  margin-top: var(--s-5);
}
.admin-root .tree-section__heading {
  margin-bottom: var(--s-3);
}
.admin-root .tree-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.admin-root .tree-list .tree-list {
  margin-left: var(--s-4);
}
.admin-root .tree-item {
  margin: 2px 0;
}
.admin-root .tree-item__button {
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: var(--parchment);
  font-family: var(--font-data);
  font-size: 14px;
  padding: var(--s-1) var(--s-2);
  text-align: left;
  width: 100%;
  cursor: pointer;
}
.admin-root .tree-item__button:hover {
  background: var(--charcoal-hover);
}
.admin-root .tree-item__button--selected {
  background: var(--charcoal-hover);
  border-left-color: var(--gold);
  color: var(--gold-bright);
}
.admin-root .tree-item__button--dim {
  color: var(--parchment-dim);
}
.admin-root .tree-item__dot {
  color: var(--crimson-bright);
  margin-left: var(--s-2);
}

/* Manuscript card */
.admin-root .manuscript {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: var(--s-5);
  border: 1px solid var(--border);
  padding: var(--s-5);
  margin-top: var(--s-4);
}
.admin-root .manuscript__gutter {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--parchment-dim);
  line-height: 1.5;
}
.admin-root .manuscript__body {
  background: transparent;
  border: none;
  color: var(--parchment);
  font-family: var(--font-data);
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  resize: none;
  width: 100%;
}

/* Problems rail */
.admin-root .problem-row {
  border-bottom: 1px solid var(--border);
  padding: var(--s-3) 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  cursor: pointer;
}
.admin-root .problem-row:hover {
  background: var(--charcoal-hover);
}

/* Command palette */
.admin-root .palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
}
.admin-root .palette {
  width: 480px;
  max-height: 60vh;
  background: var(--charcoal);
  border: 1px solid var(--border);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}
.admin-root .palette__input {
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--parchment);
  font-family: var(--font-data);
  font-size: 14px;
  padding: var(--s-4);
  outline: none;
}
.admin-root .palette__results {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}
.admin-root .palette__result {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--s-3);
  align-items: center;
  padding: var(--s-2) var(--s-4);
  cursor: pointer;
}
.admin-root .palette__result--active {
  background: var(--charcoal-hover);
}
.admin-root .palette__result-id {
  color: var(--parchment-dim);
  font-size: 12px;
}

/* Status badge */
.admin-root .status-badge {
  display: inline-flex;
  gap: var(--s-2);
  align-items: center;
  padding: var(--s-1) var(--s-3);
  border: 1px solid currentColor;
  font-family: var(--font-data);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.admin-root .status-badge--draft {
  color: var(--gold-bright);
}
.admin-root .status-badge--live {
  color: var(--crimson-bright);
}
.admin-root .status-badge__id {
  color: var(--parchment-dim);
  letter-spacing: 0;
}

/* Misc */
.admin-root a {
  color: var(--parchment);
}
.admin-root h1, .admin-root h2, .admin-root h3 {
  margin: 0;
}
.admin-root .index-page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--s-8) var(--s-6);
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
}
.admin-root .field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}
.admin-root .field label {
  font-family: var(--font-label);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--parchment-dim);
}
.admin-root .form-actions {
  display: flex;
  gap: var(--s-4);
  margin-top: var(--s-4);
}
.admin-root .json-editor {
  width: 100%;
  background: var(--charcoal);
  color: var(--parchment);
  border: 1px solid var(--border);
  font-family: var(--font-data);
  font-size: 13px;
  padding: var(--s-3);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/admin/admin.css
git commit -m "$(cat <<'EOF'
admin: add grimoire stylesheet with design tokens and core classes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the Fonts component (loads Google Fonts + stylesheet)

**Files:**
- Create: `app/routes/admin/_components/Fonts.tsx`

- [ ] **Step 1: Create `app/routes/admin/_components/Fonts.tsx`**

```tsx
import '../admin.css';

/**
 * Emits the Google Fonts <link> tags for the three Digital Grimoire
 * families. Render once near the top of each admin route component.
 * Importing this file also pulls in admin.css.
 */
export function Fonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&family=Playfair+Display:wght@500;600&display=swap"
      />
    </>
  );
}
```

- [ ] **Step 2: Confirm Vite handles `.css` imports**

Run: `grep -R "import.*\.css" app src 2>/dev/null | head -5`
Expected: may be empty (no existing CSS imports). That's fine — Vite supports `.css` imports out of the box, and `vite-tsconfig-paths` does not need configuration for relative imports.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/_components/Fonts.tsx
git commit -m "$(cat <<'EOF'
admin: add Fonts component that loads grimoire fonts and stylesheet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add the StatusBadge component

**Files:**
- Create: `app/routes/admin/_components/StatusBadge.tsx`

- [ ] **Step 1: Create `app/routes/admin/_components/StatusBadge.tsx`**

```tsx
import { WorldKind } from '@core/domain/builder-kinds';

export interface StatusBadgeProps {
  readonly kind: (typeof WorldKind)[keyof typeof WorldKind];
  readonly id: string;
}

export function StatusBadge({ kind, id }: StatusBadgeProps) {
  const isLive = kind === WorldKind.Live;
  const modifier = isLive ? 'status-badge--live' : 'status-badge--draft';
  const label = isLive ? 'LIVE' : 'DRAFT';
  return (
    <span className={`status-badge ${modifier}`}>
      <span>{label}</span>
      <span className="status-badge__id">{id}</span>
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/admin/_components/StatusBadge.tsx
git commit -m "$(cat <<'EOF'
admin: add StatusBadge component for DRAFT/LIVE header chip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the Breadcrumbs component

**Files:**
- Create: `app/routes/admin/_components/Breadcrumbs.tsx`

- [ ] **Step 1: Create `app/routes/admin/_components/Breadcrumbs.tsx`**

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';

type SelectedKind =
  | typeof EntityKind.Location
  | typeof EntityKind.Exit
  | typeof EntityKind.Agent
  | typeof EntityKind.Item
  | typeof EntityKind.MonsterTemplate
  | typeof EntityKind.LocationSpawnTrigger;

export interface BreadcrumbsProps {
  readonly tree: WorldTree;
  readonly sel: { readonly kind: SelectedKind; readonly id: string } | { readonly kind: 'world' };
}

export function Breadcrumbs({ tree, sel }: BreadcrumbsProps) {
  const worldName = tree.summary.displayName || tree.summary.label;
  const segments = buildSegments(tree, sel, worldName);
  return (
    <nav className="t-breadcrumb">
      {segments.join(' / ')}
    </nav>
  );
}

function buildSegments(
  tree: WorldTree,
  sel: BreadcrumbsProps['sel'],
  worldName: string,
): readonly string[] {
  if (sel.kind === 'world') {
    return [worldName];
  }
  if (sel.kind === EntityKind.Location) {
    const loc = tree.locations.find((l) => (l.id as string) === sel.id);
    return [worldName, 'Locations', loc?.label ?? sel.id];
  }
  if (sel.kind === EntityKind.MonsterTemplate) {
    const tpl = tree.templates.find((t) => (t.id as string) === sel.id);
    return [worldName, 'Bestiary', tpl?.label ?? sel.id];
  }
  if (sel.kind === EntityKind.Exit) {
    const ex = tree.exits.find((e) => (e.id as string) === sel.id);
    const parent = ex ? tree.locations.find((l) => (l.id as string) === (ex.from as string)) : null;
    return [worldName, 'Locations', parent?.label ?? '?', 'Exit', ex?.direction ?? sel.id];
  }
  if (sel.kind === EntityKind.Agent) {
    const ag = tree.agents.find((a) => (a.id as string) === sel.id);
    const parent = ag ? tree.locations.find((l) => (l.id as string) === (ag.locationId as string)) : null;
    return [worldName, 'Locations', parent?.label ?? '?', 'Agent', ag?.label ?? sel.id];
  }
  if (sel.kind === EntityKind.LocationSpawnTrigger) {
    const trg = tree.triggers.find((t) => (t.id as string) === sel.id);
    const parent = trg
      ? tree.locations.find((l) => (l.id as string) === (trg.locationId as string))
      : null;
    return [worldName, 'Locations', parent?.label ?? '?', 'Trigger', sel.id];
  }
  // Item
  const item = tree.items.find((i) => (i.id as string) === sel.id);
  return [worldName, 'Items', item?.label ?? sel.id];
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/admin/_components/Breadcrumbs.tsx
git commit -m "$(cat <<'EOF'
admin: add Breadcrumbs component for detail-pane navigation trail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the ManuscriptCard component

**Files:**
- Create: `app/routes/admin/_components/ManuscriptCard.tsx`

- [ ] **Step 1: Create `app/routes/admin/_components/ManuscriptCard.tsx`**

```tsx
import { useLayoutEffect, useRef } from 'react';

export interface ManuscriptCardProps {
  readonly entityId: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
}

export function ManuscriptCard({ entityId, value, onChange }: ManuscriptCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const wordCount = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;

  return (
    <div className="manuscript">
      <aside className="manuscript__gutter">
        <div>ID</div>
        <div>{entityId}</div>
        <div style={{ marginTop: 16 }}>WORDS</div>
        <div>{wordCount}</div>
      </aside>
      <textarea
        ref={ref}
        className="manuscript__body"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/admin/_components/ManuscriptCard.tsx
git commit -m "$(cat <<'EOF'
admin: add ManuscriptCard for long-form description editing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add the ProblemsRail component

**Files:**
- Create: `app/routes/admin/_components/ProblemsRail.tsx`

- [ ] **Step 1: Create `app/routes/admin/_components/ProblemsRail.tsx`**

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { Problem } from '@core/domain/builder-types';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface ProblemsRailProps {
  readonly problems: readonly Problem[];
  readonly onSelect: (sel: { readonly kind: EntityKindValue; readonly id: string }) => void;
}

export function ProblemsRail({ problems, onSelect }: ProblemsRailProps) {
  return (
    <aside className="problems-pane">
      <h3 className="t-label-caps" style={{ marginBottom: 12 }}>
        Problems ({problems.length})
      </h3>
      {problems.length === 0 ? (
        <p className="t-metadata" style={{ fontStyle: 'italic' }}>
          No problems.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {problems.map((p) => (
            <li
              key={`${p.entity}:${p.entityId}:${p.kind}`}
              className="problem-row"
              onClick={() => onSelect({ kind: p.entity, id: p.entityId })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect({ kind: p.entity, id: p.entityId });
              }}
              role="button"
              tabIndex={0}
            >
              <span className="chip">{p.entity}</span>
              <span className="t-data-sm">{p.message}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/admin/_components/ProblemsRail.tsx
git commit -m "$(cat <<'EOF'
admin: add ProblemsRail right-rail component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: TDD the Command Palette filter function

**Files:**
- Create: `app/routes/admin/_components/filter-tree.ts`
- Test: `app/routes/admin/_components/filter-tree.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/routes/admin/_components/filter-tree.test.ts`:

```ts
import { EntityKind, OwnerKind, TriggerEventKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import type {
  AgentId,
  ExitId,
  ItemId,
  LocationId,
  MonsterTemplateId,
  SpawnTriggerId,
  WorldId,
} from '@core/domain/ids';
import { describe, expect, it } from 'vitest';
import { filterTree } from './filter-tree';

function makeTree(): WorldTree {
  return {
    summary: {
      id: 'w1' as WorldId,
      kind: WorldKind.Draft,
      label: 'world',
      displayName: 'World',
      parentDraftId: null,
      playerAgentId: null,
    },
    locations: [
      {
        id: 'loc-tavern' as LocationId,
        worldId: 'w1' as WorldId,
        label: 'The Drunken Goblin',
        shortDescription: '',
        longDescription: '',
      },
      {
        id: 'loc-cave' as LocationId,
        worldId: 'w1' as WorldId,
        label: 'Dark Cave',
        shortDescription: '',
        longDescription: '',
      },
    ],
    exits: [
      {
        id: 'exit-1' as ExitId,
        worldId: 'w1' as WorldId,
        from: 'loc-tavern' as LocationId,
        to: 'loc-cave' as LocationId,
        direction: 'north',
        label: 'tunnel to the cave',
        locked: false,
        lockedByItem: null,
      },
    ],
    items: [
      {
        id: 'item-key' as ItemId,
        worldId: 'w1' as WorldId,
        label: 'Brass Key',
        shortDescription: '',
        longDescription: '',
        owner: { kind: OwnerKind.Location, id: 'loc-tavern' as LocationId },
        weight: 1,
        hidden: false,
      },
    ],
    agents: [
      {
        id: 'agent-barkeep' as AgentId,
        worldId: 'w1' as WorldId,
        label: 'Goblin Barkeep',
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
      },
    ],
    templates: [
      {
        id: 'tpl-goblin' as MonsterTemplateId,
        worldId: 'w1' as WorldId,
        templateKey: 'goblin',
        label: 'Wild Goblin',
        shortDescription: '',
        longDescription: '',
        hp: 5,
        mood: null,
        startingItems: [],
      },
    ],
    triggers: [
      {
        id: 'trg-1' as SpawnTriggerId,
        worldId: 'w1' as WorldId,
        locationId: 'loc-cave' as LocationId,
        templateId: 'tpl-goblin' as MonsterTemplateId,
        params: { kind: TriggerEventKind.PlayerEnters },
        count: 1,
        oneShot: true,
        fireOnInitialPublish: false,
      },
    ],
  };
}

describe('filterTree', () => {
  it('returns empty array for empty query', () => {
    expect(filterTree(makeTree(), '')).toEqual([]);
  });

  it('matches across entity kinds case-insensitively', () => {
    const results = filterTree(makeTree(), 'goblin');
    const labels = results.map((r) => r.label);
    expect(labels).toContain('The Drunken Goblin');
    expect(labels).toContain('Goblin Barkeep');
    expect(labels).toContain('Wild Goblin');
  });

  it('matches by id', () => {
    const results = filterTree(makeTree(), 'loc-cave');
    expect(results.some((r) => r.id === 'loc-cave')).toBe(true);
  });

  it('caps at 50 results', () => {
    const tree = makeTree();
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: `loc-${i}` as LocationId,
      worldId: 'w1' as WorldId,
      label: `Place ${i}`,
      shortDescription: '',
      longDescription: '',
    }));
    const big: WorldTree = { ...tree, locations: many };
    expect(filterTree(big, 'place').length).toBe(50);
  });

  it('tags each result with its entity kind', () => {
    const results = filterTree(makeTree(), 'brass key');
    expect(results[0]?.kind).toBe(EntityKind.Item);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/routes/admin/_components/filter-tree.test.ts`
Expected: FAIL — module `./filter-tree` not found.

- [ ] **Step 3: Implement `filter-tree.ts`**

Create `app/routes/admin/_components/filter-tree.ts`:

```ts
import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface PaletteResult {
  readonly kind: EntityKindValue;
  readonly id: string;
  readonly label: string;
}

const MAX_RESULTS = 50;

export function filterTree(tree: WorldTree, query: string): readonly PaletteResult[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const results: PaletteResult[] = [];

  const push = (kind: EntityKindValue, id: string, label: string): void => {
    if (results.length >= MAX_RESULTS) return;
    if (id.toLowerCase().includes(q) || label.toLowerCase().includes(q)) {
      results.push({ kind, id, label });
    }
  };

  for (const l of tree.locations) push(EntityKind.Location, l.id as string, l.label);
  for (const e of tree.exits) push(EntityKind.Exit, e.id as string, `${e.direction} → ${e.to}`);
  for (const a of tree.agents) push(EntityKind.Agent, a.id as string, a.label);
  for (const i of tree.items) push(EntityKind.Item, i.id as string, i.label);
  for (const t of tree.templates) push(EntityKind.MonsterTemplate, t.id as string, t.label);
  for (const t of tree.triggers)
    push(EntityKind.LocationSpawnTrigger, t.id as string, `${t.params.kind} → ${t.templateId}`);

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/routes/admin/_components/filter-tree.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/_components/filter-tree.ts app/routes/admin/_components/filter-tree.test.ts
git commit -m "$(cat <<'EOF'
admin: add filterTree pure function for command palette

Substring match across locations, exits, agents, items, templates, and
triggers. 50-result cap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add the CommandPalette overlay component

**Files:**
- Create: `app/routes/admin/_components/CommandPalette.tsx`

- [ ] **Step 1: Create `app/routes/admin/_components/CommandPalette.tsx`**

```tsx
import { EntityKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { useEffect, useMemo, useState } from 'react';
import { type PaletteResult, filterTree } from './filter-tree';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export interface CommandPaletteProps {
  readonly tree: WorldTree;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (sel: { readonly kind: EntityKindValue; readonly id: string }) => void;
}

export function CommandPalette({ tree, open, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const results: readonly PaletteResult[] = useMemo(
    () => (open ? filterTree(tree, query) : []),
    [tree, query, open],
  );

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[highlight];
      if (r) {
        onSelect({ kind: r.kind, id: r.id });
        onClose();
      }
    }
  };

  return (
    <div
      className="palette-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="presentation"
    >
      <div className="palette" onClick={(e) => e.stopPropagation()} role="presentation">
        <input
          autoFocus
          className="palette__input"
          placeholder="Jump to entity..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="palette__results">
          {results.map((r, idx) => (
            <li
              key={`${r.kind}:${r.id}`}
              className={`palette__result ${idx === highlight ? 'palette__result--active' : ''}`}
              onClick={() => {
                onSelect({ kind: r.kind, id: r.id });
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSelect({ kind: r.kind, id: r.id });
                  onClose();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="chip">{r.kind}</span>
              <span className="t-data">{r.label}</span>
              <span className="palette__result-id">{r.id}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/admin/_components/CommandPalette.tsx
git commit -m "$(cat <<'EOF'
admin: add CommandPalette overlay with keyboard navigation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Reskin `/admin` index route

**Files:**
- Modify: `app/routes/admin/index.tsx`

- [ ] **Step 1: Replace the entire `app/routes/admin/index.tsx` with the version below**

```tsx
import { WorldKind } from '@core/domain/builder-kinds';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { cloneLive, createDraft, listWorlds } from '~/server/admin/worlds';
import { Fonts } from './_components/Fonts';

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
  loader: async () => ({ worlds: await listWorlds() }),
});

function AdminIndex() {
  const { worlds } = Route.useLoaderData();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [label, setLabel] = useState('');

  const onCreate = async (): Promise<void> => {
    if (!displayName || !label) return;
    await createDraft({ data: { displayName, label } });
    router.invalidate();
    setDisplayName('');
    setLabel('');
  };

  const drafts = worlds.filter((w) => w.kind === WorldKind.Draft);
  const liveWorlds = worlds.filter((w) => w.kind === WorldKind.Live);

  return (
    <div className="admin-root">
      <Fonts />
      <div className="index-page">
        <header>
          <h1 className="t-headline-lg">Campaign Builder</h1>
          <p className="t-metadata">Drafts and live worlds.</p>
        </header>

        <section>
          <h2 className="t-label-caps" style={{ marginBottom: 12 }}>
            Drafts
          </h2>
          {drafts.length === 0 ? (
            <p className="t-metadata" style={{ fontStyle: 'italic' }}>
              No drafts yet.
            </p>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((w) => (
                  <tr key={w.id as string}>
                    <td>
                      <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                        {w.displayName || w.label}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--parchment-dim)' }}>{w.id as string}</td>
                    <td>
                      <span className="chip chip--gold">DRAFT</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="newDraftDisplay">Display name</label>
              <input
                id="newDraftDisplay"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="newDraftLabel">World label</label>
              <input
                id="newDraftLabel"
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn--primary" onClick={onCreate}>
              New draft
            </button>
          </div>
        </section>

        <section>
          <h2 className="t-label-caps" style={{ marginBottom: 12 }}>
            Live worlds
          </h2>
          {liveWorlds.length === 0 ? (
            <p className="t-metadata" style={{ fontStyle: 'italic' }}>
              No live worlds.
            </p>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liveWorlds.map((w) => (
                  <tr key={w.id as string}>
                    <td>
                      <Link to="/admin/$worldId" params={{ worldId: w.id as string }}>
                        {w.displayName || w.label}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--parchment-dim)' }}>{w.id as string}</td>
                    <td>
                      <span className="chip chip--crimson">LIVE</span>
                    </td>
                    <td>
                      {w.parentDraftId === null && (
                        <button
                          type="button"
                          className="btn"
                          onClick={async () => {
                            await cloneLive({ data: { id: w.id as string } });
                            router.invalidate();
                          }}
                        >
                          Clone as draft
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/index.tsx
git commit -m "$(cat <<'EOF'
admin: reskin index route with grimoire ledger layout

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Reskin `/admin/$worldId` with three-pane layout and new components

**Files:**
- Modify: `app/routes/admin/$worldId.tsx`

- [ ] **Step 1: Replace the entire `app/routes/admin/$worldId.tsx` with the version below**

```tsx
import { EntityKind, WorldKind } from '@core/domain/builder-kinds';
import type { WorldTree } from '@core/domain/builder-types';
import { OwnerKind } from '@core/domain/kinds';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { deleteEntity, saveEntity } from '~/server/admin/entities';
import { publish, resetLive } from '~/server/admin/publish';
import {
  deleteTemplate,
  deleteTrigger,
  upsertTemplate,
  upsertTrigger,
} from '~/server/admin/templates';
import { validate } from '~/server/admin/validate';
import { getWorld } from '~/server/admin/worlds';
import { Breadcrumbs } from './_components/Breadcrumbs';
import { CommandPalette } from './_components/CommandPalette';
import { Fonts } from './_components/Fonts';
import { ManuscriptCard } from './_components/ManuscriptCard';
import { ProblemsRail } from './_components/ProblemsRail';
import { StatusBadge } from './_components/StatusBadge';

type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export const Route = createFileRoute('/admin/$worldId')({
  component: AdminWorld,
  loader: async ({ params }) => {
    const tree = await getWorld({ data: { id: params.worldId } });
    const v = await validate({ data: { id: params.worldId } });
    return { tree, problems: v.ok ? v.value : [] };
  },
});

type Selected = { kind: 'world' } | { kind: EntityKindValue; id: string };

function AdminWorld() {
  const { tree, problems } = Route.useLoaderData();
  const router = useRouter();
  const [sel, setSel] = useState<Selected>({ kind: 'world' });
  const [paletteOpen, setPaletteOpen] = useState(false);

  const problemsByEntity = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) {
      const k = `${p.entity}:${p.entityId}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [problems]);

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

  if (!tree.ok) {
    return (
      <div className="admin-root" style={{ padding: 24 }}>
        World not found.
      </div>
    );
  }
  const t = tree.value;

  const dot = (entity: string, id: string) =>
    problemsByEntity.has(`${entity}:${id}`) ? <span className="tree-item__dot">●</span> : null;

  const refresh = () => router.invalidate();

  const onPublish = async (): Promise<void> => {
    const r = await publish({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Publish failed: ${r.error.message}`);
    else alert(`Published. Skipped: ${r.value.skipped.length}`);
  };
  const onReset = async (): Promise<void> => {
    if (
      !confirm(
        'Reset live world to this draft? This will replace structural rows on the live world.',
      )
    )
      return;
    const r = await resetLive({ data: { id: t.summary.id as string } });
    refresh();
    if (!r.ok) alert(`Reset failed: ${r.error.message}`);
  };

  const isSelected = (kind: EntityKindValue, id: string): boolean =>
    sel.kind === kind && 'id' in sel && sel.id === id;

  return (
    <div className="admin-root">
      <Fonts />
      <div className="detail-shell">
        <header className="detail-header">
          <h1 className="t-headline-md">{t.summary.displayName || t.summary.label}</h1>
          <StatusBadge kind={t.summary.kind} id={t.summary.id as string} />
          <div className="detail-header__actions">
            {t.summary.kind === WorldKind.Draft && (
              <>
                <button type="button" className="btn btn--primary" onClick={onPublish}>
                  Publish
                </button>
                <button type="button" className="btn" onClick={onReset}>
                  Reset live
                </button>
              </>
            )}
          </div>
        </header>

        <aside className="tree-pane">
          <button
            type="button"
            className={`tree-item__button ${
              sel.kind === 'world' ? 'tree-item__button--selected' : ''
            }`}
            onClick={() => setSel({ kind: 'world' })}
          >
            World settings
          </button>

          <div className="tree-section">
            <h3 className="t-label-caps tree-section__heading">Locations</h3>
            <ul className="tree-list">
              {t.locations.map((l) => {
                const locId = l.id as string;
                const exitsHere = t.exits.filter((e) => (e.from as string) === locId);
                const agentsHere = t.agents.filter((a) => (a.locationId as string) === locId);
                const itemsHere = t.items.filter(
                  (i) => i.owner.kind === OwnerKind.Location && (i.owner.id as string) === locId,
                );
                const triggersHere = t.triggers.filter(
                  (trg) => (trg.locationId as string) === locId,
                );
                return (
                  <li key={locId} className="tree-item">
                    <button
                      type="button"
                      className={`tree-item__button ${
                        isSelected(EntityKind.Location, locId) ? 'tree-item__button--selected' : ''
                      }`}
                      onClick={() => setSel({ kind: EntityKind.Location, id: locId })}
                    >
                      {l.label}
                      {dot(EntityKind.Location, locId)}
                    </button>
                    {(exitsHere.length > 0 ||
                      agentsHere.length > 0 ||
                      itemsHere.length > 0 ||
                      triggersHere.length > 0) && (
                      <ul className="tree-list">
                        {exitsHere.map((e) => {
                          const id = e.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.Exit, id) ? 'tree-item__button--selected' : ''
                                }`}
                                onClick={() => setSel({ kind: EntityKind.Exit, id })}
                              >
                                ↪ {e.direction} → {e.to}
                                {dot(EntityKind.Exit, id)}
                              </button>
                            </li>
                          );
                        })}
                        {agentsHere.map((a) => {
                          const id = a.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.Agent, id) ? 'tree-item__button--selected' : ''
                                }`}
                                onClick={() => setSel({ kind: EntityKind.Agent, id })}
                              >
                                ☻ {a.label}
                                {dot(EntityKind.Agent, id)}
                              </button>
                            </li>
                          );
                        })}
                        {itemsHere.map((i) => {
                          const id = i.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.Item, id) ? 'tree-item__button--selected' : ''
                                }`}
                                onClick={() => setSel({ kind: EntityKind.Item, id })}
                              >
                                ◆ {i.label}
                                {dot(EntityKind.Item, id)}
                              </button>
                            </li>
                          );
                        })}
                        {triggersHere.map((trg) => {
                          const id = trg.id as string;
                          return (
                            <li key={id} className="tree-item">
                              <button
                                type="button"
                                className={`tree-item__button tree-item__button--dim ${
                                  isSelected(EntityKind.LocationSpawnTrigger, id)
                                    ? 'tree-item__button--selected'
                                    : ''
                                }`}
                                onClick={() =>
                                  setSel({ kind: EntityKind.LocationSpawnTrigger, id })
                                }
                              >
                                ⚡ {trg.params.kind} → {trg.templateId} (×{trg.count})
                                {dot(EntityKind.LocationSpawnTrigger, id)}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="tree-section">
            <h3 className="t-label-caps tree-section__heading">Bestiary</h3>
            <ul className="tree-list">
              {t.templates.map((tpl) => {
                const id = tpl.id as string;
                return (
                  <li key={id} className="tree-item">
                    <button
                      type="button"
                      className={`tree-item__button ${
                        isSelected(EntityKind.MonsterTemplate, id)
                          ? 'tree-item__button--selected'
                          : ''
                      }`}
                      onClick={() => setSel({ kind: EntityKind.MonsterTemplate, id })}
                    >
                      🐲 {tpl.label}
                      {dot(EntityKind.MonsterTemplate, id)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {(() => {
            const orphanItems = t.items.filter((i) => i.owner.kind !== OwnerKind.Location);
            if (orphanItems.length === 0) return null;
            return (
              <div className="tree-section">
                <h3 className="t-label-caps tree-section__heading">Items (carried / nested)</h3>
                <ul className="tree-list">
                  {orphanItems.map((i) => {
                    const id = i.id as string;
                    return (
                      <li key={id} className="tree-item">
                        <button
                          type="button"
                          className={`tree-item__button ${
                            isSelected(EntityKind.Item, id) ? 'tree-item__button--selected' : ''
                          }`}
                          onClick={() => setSel({ kind: EntityKind.Item, id })}
                        >
                          ◆ {i.label}
                          {dot(EntityKind.Item, id)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </aside>

        <main className="detail-pane">
          <Breadcrumbs tree={t} sel={sel} />
          <div style={{ marginTop: 16 }}>
            <FormPanel
              tree={t}
              sel={sel}
              onSaved={refresh}
              onDeleted={() => {
                setSel({ kind: 'world' });
                refresh();
              }}
            />
          </div>
        </main>

        <ProblemsRail
          problems={problems}
          onSelect={(s) => setSel({ kind: s.kind, id: s.id })}
        />
      </div>

      <CommandPalette
        tree={t}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(s) => setSel({ kind: s.kind, id: s.id })}
      />
    </div>
  );
}

function FormPanel(props: {
  tree: WorldTree;
  sel: Selected;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  if (sel.kind === 'world') {
    return <p className="t-metadata">Select an entity from the tree, or press ⌘K.</p>;
  }
  if (sel.kind === EntityKind.Location) {
    const loc = tree.locations.find((l) => (l.id as string) === sel.id);
    if (!loc) return <p className="t-metadata">Not found.</p>;
    return (
      <LocationForm
        tree={tree}
        initial={{
          id: loc.id as string,
          label: loc.label,
          shortDescription: loc.shortDescription,
          longDescription: loc.longDescription,
        }}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    );
  }
  return <RawJsonForm tree={tree} sel={sel} onSaved={onSaved} onDeleted={onDeleted} />;
}

function LocationForm(props: {
  tree: WorldTree;
  initial: { id: string; label: string; shortDescription: string; longDescription: string };
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, initial, onSaved, onDeleted } = props;
  const [v, setV] = useState(initial);

  return (
    <div>
      <h2 className="t-headline-md" style={{ marginBottom: 16 }}>
        Location: {v.label}
      </h2>
      <div className="field">
        <label htmlFor="loc-id">ID</label>
        <input id="loc-id" className="input input--readonly" value={v.id} readOnly />
      </div>
      <div className="field">
        <label htmlFor="loc-label">Label</label>
        <input
          id="loc-label"
          className="input"
          value={v.label}
          onChange={(e) => setV({ ...v, label: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="loc-short">Short description</label>
        <input
          id="loc-short"
          className="input"
          value={v.shortDescription}
          onChange={(e) => setV({ ...v, shortDescription: e.target.value })}
        />
      </div>
      <div className="field">
        <span className="t-label-caps" style={{ fontSize: 12 }}>
          Long description
        </span>
        <ManuscriptCard
          entityId={v.id}
          value={v.longDescription}
          onChange={(next) => setV({ ...v, longDescription: next })}
        />
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            await saveEntity({
              data: {
                worldId: tree.summary.id as string,
                entity: EntityKind.Location,
                payload: v,
              },
            });
            onSaved();
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await deleteEntity({
              data: {
                worldId: tree.summary.id as string,
                entity: EntityKind.Location,
                id: v.id,
              },
            });
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function RawJsonForm(props: {
  tree: WorldTree;
  sel: Exclude<Selected, { kind: 'world' }>;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { tree, sel, onSaved, onDeleted } = props;
  const find = () => {
    if (sel.kind === EntityKind.Agent) return tree.agents.find((a) => (a.id as string) === sel.id);
    if (sel.kind === EntityKind.Item) return tree.items.find((i) => (i.id as string) === sel.id);
    if (sel.kind === EntityKind.MonsterTemplate)
      return tree.templates.find((tpl) => (tpl.id as string) === sel.id);
    if (sel.kind === EntityKind.LocationSpawnTrigger)
      return tree.triggers.find((trg) => (trg.id as string) === sel.id);
    return tree.exits.find((e) => (e.id as string) === sel.id);
  };
  const initial = find();
  const [json, setJson] = useState(JSON.stringify(initial ?? {}, null, 2));
  if (!initial) return <p className="t-metadata">Not found.</p>;

  return (
    <div>
      <h2 className="t-headline-md" style={{ marginBottom: 8 }}>
        {sel.kind}: {sel.id}
      </h2>
      <p className="t-metadata" style={{ fontStyle: 'italic', marginBottom: 16 }}>
        v1 fallback editor — edit fields as JSON, then Save.
      </p>
      <textarea
        className="json-editor"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={20}
      />
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns any; we validate in try/catch
            let parsed: any;
            try {
              parsed = JSON.parse(json);
            } catch (e) {
              alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
              return;
            }
            const payload =
              sel.kind === EntityKind.Item
                ? {
                    ...parsed,
                    ownerKind: parsed.owner?.kind,
                    ownerId: parsed.owner?.id,
                  }
                : parsed;
            if (sel.kind === EntityKind.MonsterTemplate) {
              await upsertTemplate({
                data: { worldId: tree.summary.id as string, payload },
              });
            } else if (sel.kind === EntityKind.LocationSpawnTrigger) {
              await upsertTrigger({
                data: { worldId: tree.summary.id as string, payload },
              });
            } else {
              await saveEntity({
                data: { worldId: tree.summary.id as string, entity: sel.kind, payload },
              });
            }
            onSaved();
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (sel.kind === EntityKind.MonsterTemplate) {
              await deleteTemplate({
                data: { worldId: tree.summary.id as string, id: sel.id },
              });
            } else if (sel.kind === EntityKind.LocationSpawnTrigger) {
              await deleteTrigger({
                data: { worldId: tree.summary.id as string, id: sel.id },
              });
            } else {
              await deleteEntity({
                data: { worldId: tree.summary.id as string, entity: sel.kind, id: sel.id },
              });
            }
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both pass.

- [ ] **Step 3: Run the full vitest suite**

Run: `pnpm test`
Expected: all tests pass, including the new `filter-tree.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/\$worldId.tsx
git commit -m "$(cat <<'EOF'
admin: reskin world detail with three-pane grimoire layout

Three-pane shell (tree / detail / problems rail), Manuscript card for
Location long descriptions, status badge in header, breadcrumbs above
the form, and Cmd/Ctrl-K Command Palette.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Visual verification in browser

**Files:** none modified — manual check only.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Vite starts; note the local URL (usually `http://localhost:3000` or `http://localhost:5173`).

- [ ] **Step 2: Open `/admin` and verify**

In the browser, navigate to `/admin`. Confirm:
- Page background is ink black, text is parchment.
- Title "Campaign Builder" renders in Playfair Display (serif).
- Section labels "DRAFTS" / "LIVE WORLDS" are EB Garamond, uppercase, dim.
- Ledger tables have horizontal-only borders, no row striping, hover-highlight.
- Inputs are underline-only (no boxes); focus turns underline gold.
- All corners are square; no shadows, no rounded buttons.
- DRAFT chips are gold-outlined; LIVE chips are crimson-outlined.

- [ ] **Step 3: Open a draft world's detail page and verify**

Click into a draft world. Confirm:
- Three-pane layout: tree left, detail center, Problems rail right.
- Header shows world name + DRAFT badge (gold border) + PUBLISH/RESET LIVE actions on the right.
- Tree shows LOCATIONS / BESTIARY headings in caps.
- Selecting a location highlights with a gold left-border and lighter background.
- Breadcrumbs appear above the detail form in italic serif.
- For a Location, the long-description field renders in a Manuscript card with a left "gutter" showing ID and word count.
- Problems rail on the right shows entity chips and messages, or "No problems." italic.

- [ ] **Step 4: Test the Command Palette**

Press `Cmd-K` (or `Ctrl-K` on Linux). Confirm:
- Overlay appears centered, charcoal background, 4px-offset sharp shadow.
- Typing filters results across all entity kinds.
- ↑/↓ moves the highlight; Enter selects and closes the palette; Esc closes without selecting.
- Selecting a result updates the tree selection in the detail route.

- [ ] **Step 5: If anything fails the eyeball check, file follow-up tasks**

Do not "fix" visual deviations in this commit. The plan is complete when the structural items above all render. Any DESIGN.md nit-picks (exact spacing, font weights, etc.) belong in a follow-up.

- [ ] **Step 6: Stop the dev server**

Stop `pnpm dev`.

---

## Self-Review (already performed; recorded here for transparency)

- **Spec coverage:** every section of the spec maps to a task: tokens (T1), fonts (T2), status badge (T3), breadcrumbs (T4), manuscript (T5), problems rail (T6), command palette logic (T7) + UI (T8), index reskin (T9), detail reskin + wiring (T10), verification (T11).
- **Placeholders:** none.
- **Type consistency:** `EntityKindValue` defined identically in CommandPalette, ProblemsRail, and $worldId.tsx; `Selected` type mirrors the spec; `filterTree` signature is consistent between definition and consumer.
- **No dependency on unwritten code:** every component is built before it is imported.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-admin-grimoire-redesign.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
