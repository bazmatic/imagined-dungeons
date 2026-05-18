# Sensorium CSS & Field Alignment — Design Spec

**Date:** 2026-05-18
**Status:** Approved for implementation

## Overview

The Sensorium tab (NPC decision history viewer) was built with its own `.sensorium-*` and `.agent-tabs-*` CSS class names, but none of those classes are defined in `admin.css`. The entire feature renders completely unstyled. Additionally, `npc-mind.ts` builds the `DecisionSnapshot` using stale field names (`shortTermIntent`, `intentBefore`, `intentAfter`) that no longer match the domain type (`sideQuest`, `sideQuestBefore`, `sideQuestAfter`), causing the Sensorium to display blank values at runtime.

This spec covers two changes:
1. Add the missing CSS for all `.sensorium-*` and `.agent-tabs-*` classes to `admin.css`, using the existing admin design tokens throughout.
2. Fix `npc-mind.ts` to use the correct field names when assembling the snapshot.

No component files are modified.

---

## 1. Tab Bar — `.agent-tabs__bar` / `.agent-tabs__tab`

Matches the `top-bar__tab` pattern:

```css
.admin-root .agent-tabs__bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0;
}

.admin-root .agent-tabs__tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--parchment-dim);
  font-family: var(--font-label);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: var(--s-3) var(--s-4);
  cursor: pointer;
  margin-bottom: -1px;
}

.admin-root .agent-tabs__tab:hover {
  color: var(--parchment);
}

.admin-root .agent-tabs__tab--active {
  color: var(--crimson);
  border-bottom-color: var(--crimson);
}
```

---

## 2. Sensorium Pane Layout — `.sensorium-pane`

Two-column grid: fixed-width history list on the left, detail area on the right.

```css
.admin-root .sensorium-pane {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 400px;
}

.admin-root .sensorium-pane__detail {
  padding: var(--s-5) var(--s-6);
  overflow-y: auto;
}
```

---

## 3. History List — `.sensorium-list` / `.sensorium-list__item`

Matches the `master-pane` / `tree-leaf` pattern. Gold left border for the selected item (not crimson) to signal read-only rather than editable selection.

```css
.admin-root .sensorium-list {
  background: var(--surface-low);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.admin-root .sensorium-list--empty {
  padding: var(--s-4);
}

.admin-root .sensorium-list__label {
  padding: var(--s-2) var(--s-3);
  background: var(--surface-lowest);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-label);
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--parchment-dim);
}

.admin-root .sensorium-list__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--s-2) var(--s-3);
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: var(--parchment-dim);
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.admin-root .sensorium-list__item:hover {
  background: var(--charcoal-hover);
  color: var(--parchment);
}

.admin-root .sensorium-list__item--selected {
  background: var(--charcoal-hover);
  border-left-color: var(--gold);
  color: var(--gold-bright);
}

.admin-root .sensorium-list__timestamp {
  font-family: var(--font-data);
  font-size: 11px;
}

.admin-root .sensorium-list__location {
  font-family: var(--font-label);
  font-size: 11px;
  font-style: italic;
  opacity: 0.7;
}
```

---

## 4. Detail Area Meta Line — `.sensorium-detail__meta`

The timestamp + fallback indicator at the top of the detail view.

```css
.admin-root .sensorium-detail {
  display: flex;
  flex-direction: column;
}

.admin-root .sensorium-detail__meta {
  font-family: var(--font-label);
  font-size: 13px;
  font-style: italic;
  color: var(--parchment-dim);
  margin-bottom: var(--s-3);
}
```

---

## 5. Collapsible Sections — `.sensorium-section`

Matches the `.sub-section` pattern: border-top divider, EB Garamond uppercase title.

```css
.admin-root .sensorium-section {
  border-top: 1px solid var(--border);
  padding-top: var(--s-4);
  margin-top: var(--s-4);
}

.admin-root .sensorium-section__header {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  background: transparent;
  border: none;
  color: var(--parchment-dim);
  font-family: var(--font-label);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0;
  margin-bottom: var(--s-3);
  width: 100%;
  text-align: left;
}

.admin-root .sensorium-section__header:hover {
  color: var(--parchment);
}

.admin-root .sensorium-section__chevron {
  font-size: 9px;
  width: 10px;
  flex-shrink: 0;
  color: var(--parchment-dim);
}

.admin-root .sensorium-section__title {
  /* inherits from button */
}

.admin-root .sensorium-section__body {
  /* content inherits its own typography */
}
```

---

## 6. Definition List — `.sensorium-dl`

Two-column grid: uppercase label keys left, monospace values right.

```css
.admin-root .sensorium-dl {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: var(--s-1) var(--s-3);
  margin: 0;
}

.admin-root .sensorium-dl dt {
  font-family: var(--font-label);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--parchment-dim);
  padding-top: 2px;
}

.admin-root .sensorium-dl dd {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--parchment);
  line-height: 1.5;
  margin: 0;
}
```

---

## 7. Memory List — `.sensorium-memory` / `.sensorium-list-inline`

```css
.admin-root .sensorium-memory {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-root .sensorium-memory li {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--parchment);
  padding: var(--s-1) 0;
  border-bottom: 1px solid var(--border);
  line-height: 1.4;
}

.admin-root .sensorium-memory li:last-child {
  border-bottom: none;
}

.admin-root .sensorium-list-inline {
  list-style: none;
  padding: 0;
  margin: 0;
}

.admin-root .sensorium-list-inline li {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--parchment);
  padding: 1px 0;
}
```

---

## 8. Raw Prompt — `.sensorium-raw`

Matches `.manuscript-body-v2` spirit for read-only code blocks.

```css
.admin-root .sensorium-raw {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.admin-root .sensorium-raw__label {
  font-family: var(--font-label);
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--parchment-dim);
  margin-top: var(--s-3);
}

.admin-root .sensorium-raw__body {
  background: var(--surface-lowest);
  border: 1px solid var(--border);
  color: var(--parchment-dim);
  font-family: var(--font-data);
  font-size: 11px;
  line-height: 1.6;
  padding: var(--s-3);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}
```

---

## Out of scope

- Changing component file structure or class naming
- Any Sensorium feature additions (new fields, sorting, filtering)
- Styling the Profile tab content (AgentForm — already styled)
