# Sensorium CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all missing `.sensorium-*` and `.agent-tabs-*` CSS rules to `admin.css` so the Sensorium tab renders consistently with the rest of the admin UI.

**Architecture:** Pure CSS addition at the bottom of `app/routes/admin/admin.css`. All rules use existing design tokens (CSS custom properties already defined in `.admin-root`). No component files are touched.

**Tech Stack:** CSS, admin design token system (`--font-label`, `--font-data`, `--parchment`, `--surface-low`, etc.)

---

## File Map

| File | Change |
|------|--------|
| `app/routes/admin/admin.css` | Append ~130 lines of new CSS rules at the end |

---

## Task 1: Add Sensorium CSS to admin.css

**Files:**
- Modify: `app/routes/admin/admin.css` (append after line 1542)

There are no unit tests for CSS. Verification is visual — start the dev server and open the Sensorium tab on any NPC agent.

- [ ] **Step 1: Append the CSS block to admin.css**

Open `app/routes/admin/admin.css` and append the following block at the very end of the file (after the last `}` on line 1542):

```css
/* === Sensorium (NPC decision history viewer) === */

/* Tab bar — Profile / Sensorium toggle */
.admin-root .agent-tabs__bar {
  display: flex;
  border-bottom: 1px solid var(--border);
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

/* Two-column pane: list left, detail right */
.admin-root .sensorium-pane {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 400px;
}

.admin-root .sensorium-pane__detail {
  padding: var(--s-5) var(--s-6);
  overflow-y: auto;
}

/* History list — left column */
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

/* Detail area */
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

/* Collapsible sections — matches .sub-section pattern */
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

/* Definition list — two-column grid */
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

/* Memory event list */
.admin-root .sensorium-memory {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
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

/* Inline list (unanswered addresses) */
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

/* Raw prompt blocks */
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

- [ ] **Step 2: Verify no TypeScript/build errors**

```bash
pnpm tsc --noEmit
```

Expected: no errors. (CSS changes don't affect TypeScript, but run this to catch any pre-existing issues before the visual check.)

- [ ] **Step 3: Start the dev server (if not already running)**

```bash
pnpm dev
```

Expected: server starts at `http://localhost:5173/`

- [ ] **Step 4: Verify visually in the browser**

Open `http://localhost:5173/` in a browser, navigate to the admin area, open a world, select any NPC agent, and click the **Sensorium** tab.

Check each of the following:

| What to look for | Expected |
|---|---|
| Tab bar | "Profile" and "Sensorium" tabs visible, uppercase, parchment-dim. Active tab has crimson bottom border. |
| History list | Dark `surface-low` background on the left, gold left border on the selected item. Timestamp in monospace, location in italic below it. |
| Section headers | Separated by thin border-top lines. Uppercase label in parchment-dim. Chevron ▼/▶ toggles open/close. |
| Agent State section | Two-column grid: uppercase dim label left, parchment monospace value right. |
| Memory section | List of events, each separated by a subtle border-bottom. |
| Raw Prompt section | Collapsed by default. When opened: dark `surface-lowest` background, dim monospace text, scrollable. |
| Empty state | If no decisions exist yet: plain italic message. |

If the tab shows completely unstyled (raw browser buttons, no layout) — the CSS didn't load. Hard-refresh the browser (`Cmd+Shift+R` on macOS).

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin/admin.css
git commit -m "feat(admin): add Sensorium CSS — tab bar, pane layout, list, sections, dl, raw prompt"
```
