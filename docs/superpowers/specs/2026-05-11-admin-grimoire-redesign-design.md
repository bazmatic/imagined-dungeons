# Admin "Digital Grimoire" Redesign — Design Spec

**Date:** 2026-05-11
**Scope:** Visual reskin of the admin UI plus selected structural upgrades, per `DESIGN.md` (the "Digital Grimoire" system).
**Routes affected:** `app/routes/admin/index.tsx`, `app/routes/admin/$worldId.tsx`.
**Player-facing routes untouched.** No backend changes.

## Goal

Replace the current functional-but-plain admin styling with a faithful implementation of the Digital Grimoire design system: dark "low-light archive" palette, dual-layer typography (serif + monospace), sharp corners, underline inputs, ledger tables, and a calm worldbuilding atmosphere. Add a small set of high-value structural improvements that the design language asks for: a Manuscript card, a Problems rail, draft/live status treatment, breadcrumbs, and a Command Palette affordance.

## Non-goals

- Mobile / responsive collapse behavior. Desktop-only for this pass.
- Restyling player-facing routes (`/` and the root document body) beyond the minimum needed to load admin fonts and stylesheet.
- Restructuring `RawJsonForm` into per-entity forms. The JSON fallback editor stays as-is, retheme only.
- New backend endpoints or changes to save/publish/validate behavior.
- A real fuzzy-search index. The command palette searches the already-loaded `WorldTree` in memory.

## Approach overview

1. Introduce a single admin stylesheet (`app/routes/admin/admin.css`) with the DESIGN.md design tokens as CSS custom properties and a small set of component classes. No CSS framework. No CSS-in-JS.
2. Load Google Fonts (Playfair Display, EB Garamond, JetBrains Mono) via `<link>` tags in the admin route subtree only, so the player route is unaffected.
3. Replace inline `style={{...}}` usages in the two admin routes with class names. Keep all component logic, state, and data flow untouched.
4. Add the new structural elements (Manuscript card, Problems rail, status badge, breadcrumbs, Command Palette) as small components co-located in the admin route folder.

## Design tokens

Tokens go into `app/routes/admin/admin.css` as `:root` custom properties, scoped via a root class on the admin page so they don't leak. **Source of truth is the DESIGN.md narrative (the prose below the frontmatter)**, not the frontmatter palette. The frontmatter has ~50 Material-style tokens that contradict the narrative in places (e.g., it has rounded "container" colors and tertiary fixed variants the narrative never uses). Use only the table below; ignore the frontmatter palette beyond what's listed here.

### Colors

| Token | Value | Use |
|---|---|---|
| `--ink-black` | `#0a0a0a` | Level 0, page background |
| `--charcoal` | `#121212` | Level 1, panels and cards |
| `--charcoal-hover` | `#1a1a1a` | Level 2, hover/active surfaces |
| `--parchment` | `#d1d1d1` | Primary text |
| `--parchment-dim` | `#a78a88` | Secondary text, metadata |
| `--crimson` | `#9e2a2b` | Live status, critical warnings, primary action underline |
| `--crimson-bright` | `#ffb3ae` | Crimson on dark, focus-visible accents |
| `--gold` | `#b69121` | Active nav, selection, featured |
| `--gold-bright` | `#ebc24f` | Input focus underline, hover gold |
| `--border` | `#262626` | Dividers, low-contrast separators |
| `--tertiary` | `#8bd2db` | Reserved (info accents — used sparingly for problem-count badges) |

### Typography

Three font families, loaded once:

- `--font-display: 'Playfair Display', Georgia, serif;`
- `--font-label: 'EB Garamond', Georgia, serif;`
- `--font-data: 'JetBrains Mono', ui-monospace, monospace;`

Type scale (matches DESIGN.md frontmatter):

| Class | Family | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `.t-headline-lg` | display | 34px | 600 | -0.02em | Page title (world name on detail) |
| `.t-headline-md` | display | 24px | 500 | normal | Section headings |
| `.t-label-caps` | label | 14px | 600 | 0.1em | All-caps section labels ("LOCATIONS", "BESTIARY") |
| `.t-data` | data | 14px | 400 | -0.01em | Tree items, table cells, inputs |
| `.t-data-sm` | data | 12px | 400 | normal | Chips, IDs, count badges |
| `.t-metadata` | label | 16px | 400 | normal | Body copy, breadcrumbs (italic variant via `.t-breadcrumb`) |

Line-height is 1.6 for `.t-data` to satisfy the "no wall of text" requirement.

### Spacing

CSS variables for the 4px baseline: `--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-8: 48px;`.

Container max-width: `--container-max: 1440px`. The admin shell uses full viewport width (the master/detail layout needs all of it), so `--container-max` applies only inside the detail pane's content column.

## Layout

### `/admin` (index)

A centered single-column page (max-width 960px, matching current). Sections:

1. **Header.** `.t-headline-lg` title "Campaign Builder". Below: a `.t-metadata` subtitle "Drafts and live worlds."
2. **Drafts section.** `.t-label-caps` heading "DRAFTS". A ledger table (no row striping, hover-highlight) with columns: world name, ID (monospace, dim), problem count chip, "Open" affordance (entire row is the link). Empty state in `.t-metadata` italic: *No drafts yet.*
3. **New draft form.** Underline inputs (display name, label) inline with a primary "NEW DRAFT" text button.
4. **Live worlds section.** Same ledger pattern, with a small crimson "LIVE" chip per row. Live worlds without a parent draft show a secondary "CLONE AS DRAFT" action.

### `/admin/$worldId` (detail)

Three-pane layout:

```
+---------------+--------------------------+----------------+
| Tree (left)   | Detail (center)          | Problems rail  |
| 320px         | flex, max 880px content  | 280px          |
+---------------+--------------------------+----------------+
```

Total width fills the viewport; no max-width on the shell.

- **Header bar** spans all three panes: world display name (`.t-headline-md`), draft/live status badge (crimson outline if live, gold outline if draft), and right-aligned actions (PUBLISH, RESET LIVE) — both text buttons, draft-only.
- **Left tree pane.** `.t-label-caps` section headings ("LOCATIONS", "BESTIARY", "ITEMS"). Tree items use `.t-data`; nested children indent 16px. Selection state: gold left border (2px) and `--charcoal-hover` background. Problem indicator: a `--crimson` dot (•) suffixed to the label.
- **Center detail pane.** Breadcrumbs at the top (`.t-breadcrumb`), then the entity form. The form area renders one of:
  - **SimpleForm** for Locations (and any future per-entity forms) — underline inputs.
  - **Manuscript card** for the long-description field on Location (and on any entity with a long-text field). See below.
  - **RawJsonForm** for everything else — retheme only: monospace, charcoal background, sharp border. No structural change.
- **Right Problems rail.** `.t-label-caps` heading "PROBLEMS (n)". Each problem is a row with: entity-kind chip (1px outlined, monospace 12px), short message, and a faint click target that selects the offending entity in the tree.

### Manuscript card

A specialized container for long-form description text. Structure:

```
+------------------------------------------------------+
| GUTTER NOTES |  Body (.t-data, line-height 1.6)      |
| (.t-data-sm, |                                        |
|  parchment-  |  ... long description ...              |
|  dim)        |                                        |
+------------------------------------------------------+
```

Layout: CSS grid with two columns, `120px 1fr`, gap 24px. Gutter is for metadata (e.g., entity ID, last-saved timestamp if available, word count of the body). Border: 1px `--border`. Padding: 24px. Body field is a borderless `<textarea>` with `background: transparent` and `color: var(--parchment)`, growing with content (auto-resize via a tiny `useLayoutEffect`).

Only the Location entity gets the Manuscript treatment in this pass (it's the only one with a true long-description field). Other entities continue to use the existing simple textarea or RawJsonForm.

### Breadcrumbs

EB Garamond italic, slash-separated, dim parchment color. For a Location selection: `World name / Locations / <label>`. For an Exit/Agent/Item under a location: `World name / Locations / <parent location> / <kind> / <label>`. For a template/trigger/orphan item: `World name / <Section> / <label>`.

Implementation: derive the trail from `WorldTree` + `sel` in the existing component, no new state.

### Command Palette

Trigger: `Cmd/Ctrl-K` anywhere on the detail route. Renders an absolutely-positioned overlay centered horizontally, 480px wide, 60vh max-height. Background `--charcoal`, 1px `--border`, **sharp 4px-offset shadow** (the only place shadows are allowed per DESIGN.md): `box-shadow: 4px 4px 0 rgba(0,0,0,0.5);`.

Contents:
- Single underline input at top, autofocused.
- A flat list of results below: each result is `entity-kind chip | label | dim ID`.

Search: case-insensitive substring match against `label` and `id` across the loaded `WorldTree` (locations, agents, items, exits, templates, triggers). No fuzzy ranking — simple `.toLowerCase().includes(q)`. Up to 50 results.

Keyboard: `Esc` closes; `Enter` selects the highlighted result and closes; `↑/↓` move highlight. Click selects.

Selection effect: same as clicking the entity in the tree — sets `sel` in the parent.

### Status badge

In the detail route header. Two states:

- **DRAFT:** outlined chip, 1px gold border, gold text, monospace caps "DRAFT" + dim ID.
- **LIVE:** outlined chip, 1px crimson border, crimson text, "LIVE" + dim ID. (`--crimson-bright` on dark.)

## Components & files

New files:

- `app/routes/admin/admin.css` — tokens + component classes.
- `app/routes/admin/_components/ManuscriptCard.tsx`
- `app/routes/admin/_components/ProblemsRail.tsx`
- `app/routes/admin/_components/Breadcrumbs.tsx`
- `app/routes/admin/_components/StatusBadge.tsx`
- `app/routes/admin/_components/CommandPalette.tsx`
- `app/routes/admin/_components/Fonts.tsx` — emits the `<link>` tags for the three Google Fonts; rendered at the top of each admin route component.

Modified files:

- `app/routes/admin/index.tsx` — replace inline styles with classes; restructure into header + two ledger sections.
- `app/routes/admin/$worldId.tsx` — replace inline styles with classes; introduce three-pane layout; wire in the new components; lift `sel` setter so `CommandPalette` can call it.

Conventions:

- All admin components are wrapped by a `<div className="admin-root">` so the tokens scope to admin only.
- No new dependencies. Pure CSS + React.
- Class naming: BEM-lite (`.manuscript`, `.manuscript__gutter`, `.manuscript__body`).

## Data flow

Unchanged. The detail route still loads `tree` + `problems` via the existing loader and uses the same `saveEntity`/`deleteEntity`/`publish`/`resetLive` server functions. The new Problems rail consumes the existing `problems` array. The Command Palette consumes the existing in-memory `tree`. No new server endpoints.

## Error handling

Unchanged. Existing `alert()` calls on publish/reset failures stay (out of scope to redesign error UX). The Problems rail's empty state shows `.t-metadata` italic *No problems.*

## Testing

This is a visual change with one piece of new logic (command palette filtering). Approach:

1. **Visual verification.** Start `pnpm dev`, open the admin index and a draft world in a browser, eyeball against DESIGN.md narrative. Verify: fonts loaded, palette correct, sharp corners everywhere, underline inputs, no shadows except command palette, three-pane layout, manuscript card on Location, status badge present, breadcrumbs present.
2. **Command Palette unit test.** A single Vitest test for the filter function (`filterTree(tree, query)`) verifying substring match across all entity collections and the 50-result cap. Filter logic lives in a pure function so it can be tested without React.
3. **No backend tests.** Server is untouched.
4. **Typecheck and lint.** `pnpm typecheck` and `pnpm lint` must pass.

## Open questions resolved (assumptions for auto-mode)

- **Fonts source:** Google Fonts via `<link>` (no self-hosting). If offline-dev is a concern later, switch to self-hosted woff2 in a follow-up — interface stays the same.
- **Manuscript scope:** Location only, this pass.
- **Command Palette scope:** in-memory substring search across the loaded `WorldTree`. No fuzzy ranking, no remote search.
- **Player route:** untouched. Root document body keeps its current `background: #000; color: #cfcfcf;` — admin's `.admin-root` overrides on its subtree.
- **Status badge for new "Drafts" rows on index:** badge style applies on the detail header; on the index ledger, the row gets a small DRAFT/LIVE chip in a dedicated column. Consistent visual language, lighter weight.

## Done criteria

- All inline styles in `app/routes/admin/index.tsx` and `app/routes/admin/$worldId.tsx` replaced with classes from `admin.css`.
- DESIGN.md palette and type scale visible on the running admin pages.
- Three-pane layout on the detail route with Problems rail on the right.
- Manuscript card renders for Location's long description.
- Status badge in the detail header.
- Breadcrumbs in the detail pane.
- `Cmd/Ctrl-K` opens the Command Palette; selecting a result navigates the selection.
- `pnpm typecheck` and `pnpm lint` pass.
- Vitest filter-function test passes.
