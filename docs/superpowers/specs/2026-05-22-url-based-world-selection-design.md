# URL-Based World Selection — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

## Problem

The active world is currently hardcoded as a `CAMPAIGN` constant in `app/server/world.ts`. Switching worlds requires a source code change. The goal is to make any live world playable by visiting `/play/<worldId>`.

## Routes

| Route | Purpose |
|---|---|
| `GET /` | World picker — lists all live worlds, links to `/play/<worldId>` |
| `GET /play/$worldId` | Game page — loader resolves world context and runs initial `look` |
| `POST /api/stream-command` | Unchanged URL; body gains `worldId` alongside `text` |

Admin routes (`/admin/$worldId`) and `__root.tsx` are untouched.

## `world.ts` Refactor

Remove runtime coupling to any campaign module. The module becomes a provider of shared singletons and a per-world context resolver.

**Stays (shared singletons, unchanged):**
- `getDb()` — database connection
- `getParse()` — composite parser
- `getNarratorLlm()` — OpenAI LLM instance (nullable)

**Removed:**
- `PLAYER_ID` constant
- `DISPLAY_NAME` constant
- `getRepo()` (no-arg version)
- Import of any campaign module

**Added:**
```ts
async function getWorldContext(worldId: WorldId): Promise<{
  repo: SqliteRepository;
  playerId: AgentId;
  displayName: string;
}>
```

Reads the live world record from the DB. Throws a descriptive error if the worldId does not exist or its `playerAgentId` is null.

**Campaign files** (`src/campaigns/*.ts`) are retained for seeder use only. They are no longer imported at runtime.

**Data fix required:** The Kitty Drama live world (`w_mvavu5oc`) currently has `playerAgentId: null`. This must be set to `cat_character` before or as part of this work.

## World Picker (`/`)

- Route loader calls a server function that queries the DB for all live worlds
- Returns `{ id, displayName, locationCount, agentCount }` per world
- Page renders a flat list of links styled with the existing dark/monospace theme
- Clicking a world navigates to `/play/<worldId>`
- No auth, search, or pagination

## Play Page (`/play/$worldId`)

**Loader:**
1. Calls `getInitialView(worldId)` (server fn)
2. `getInitialView` calls `getWorldContext(worldId)` → `{ repo, playerId, displayName }`
3. Runs `look` turn, builds surroundings and inventory
4. Returns `{ render, displayName, inventory, surroundings }` — same shape as today

**Component:**
- Receives `worldId` from route params
- Sends `{ text, worldId }` in every POST to `/api/stream-command`
- Otherwise identical to the current game page

**`stream-command` handler:**
- Reads `{ text, worldId }` from request body
- Calls `getWorldContext(worldId)` → `{ repo, playerId }`
- Runs tick with resolved `playerId` and `repo`
- No other changes to tick engine, parser, or surroundings builder

## Error Handling

- `getWorldContext` throws if worldId is not found or has no playerAgentId — the loader surfaces this as a standard TanStack error boundary
- No special handling needed in the game component

## Out of Scope

- Authentication / access control
- Saving per-world player progress separately (player state is already world-scoped in the DB)
- Removing or deprecating the campaign seeding system
