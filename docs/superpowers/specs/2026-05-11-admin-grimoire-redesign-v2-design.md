# Admin Grimoire Redesign v2 — Design Spec

**Date:** 2026-05-11
**Predecessor:** `docs/superpowers/specs/2026-05-11-admin-grimoire-redesign-design.md` (v1). v1 is implemented and merged. v2 builds on it.
**Mockups:** `~/Downloads/stitch_imagined_dungeons_scriptorium/` — `campaign_builder_index/screen.png`, `world_editor_master_detail/screen.png`, and their `code.html` references.

## Goal

Bring the admin UI up to the structural and informational depth of the Stitch mockups: a true app shell with top bar and category nav, a richer hierarchical tree, a two-column form/metadata layout on the detail page, a hero-card grid for live worlds, and a small set of backend additions (cover image, tags, derived stats) that make the new UI carry real data rather than decoration.

## Non-goals

- Mobile / responsive collapse.
- Pixel-exact reproduction of the mockups. The Stitch palette is the warm "Aethelgard" Material-3-derived palette (`#1c1010` background, `#f4dddb` text, `#ebc24f` gold, `#ffb3ae` crimson). v1 chose the colder narrative palette (`#0a0a0a` / `#d1d1d1` / `#b69121` / `#9e2a2b`). v2 keeps **v1's palette**. We don't switch palettes mid-redesign for no reason; the narrative palette was deliberately chosen over the frontmatter palette in v1.
- Decorative features unsupported by data: world stat counts that aren't computable, X/Y coordinates, mini-maps, "related lore" cross-references, "Chronicle Log" / "Bulk Import", FAB. Skip all of these.
- Tailwind. We keep plain CSS + tokens in `app/routes/admin/admin.css`.
- Material Symbols icon font. Adds a 1MB+ font dependency for icons. Use a small inline-SVG icon set (or Unicode glyphs from v1) instead.

## Backend additions

Three small changes, in their own migration `drizzle/0008_admin_v2.sql`:

1. **`worlds.cover_image_url TEXT NULL`.** Optional URL string. Used to display hero imagery on the Live Worlds grid and a Key Visual panel on the world-settings detail. Null is the normal case; UI renders a tasteful placeholder pattern.
2. **`locations.tags TEXT NOT NULL DEFAULT '[]'`.** JSON-encoded array of free-form short strings. Parsed/stringified at the Drizzle boundary. Used in the location detail's tags row and (eventually) for filtering. Default `[]` so all existing rows are valid.
3. **Derived world stats on the world list endpoint.** No schema change. `listWorlds` returns each world enriched with `{ locationCount, agentCount, itemCount }`. Computed with three `SELECT COUNT(*) ... GROUP BY world_id` queries joined in app code, or three subqueries — implementer's choice. Used in the hero cards.

Schema/serializer changes propagate through:
- `src/infra/schema.ts` — Drizzle table definitions.
- `src/core/domain/builder-types.ts` — `WorldSummary` gains optional `coverImageUrl?: string | null`; `Location` gains `tags: readonly string[]`. Existing `UpsertLocationInput` gains `tags: readonly string[]` (default `[]` at the call site).
- `src/core/domain/builder-types.ts` — a new `WorldSummaryWithStats` for the list endpoint (extends `WorldSummary` + the three counts).
- `app/server/admin/worlds.ts` — `listWorlds()` returns `WorldSummaryWithStats[]`; `getWorld()` returns the world tree as before (no stats; the tree already has the raw entities).
- `app/server/admin/entities.ts` — Location upsert serializes `tags` to JSON before INSERT/UPDATE.

No publish-flow changes; tags travel with locations through draft→live like other fields.

## Information architecture

The admin UI has three structural surfaces:

### 1. App shell (every admin route)

- **Top bar (`.top-bar`, 64px tall).** Left: archive title "AETHELGARD ARCHIVE" in display caps + filter pills (Draft / Live / Archive). Right: search input, draft-version chip when on a draft, Reset + Publish actions, history/help icon-buttons. Search input is wired to the existing in-memory entity search behind the Command Palette (Cmd-K still works; the visible input is a shortcut into the same flow). On the index route the search filters worlds; on the detail route it triggers the palette.
- **Side nav (`.side-nav`, 224px wide, desktop only).** Visible only on the detail route. Top: GRIMOIRE wordmark + version line. Middle: category links — LORE, LOCATIONS, BESTIARY, ITEMS, CHARACTERS (which we render as ENTITIES → mapped to LOCATIONS+AGENTS for the time being; LORE is intentionally a no-op stub until we have a lore data model — visible to suggest the IA but disabled with a tooltip). Bottom: CREATE NEW ENTITY (opens command palette with creation menu) + Settings/Support links (also stubs, hidden behind a single SETTINGS link only).
- The shell is rendered by a new `AdminShell` component that wraps page content. Routes pass `route="index"` or `route="detail"`.

### 2. `/admin` index — "Campaign Builder"

Layout (12-column grid, `--container-max` width centered):

- **Workspace card (col 1-3, sticky).** "WORKSPACE" label-caps, "Campaign Builder" headline-lg, italic subtitle (a literal one-liner about organizing nascent visions; we copy the mockup wording but keep it short). Below: a "Quick Actions" card with two **functional** items only — "Open command palette (⌘K)" and "Reset live worlds" (links to the existing per-world action; placeholder if no draft selected). Cut all the decorative mockup actions; better to have two real buttons than five fake ones.
- **Main canvas (col 4-12).**
  - **Drafts section.** Section header "Nascent Visions" (Playfair) + italic "(Drafts)" + right-aligned counter "N WORKING DRAFTS". Below: the new-draft card (`.inscribe-card`) styled per the mockup — header "INSCRIBE NEW DRAFT", two-column form (Display Name, Label) with helper placeholders, primary "BEGIN CREATION" action bottom-right. Below the card: a high-density ledger of existing drafts, columns: Designation (name + label as subtitle), Inception (created date if available; otherwise empty), Status (chip), Actions (Open + Delete). Hover row highlight. No taxonomy decoration — the mockup's "taxonomy/industrial-decay-v4" subtitle maps to our existing `label` field.
  - **Live worlds section.** Section header "The Manifested" + italic "(Live Worlds)" + counter. Below: a 2-column grid (md+) of hero cards. Each card has a cover-image strip (aspect 21:9, with a `from-charcoal via-transparent to-transparent` gradient on the bottom edge), a "SYNCHRONIZED" pill in the top-left, then a body block with: world headline-md + italic display-name subtitle, a 3-cell stats strip (LOCATIONS / AGENTS / ITEMS — our derived counts; the mockup says NODES/ENTITIES/SCRIBES but we use accurate labels), a footer row with "Last Update: …" and "Enter Archive" link button. If a world has `coverImageUrl == null` we render a tasteful placeholder (a charcoal block with a low-opacity diagonal hatch pattern + the world's first letter in serif). No "Reset live worlds" mockup metaphor — that lives on the per-world detail page.
- **Scholar's Directive footer.** A pull-quote section: a left-aligned border-l-crimson, padding-left-32px block with a label-caps heading "SCHOLAR'S DIRECTIVE", an italic body quote, and a small attribution line. We hardcode a single quote for now; it's flavor, not data.

### 3. `/admin/$worldId` — "World Editor"

Full app shell + side nav. Workspace fills the remaining width. Internal structure:

- **Inner top header (`.detail-header`, below the global top bar).** Breadcrumb (italic serif, slash-separated): `Aethelgard / World Editor / <world name> / <selected entity>`. No publish/reset buttons here — they're in the global top bar's right side, which already shows them via the existing Draft/Live conditional. Status badge from v1 stays in the top bar.
- **Master pane (`.master-pane`, 320px).** Header strip "WORLD HIERARCHY" + filter icon (no-op for now; future use). Tree content: outer location nodes with expand/collapse arrows. When expanded, each location shows four sub-groups: Exits, Agents, Items, Triggers. Each sub-group has a count chip; expanding a sub-group reveals the individual entities. Selection: gold left-border accent (already in v1), bumped to a faint background tint. Bottom strip: a quick-search input that drives the same Command-Palette filter inline (filters the tree itself; doesn't open a modal). The Bestiary section moves out of this tree and into the side-nav's BESTIARY category (clicking BESTIARY in the side nav swaps the master pane to a flat bestiary list).
- **Detail pane (`.detail-pane`, max-width 1024px, generous padding).** Sections:
  - **Entity header.** Two-row block. Top row: entity-kind eyebrow ("ENTITY: LOCATION"), then `headline-lg` label. Right-aligned: UUID line and "Last Modified: …" line. (We don't track last-modified yet; render "—" or hide. Spec: hide if absent.)
  - **Two-column form grid (8/4).**
    - **Left (8 cols, primary content).** Manuscript-style fields — Label (renders in `headline-md` font when not focused; promotes to input on focus or via a small edit icon — actually, simpler: always an input but styled with the larger font; matches the mockup). Short Description (italic body). Long Description: keep the `ManuscriptCard` from v1 but restyle to match the mockup — a bordered surface-container-lowest block with internal padding, the textarea inside, optional toolbar buttons on hover (italic/link — render the icons but no-op the actions for now; flag as deferred). Gutter notes (word count, last saved) live in the right column instead.
    - **Right (4 cols, metadata).**
      - **Key Visual panel.** A 16:9 surface-container-high box. If the entity is a Location and the **world** has a cover image → render world's cover (this is intentional in v1 — locations don't get their own images yet). If null → render the placeholder. Below the image: a "CHANGE IMAGE" pill button (no-op for now if we don't ship image upload; spec defers this). For the World Settings entity, show the world's cover image and a working URL input below it (this is the only place a cover image can be edited initially).
      - **Tags panel (Location only).** "ATTRIBUTES & TAGS" label. Chip row of existing tags, each with a small × to remove. After the chips: an inline "+" chip that opens a tiny inline input for adding a new tag (no modal). Tags persist via the existing Location upsert + the new `tags` field.
      - **Footnote bar.** At the bottom of the detail pane (full width below the form grid), a thin row showing: word count, character count, problem count for this entity. Replaces the v1 bottom-of-page problems list. The full **Problems rail** moves into the side nav as a collapsible drawer accessed via a small icon button on the top-bar right (badge with count). Rationale: problems are global to the world, not per-entity; the rail competes with the metadata column.
- **Command Palette.** Unchanged from v1. Cmd-K still works; the top-bar search and tree quick-search are entry points to the same `filterTree` logic.

### Detail forms for non-Location entities

Out of scope for v2 to build per-entity forms for Agents, Items, Exits, Templates, Triggers — the `RawJsonForm` JSON fallback stays. However, the JSON form gets restyled to fit inside the new two-column layout: the textarea takes col 1-8 (left), and the right column shows a "MACHINE EDIT" eyebrow + a small "SWITCH TO STRUCTURED VIEW" disabled-pill (future-work signpost so users understand why this looks different).

## Components and files

**New components** (`app/routes/admin/-components/`):

- `AdminShell.tsx` — top bar + side nav + layout wrapper. Props: `{ route: 'index' | 'detail', world?: WorldSummary, sel?: Selected, onPaletteOpen: () => void, onResetLive?: () => void, onPublish?: () => void }`.
- `TopBar.tsx` — inner component used by AdminShell. Pure presentation; receives all dynamic content via props.
- `SideNav.tsx` — inner component used by AdminShell (detail route only). Hardcoded category list; emits a `category` selection via callback. v2 doesn't change the master-pane's data model yet — only Locations category is wired; the others render but are disabled.
- `HeroWorldCard.tsx` — single world card for the Live grid. Props: world summary + stats + onClick handler.
- `InscribeCard.tsx` — the new-draft form, extracted so the index page stays readable.
- `WorldStats.tsx` — the 3-cell stats strip used inside HeroWorldCard.
- `EntityHeader.tsx` — the eyebrow + headline-lg + UUID/Last-Modified block on the detail pane.
- `TagsPanel.tsx` — chip row + inline add for Location tags.
- `KeyVisualPanel.tsx` — image or placeholder, with the optional URL input (only used on World Settings entity in v2).
- `MetadataColumn.tsx` — wrapper that composes KeyVisual + Tags + future panels.
- `FootnoteBar.tsx` — word/char/problem-count row at the bottom of the detail pane.
- `WorldHierarchyTree.tsx` — extracted v1 inline tree, now with collapsible sub-groups (Exits/Agents/Items/Triggers under each location) and an inline filter input at the bottom.

**Modified:**

- `app/routes/admin/index.tsx` — wraps everything in `<AdminShell route="index">`. Replaces inline ledger with `InscribeCard` + restyled drafts table + a live-worlds `<div className="hero-grid">` of `HeroWorldCard`. Adds Scholar's Directive footer.
- `app/routes/admin/$worldId.tsx` — wraps in `<AdminShell route="detail" world={...} ...>`. Replaces inline tree with `WorldHierarchyTree`. Replaces v1's three-pane shell with: side-nav (in shell) + master pane + detail pane. The Problems rail becomes a drawer triggered from the top-bar (see below).
- `app/routes/admin/-components/ProblemsRail.tsx` — gains an `open: boolean` prop and absolute positioning (slides in from the right). Or we can convert it to a popover; either way it's no longer permanently visible.
- `app/routes/admin/-components/ManuscriptCard.tsx` — restyled: bordered surface-container-lowest, taller min-height, hover toolbar icons (no-op for v2). Gutter notes move out — word count goes to FootnoteBar; the card itself loses the side gutter.
- `app/routes/admin/-components/CommandPalette.tsx` — unchanged.
- `app/routes/admin/-components/Breadcrumbs.tsx` — output format updated to match the mockup: prepend "Aethelgard / World Editor / " before the rest. Same parsing function, just an extra prefix.
- `app/routes/admin/admin.css` — substantial additions: shell, top-bar, side-nav, hero-card, inscribe-card, entity-header, tag-chip, key-visual, footnote-bar, tree-subgroup. Tokens unchanged. The v1 `.detail-shell` grid is replaced by the new shell + master/detail layout.

**Backend:**

- `drizzle/0008_admin_v2.sql` — migration.
- `drizzle/meta/0008_snapshot.json` — generated by `drizzle-kit`.
- `src/infra/schema.ts` — add columns to `worlds` and `locations`.
- `src/core/domain/builder-types.ts` — add fields to `WorldSummary`, `Location`, `UpsertLocationInput`; add `WorldSummaryWithStats`.
- `src/core/builder/repo.ts` (or wherever `listWorlds` lives) — compute counts; serialize tags.
- `app/server/admin/worlds.ts` — return `WorldSummaryWithStats[]` from `listWorlds`; expose a new `updateWorldCover({ worldId, coverImageUrl })` server function.
- `app/server/admin/entities.ts` — Location upsert serializes/deserializes `tags`.

## Data flow

Three new mutations:

1. **`updateWorldCover`** — single-field update on `worlds`. New server function. Wired to the URL input on the World Settings detail's KeyVisualPanel.
2. **Location `tags` flows through the existing `saveEntity`** mutation. No new endpoint. `TagsPanel` calls into the form's `onChange`, the form sends the full payload (now with `tags`) through `saveEntity`.
3. **World stats** are read-only and derived; no mutation.

No publish-pipeline changes. Tags and cover image flow draft → live like all other fields. Cover image specifically: a draft world's cover propagates to its live sibling on publish. (If we want to keep them divergent, that's a separate decision — for v2 they propagate.)

## Error handling

Unchanged philosophy from v1. New paths:

- Cover image URL is not validated as a URL on the server (treat as opaque text). UI shows a broken-image placeholder if the browser fails to load it.
- Tag input rejects empty strings and duplicates (client-side); the server accepts the array as-is.

## Testing

- **Unit:** `WorldHierarchyTree` tree-flattening logic (pure function) — sub-group counts, expanded-state computation. Vitest, one file.
- **Unit:** `parseTags` / `serializeTags` round-trip at the Drizzle boundary. Vitest.
- **Migration:** the existing migration test infra (if any) runs `0008`. No new infra.
- **Visual:** manual eyeball check per Task list, same shape as v1.

No new integration tests — the routes still call the same server functions, augmented but not behaviorally changed.

## Open assumptions (auto-mode)

- Side-nav categories other than LOCATIONS are visible but disabled with a tooltip explaining "future work". This signals the IA without lying about features that don't exist.
- The "history" and "auto_stories" icons in the mockup top bar map to: history → no-op (deferred), auto_stories → opens the command palette. We keep one of them functional and hide the other.
- The Stitch mockup has a draft-version chip ("DRAFT VERSION") in the top bar. We render this only when on the detail route AND the world is a draft. On the index route it's hidden — there's no single "current world" there.
- World stats labels read "LOCATIONS / AGENTS / ITEMS" — not the mockup's "NODES / ENTITIES / SCRIBES". Names that match our data model are clearer than evocative names that mislead.

## Done criteria

- Migration `0008` runs cleanly forward.
- Schema additions are reflected in `Location`, `WorldSummary`, and `WorldSummaryWithStats` types; typecheck passes.
- `/admin` shows: top-bar shell, Workspace card, Inscribe card, drafts ledger with row hover, live-worlds hero grid (with placeholder when no cover), Scholar's Directive footer.
- `/admin/$worldId` shows: top-bar shell, left side-nav with LOCATIONS active, master pane with collapsible sub-groups under each Location, detail pane with two-column form, Tags panel on locations, KeyVisual panel on the world-settings entity (with a working URL input), Footnote bar at the bottom.
- Cover image URL on a draft world saves and renders.
- Adding/removing tags on a location saves and renders.
- World stats appear on each hero card and match a direct database count.
- Problems drawer opens from the top bar and shows the same problems v1's rail showed.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.
