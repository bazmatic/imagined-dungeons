# Campaign Builder — Design

Status: draft, awaiting user review.

## Goal

Give an admin a UI to create, edit, and extend worlds and all their components (locations, exits, items, agents) without hand-editing markdown or regenerating seed modules. Authored content lives in the same SQLite database the engine plays from, separated from live play state by a discriminator on `worlds`.

## Scope

In scope for v1:

- CRUD over worlds and their child entities (locations, exits, items, agents).
- A "draft" vs. "live" distinction: drafts are authored freely (and may be invalid mid-edit); live worlds are what the engine plays.
- Publish (draft → live) with structural three-way merge that preserves player-driven runtime state.
- Reset-live-to-draft as a destructive escape hatch for early iteration.
- Validation surfaced inline; publish is the integrity gate.
- A programmatic API surface so the same builder operations can be driven by an external client — specifically an AI agent over MCP.

Out of scope (deferred):

- Map / graph visualisation of locations and exits.
- Authentication or multi-user editing.
- Per-change publish selection ("apply this change but not that one").
- Undo history, branching drafts, version history.
- Editing runtime fields (`awake`, `mood`, `shortTermIntent`, events log).
- Markdown round-trip with `burning-district-data.md`. The existing `pnpm seed:gen` path is unchanged and still bootstraps a first draft for new installs; the builder does not write back to markdown.

## Decisions (from brainstorming)

1. **Both authoring and live tweaking.** Edit a draft, then publish to a live world; live worlds can also be edited via republish.
2. **Same tables, discriminator column.** Drafts and live worlds share `worlds`/`locations`/`exits`/`items`/`agents`. A `kind` column on `worlds` distinguishes them.
3. **Push-live merges structurally; preserves runtime state.** Default publish is a structural diff/merge against a stored snapshot of the last publish — authored changes apply, gameplay drift is preserved, conflicts are reported as "skipped." A "reset live to draft" button performs a full replace.
4. **Tree + form panel UI.** Hierarchical left nav (World → Locations → items/exits/agents at location), form panel on the right. No map view in v1.
5. **No auth.** `/admin` is open in v1, matching the existing player UI.
6. **Drafts may be invalid; publish is the gate.** Mid-edit broken references are allowed and surfaced inline; the publish step refuses to proceed until the draft validates clean.

## Architecture

The builder is a single pure core (`src/core/builder/`) exposed through three sibling adapters: the existing TanStack Start UI (server functions + admin routes), an HTTP API under `/api/admin/`, and a separate MCP server under `src/mcp/`. All three call the same builder-module functions; none contains business logic.

```
/                    — player UI (existing, unchanged)
/admin               — campaign list (drafts paired with their published live worlds)
/admin/$worldId      — tree + form editor for one world
/api/admin/...       — HTTP API mirroring the builder module
src/mcp/             — MCP server exposing the builder module as tools
```

Layering follows the existing hexagonal pattern. The builder module depends only on the `Repository` port; the three adapters are the composition seam.

## Schema changes

### `worlds` (modified)

Add columns:

- `kind`: `'draft' | 'live'` — discriminates authored vs. play worlds. Existing rows migrate to `'live'`.
- `parentDraftId`: nullable text — on live worlds, points at the draft they were published from. Null for drafts and for the seeded burning-district live world (which has no draft yet; a "clone live as draft" action creates one on demand).
- `displayName`: text — moves the campaign's display name into the database so the builder can edit it. Falls back to `label` if empty.
- `playerAgentId`: nullable text — which agent is the player. Drafts may leave this null while the player agent doesn't exist yet; publish requires it to be set and to resolve.

Discriminator values live in `src/core/domain/kinds.ts` per the project's no-string-literals rule.

### `world_snapshots` (new)

```
world_snapshots(
  worldId text primary key references worlds.id,
  snapshotJson text not null,         -- CampaignSeedData shape
  takenAt integer not null            -- timestamp_ms
)
```

One row per live world. Holds the structural state of the world *as published*. Used as the base in the three-way merge on the next publish. Overwritten on every successful publish.

### Child tables (locations / exits / items / agents)

Unchanged. They reach `kind` through their `worldId`.

## Components

### `src/core/builder/` (pure)

Module facade exposing:

- `createDraft(input): Result<WorldId, BuilderError>` — new empty draft.
- `cloneLiveAsDraft(liveWorldId): Result<WorldId, BuilderError>` — copies a live world's structural rows into a fresh draft and sets `parentDraftId` on the live world.
- `upsertLocation / upsertExit / upsertItem / upsertAgent(worldId, input): Result<EntityId, BuilderError>`.
- `deleteLocation / deleteExit / deleteItem / deleteAgent(worldId, id): Result<void, BuilderError>`.
- `validateWorld(worldId): Problem[]` — pure structural check (see Validation).
- `publish(draftId): Result<PublishResult, BuilderError>` — see Publish flow.
- `resetLiveToDraft(draftId): Result<void, BuilderError>` — full replace.

The module is repository-facing only; no DB drivers, no React, no TanStack imports.

### `src/core/builder/diff.ts`

Three-way diff over `(snapshot, draft, live)`:

```
MergePlan {
  inserts: Row[]
  updates: Row[]
  deletes: EntityRef[]
  skipped: SkipReport[]   -- rows where live diverged from snapshot
}
```

Diff rules per entity id:

- in draft, not in snapshot, not in live → insert.
- in draft and in snapshot, not in live → re-insert (skip with warning if the live row was deleted by gameplay; runtime currently has no delete path, so this is theoretical for v1).
- in draft, in snapshot, in live → compare draft fields to snapshot fields:
  - if draft equals snapshot → no change (authored nothing).
  - if draft differs from snapshot and live equals snapshot → update live (clean authored change).
  - if draft differs from snapshot and live differs from snapshot → conflict; skip and report (gameplay drift would be clobbered).
- not in draft, in snapshot, in live → delete from live, but only if live equals snapshot (untouched). Otherwise skip and report.

Only structural fields participate. Runtime-only fields on agents (`hp`, `mood`, `shortTermIntent`, `awake`) are excluded from both the comparison and the update — publish never touches them on existing live agents. New agents created by publish initialise runtime fields to seed defaults.

### `src/core/builder/validate.ts`

Pure validator returning `Problem[]`. Codes (string-literal-free, defined as `as const` in `kinds.ts`):

- `ExitFromMissing`, `ExitToMissing`, `ExitLockedByItemMissing`
- `ItemOwnerMissing`, `ItemOwnerKindMismatch`
- `AgentLocationMissing`
- `PlayerAgentNotSet` (field is null on a draft about to publish), `PlayerAgentMissing` (field references an agent id that doesn't exist)
- `DuplicateId`

Each `Problem` carries the offending entity kind, id, and a message; the UI uses the kind+id to attach the problem to the right tree node.

### `app/server/admin/`

One file per concern, each exporting TanStack server functions that wrap the builder module:

- `worlds.ts` — `listWorlds`, `createDraft`, `cloneLiveAsDraft`, `getWorld`.
- `entities.ts` — `saveEntity`, `deleteEntity` (dispatched on entity kind).
- `validate.ts` — `validateWorld`.
- `publish.ts` — `publish`, `resetLiveToDraft`.

Server functions return the project's existing `Result` type. They are thin wrappers — each one validates input, opens a DB connection, calls the corresponding builder-module function, and returns the result. No business logic lives at this layer.

### HTTP API (`app/routes/api/admin/`)

The same builder operations are exposed as HTTP endpoints under `/api/admin/`. These are also thin wrappers over the builder module — they share the same validation and the same `Result`-shaped responses (serialised as JSON, with HTTP status codes derived from `Result.ok` and the typed error). The UI's server functions and the HTTP API are sibling adapters over one core; neither calls the other, and neither contains business logic.

Endpoints (all JSON, all validate input with a shared schema):

- `GET    /api/admin/worlds` — list drafts and live worlds.
- `POST   /api/admin/worlds` — create draft.
- `POST   /api/admin/worlds/:id/clone` — clone live as draft.
- `GET    /api/admin/worlds/:id` — full world tree (locations, exits, items, agents).
- `GET    /api/admin/worlds/:id/validate` — `Problem[]`.
- `POST   /api/admin/worlds/:id/publish` — publish draft. Returns `PublishResult`.
- `POST   /api/admin/worlds/:id/reset-live` — reset live world to its draft.
- `PUT    /api/admin/worlds/:id/locations/:locId` — upsert location. Same shape for `exits`, `items`, `agents`.
- `DELETE /api/admin/worlds/:id/locations/:locId` — delete location. Same shape for the other entity kinds.

Input/output schemas are derived from the builder module's TypeScript types via a single source of truth (Zod or hand-written runtime schemas matching the existing project style — to be decided during implementation; the existing OpenAI structured-output pattern in `src/core/engine/llm-output.ts` is the reference). Schema definitions are reused by the MCP server so its tool schemas and the HTTP endpoints stay in lockstep.

Authentication is out of scope per Q5 — the API is open in v1, matching the rest of the app. A single env-var token check is one middleware away when needed.

### `app/routes/admin/`

- `index.tsx` — list of (draft, live) pairs and orphan worlds; "New draft" and "Clone live as draft" actions.
- `$worldId.tsx` — two-pane layout: left tree (World → Locations → per-location items/exits/agents), right form panel keyed off the selected node.

Form components dispatched via a const lookup keyed by entity kind, not a string-literal switch. Validation problems annotate the tree (red dot on each problem-bearing node) and surface as inline messages on the form.

### MCP server (`src/mcp/`)

A standalone MCP server that exposes the builder operations as tools, suitable for connecting an AI agent that designs or extends worlds.

- Implemented with the official MCP TypeScript SDK.
- Each tool is a thin wrapper over the corresponding builder-module function — the MCP server runs in-process against the same `Repository` interface, so it does not call the HTTP API; it shares the core directly. (The HTTP API exists for non-MCP clients and for the UI's server-function path.)
- Tool surface mirrors most of the HTTP endpoints: `list_worlds`, `create_draft`, `clone_live_as_draft`, `get_world`, `validate_world`, `publish_world`, `upsert_location`, `upsert_exit`, `upsert_item`, `upsert_agent`, `delete_location`, `delete_exit`, `delete_item`, `delete_agent`. **`reset_live_to_draft` is intentionally not exposed via MCP** — it is the one operation that wipes gameplay state, and it stays behind the confirmation modal in the UI (and the HTTP API for scripted use, where the caller is presumed authorised).
- Tool input schemas are the same schemas used to validate HTTP request bodies — one definition per operation, used by both surfaces. Tool outputs return the same `Result`-shaped JSON.
- The MCP server is launched as a separate entry point (e.g. `pnpm mcp`) wired to stdio transport. It does not boot the TanStack server; it opens its own DB connection via the existing `db.ts` factory.
- For AI-driven authoring, the validator's `Problem[]` output is the feedback loop: an AI client edits, calls `validate_world`, reads the structured problem list, and iterates. `publish_world`'s `skipped` report is similarly machine-readable.

## Data flow

### Edit

1. User clicks a tree node.
2. UI calls `getWorld` (cached) and renders the relevant entity in the form panel.
3. User edits and saves.
4. Server function calls `upsertEntity`, which writes the row and runs `validateWorld`.
5. Server returns `(updatedRow, problems)`. Tree re-renders.

### Publish (draft → live)

1. Server reads draft, snapshot (if any), and live (if any) from DB.
2. Runs `validateWorld(draft)`. If problems, abort and return them.
3. If no live exists for this draft → straight clone: insert all draft rows as a new live world, set `parentDraftId`, write snapshot = draft. Return `PublishResult` with no skipped changes.
4. Otherwise → compute `MergePlan` from `(snapshot, draft, live)`.
5. Inside one SQLite transaction: apply inserts, updates, deletes; overwrite the snapshot row with the new draft state; commit.
6. Return `PublishResult { applied, skipped }`. UI shows the skipped-change report.

Optimistic concurrency: the server records the snapshot's `takenAt` when it computes the plan and refuses to apply if the snapshot row's `takenAt` has changed in the interim.

### Reset live to draft

1. Confirmation modal naming the live world being overwritten.
2. Server validates draft (same gate as publish).
3. Inside one transaction: delete child rows for the live world, insert draft rows under the live world id, refresh snapshot. Player agent id and `kind = 'live'` are preserved; everything else is replaced.

### Play (unchanged)

`app/server/world.ts` selects a live `worldId` for the player route. Today this is hardcoded to the burning-district id; the builder's existence does not change that. A future slice can add a "default live world" pointer; for v1, the seeded default stands.

## Error handling

- Server functions return `Result`. No exceptions cross the server/UI seam.
- Validation problems are data, not errors.
- Publish and reset run in single transactions; partial application is impossible.
- Concurrency conflict on publish (snapshot `takenAt` mismatch) returns a typed error; UI prompts the admin to refresh and re-publish.

## Integrity invariants

The builder facade — not the underlying repository — is the API exposed to all three adapters (UI, HTTP, MCP). The facade enforces:

1. **Live worlds are read-only from outside the publish flow.** Every direct structural write (`upsertLocation`, `upsertExit`, `upsertItem`, `upsertAgent`, `delete*`) refuses with `WorldKindMismatch` if the target world's `kind` is `live`. The only paths that mutate a live world are `publish` (which runs validation + three-way merge) and `resetLiveToDraft` (which is destructive by design and is *not* exposed via MCP).
2. **Runtime fields on existing agents are never overwritten by authoring.** The SQLite `upsertAgent` implementation's update set omits `hp`, `mood`, `shortTermIntent`, and `awake`. These are gameplay state; an AI driving the builder cannot reach in and set a player's HP, clear an NPC's intent, or change wake state. New agents created by `publish` initialise these to seed defaults; the columns are then off-limits.
3. **Validation gates publish.** Any structural problem (`Problem[]` non-empty) aborts publish with `ValidationFailed` carrying the full problem list. Live worlds therefore can never reach an invalid state via the builder.
4. **Three-way merge preserves gameplay drift.** Even on a valid draft, publish skips any row where the live world has diverged from the snapshot. Authored changes never silently overwrite changes the engine made during play.
5. **`resetLiveToDraft` is the explicit escape hatch.** It bypasses #4 (but not #3). It is exposed via the UI (confirmation modal) and the HTTP API. **It is not exposed as an MCP tool** — an AI client should not be able to wipe gameplay state with a single tool call. If an AI workflow needs to reset, the human admin runs it.

These invariants make the MCP surface safe to point at an AI: drafts are sandboxed work-in-progress; live worlds can only be reached through the validate-and-merge gate; gameplay state is structurally unreachable.

## Testing

- `core/builder` unit-tested against `MemoryRepository` (already exists). All business logic is tested here.
- `validate.ts` table-driven, one case per problem code.
- `diff.ts` table-driven over the three-way input space: insert-only-in-draft, delete-untouched, delete-with-drift, update-clean, update-with-drift, no-op, runtime-field-changes-ignored.
- One integration test per server function (DB-backed).
- One integration test per HTTP endpoint covering happy-path and one validation-failure case.
- One smoke test that boots the MCP server in-process and exercises one tool end-to-end. Per-tool exhaustion is covered by the core tests; the MCP smoke test only verifies wiring.
- Manual UI verification for the editor; the project does not currently run UI tests, so adding a UI test harness is out of scope for this slice.

## Migration

- Drizzle migration adds `kind`, `parentDraftId`, `displayName`, `playerAgentId` to `worlds` and creates `world_snapshots`.
- Existing rows: `kind = 'live'`, `parentDraftId = null`, `displayName = label`, `playerAgentId = ` the existing campaign's player id (set by a one-shot data migration that reads from the seeded campaign module).
- No existing live world has a snapshot row; the first publish from a draft cloned off it will create one. Until then, "push live" against the seeded burning-district world is unavailable; "reset live to draft" is also unavailable. The admin can use "Clone live as draft" to bootstrap an editable draft of it.
