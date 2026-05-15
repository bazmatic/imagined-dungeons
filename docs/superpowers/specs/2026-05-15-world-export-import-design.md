# World Export / Import Design

**Date:** 2026-05-15  
**Status:** Approved

## Use Cases

1. **Share worlds between users/instances** — download a `.json` file from one server, upload it to another, get a fresh draft world from it.
2. **Backup & restore** — export before risky edits; re-import to roll back.

## Approach

Piggyback on the existing snapshot infrastructure. The snapshot mechanism (`saveStartingState` / `loadStartingState`) already serializes the full entity tree to/from a `SnapshotBlob`. Export adds a thin metadata envelope around that blob; import writes the blob into the snapshot slot and restores entities using the existing `wipeWorldEntities` + `copyBlobIntoWorld` pipeline.

No changes to the `SnapshotBlob` format or the `worldSnapshots` table schema.

## Constants

All values used in comparisons, switch cases, or dispatch must be derived from `as const` objects — no raw string literals in logic.

```ts
export const WorldExportFormat = {
  Format: 'imagined-dungeons-world-export',
  Version: 1,
} as const;

export const ImportMode = {
  Create: 'create',
  Overwrite: 'overwrite',
} as const;
export type ImportMode = (typeof ImportMode)[keyof typeof ImportMode];
```

Client-side validation uses `WorldExportFormat.Format` and `WorldExportFormat.Version`; the orchestrator uses `ImportMode.Create` / `ImportMode.Overwrite`.

## Export File Format

```ts
interface WorldExportBundle {
  version: typeof WorldExportFormat.Version;
  format: typeof WorldExportFormat.Format;
  exportedAt: string;          // ISO8601
  worldMeta: {
    displayName: string;
    label: string;
    rngSeed: string | null;
    coverImageUrl: string | null;  // URL kept as-is; may not resolve on another server
  };
  draft: SnapshotBlob;
  live: SnapshotBlob | null;   // null = draft-only export
}
```

`SnapshotBlob` is the existing type: `{ locations, exits, items, agents, templates, triggers, worldLore, tagLore }`.

Files are named `{label}-export.json`.

The user chooses at export time whether to include the live world.

## Core Logic (`src/core/builder/`)

### `buildExportBundle(repo, draftWorldId, { includeLive })`

- Reads world summary for metadata.
- Calls `getWorldTree(repo, draftWorldId)` and serializes to `SnapshotBlob` (no DB write — pure read).
- If `includeLive`: resolves the live sibling and calls `getWorldTree` on it too.
- Returns `WorldExportBundle`.

### `importWorldData(repo, worldId, blob: SnapshotBlob)`

- Inside a transaction: `wipeWorldEntities(worldId)` → `copyBlobIntoWorld(blob, worldId)`.
- Also writes the blob to the snapshot table for that world so "Reset to Starting State" reflects the imported state.

### `importWorld(repo, bundle, { mode, targetDraftId? })` — orchestrator

- `ImportMode.Create`: calls `createWorld({ displayName, label })` (appends numeric suffix if label is taken, e.g. `midvale-2`), then `importWorldData` for draft and, if `bundle.live` is present, for the live sibling.
- `ImportMode.Overwrite`: calls `importWorldData` for the target draft. If `bundle.live` is present, imports live too. **World metadata (`displayName`, `label`, `rngSeed`, `coverImageUrl`) is not overwritten** — the user keeps their existing metadata.

## Server Functions (`app/server/admin/worlds.ts`)

Two new server functions wrapping the core logic:

- `exportWorld({ worldId, includeLive })` — returns `WorldExportBundle`.
- `importWorld({ bundle, mode: ImportMode, targetDraftId? })` — returns `{ worldId }` of the created/updated draft.

## UI (`app/routes/admin/`)

### Export

- An **Export** button on each world card in the admin index, alongside existing action buttons.
- Clicking opens a dialog with two radio options: **Draft only** / **Draft + Live**.
- On confirm: calls `exportWorld`, receives the bundle, triggers a client-side file download via `Blob` + `<a download>`.

### Import

- An **Import World** button in the admin index header, next to "Create world".
- Opens a modal with two steps:
  1. File picker (`.json` only). On file selected, parse and validate the bundle client-side (check `format` and `version`); show the world name from `worldMeta.displayName`.
  2. Mode choice: **Create new world** (default) or **Replace existing world** (dropdown of existing draft worlds).
- On submit: calls `importWorld`.
- On success: navigate to the imported/updated world's editor page (`/admin/$worldId`).

No new routes needed.

## Error Handling & Validation

### Export

- Draft-only export on a fresh empty world succeeds (blob has empty arrays).
- `includeLive` requested but no live sibling exists → return error to client.

### Import — client-side

- Validate `format === WorldExportFormat.Format` and `version === WorldExportFormat.Version`; show a clear error otherwise.
- No deep entity validation client-side.

### Import — server-side

- `ImportMode.Overwrite` with a missing or non-draft `targetDraftId` → return error.
- `ImportMode.Create` with a conflicting label → append numeric suffix rather than fail.
- Entire import runs in a transaction; any failure rolls back completely.
- Unknown/extra fields in the blob are ignored via `parseSnapshot`'s existing `?? []` defaults.

## Testing

Integration tests using `BuilderMemoryRepository`, following the existing pattern:

- **`buildExportBundle`**: draft-only export excludes `live`; draft+live includes both; world metadata populated correctly.
- **`importWorldData`**: wipe+repopulate works; snapshot table updated to match imported blob.
- **`importWorld`**:
  - `ImportMode.Create` produces a new world with correct entities; label conflict appends suffix.
  - `ImportMode.Overwrite` replaces entities; world metadata unchanged; live imported if present; partial failure rolls back.

No UI tests for the file download/upload plumbing.
