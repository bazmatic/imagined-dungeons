# World Expansion via Consequence Engine

**Date:** 2026-05-14
**Status:** Approved

## Summary

Two related features that together allow the world to grow automatically during play:

1. **Consequence engine creation/deletion tools** — the consequence engine can create and delete locations, exits, agents, and items as durable consequences of events.
2. **Undefined exits** — exits in the admin can have no destination; when traversed, a stub location is created immediately and the consequence engine enriches it on the player's first action there.

All world expansion is ephemeral: it writes to the live world only and is lost when the GM resets from draft.

---

## Feature 1: Consequence Engine World Expansion

### New Action Kinds

Five new action kinds join `update_description` and `reveal_item` in `CONSEQUENCE_SCHEMA` and `RawConsequence`:

```ts
create_location: {
  kind: 'create_location';
  id: string;              // snake_case, e.g. "loc_hidden_cellar"
  label: string;
  shortDescription: string;
  longDescription: string;
  secretDescription: string;
  tags: string[];
}

create_exit: {
  kind: 'create_exit';
  id: string;
  from: string;            // locationId — existing or minted in this batch
  to: string | null;       // locationId or null (undefined portal)
  direction: string;       // 'north'|'south'|'east'|'west'|'up'|'down'
  label: string;
  locked: boolean;
}

create_agent: {
  kind: 'create_agent';
  templateKey: string;   // references an existing MonsterTemplate.templateKey
  locationId: string;    // existing or minted in this batch
  count?: number;        // defaults to 1; spawns that many instances
}

create_item: {
  kind: 'create_item';
  id: string;
  label: string;
  shortDescription: string;
  longDescription: string;
  ownerKind: 'location' | 'agent';
  ownerId: string;
  weight: number;
  hidden: boolean;
  tags: string[];
  container: boolean;
}

delete_entity: {
  kind: 'delete_entity';
  targetKind: 'location' | 'exit' | 'agent' | 'item';
  entityId: string;
}
```

### ID Convention

The LLM supplies IDs for new entities using short snake_case strings prefixed by type: `loc_`, `agent_`, `item_`, `exit_`. These IDs can be referenced by later actions in the same batch (e.g. a `create_exit` can set `from` or `to` to an ID minted by a `create_location` in the same response). The engine coerces them via the existing `asLocationId()`, `asAgentId()` etc. functions. No central registry check — collision risk is low for gameplay contexts; duplicate upserts are idempotent.

### Processing Order

Within a single consequence pass, actions are applied in this fixed order to avoid forward-reference problems:

1. `create_location`, `create_agent`, `create_item` (no cross-dependencies)
2. `create_exit` (may reference locations from step 1)
3. `update_description`, `reveal_item`
4. `delete_entity` (last, so updates can reference entities before deletion)

### Budget

Total actions per pass capped at **5** (up from current 3 for descriptions only). Maximum **3** of those may be create/delete actions. The system prompt enforces this in prose; the JSON schema enforces it via `maxItems`.

### create_agent Processing

`create_agent` reuses the existing spawn infrastructure (`expandSpawn` from `src/core/spawning/expand.ts`) rather than building agents from scratch. The engine:

1. Looks up the `MonsterTemplate` by `templateKey` in the live world.
2. Calls `expandSpawn(template, locationId, builderRepo, liveWorldId)` once per `count` (default 1).
3. If the template is not found, drops the action with `console.warn`.

This keeps stat definitions in monster templates where GMs already maintain them, and avoids duplicating hp/damage/defense/etc. in the consequence schema.

### Builder Repository Access

The consequence engine already receives `builderRepo` via `ConsequenceLoreSink`. This interface is extended to carry `liveWorldId: WorldId` so creation/deletion calls can target the live world. No new parameters on `consequencesFor()`.

All upserts call the live world directly: `builderRepo.upsertLocation(liveWorldId, ...)` etc. The builder use-cases' existing validations (item ownership cycles etc.) still apply.

### System Prompt Addition

A new `WORLD_EXPANSION` section is appended to the existing system prompt:

> **Creating and deleting entities:** You may create new entities when events durably alter the world — a secret passage is discovered, a merchant arrives and sets up shop, a wall is blasted open. Do NOT create entities for transient events (a candle flickering, a guard walking past). Created entities persist for the rest of the session and should be treated as permanent fixtures.
>
> You may delete entities when they are permanently removed — a building collapses, an NPC dies with no chance of return, a door is sealed forever.
>
> **IDs:** Invent a short snake_case id prefixed by kind (`loc_`, `agent_`, `item_`, `exit_`). Use that same id if you reference the new entity in later actions in the same batch.
>
> **Spawning agents:** Use `create_agent` with an existing `templateKey` from the world's monster templates. Do not invent stats. If no template fits the scene, prefer description colour over spawning something.
>
> **Enriching sparse locations:** When a location has empty or minimal descriptions (a newly generated stub), treat any player action there as a signal to generate full content: proper label, descriptions, atmosphere, and any items or agents that belong there. You may plant exits with `to: null` to suggest depth beyond the current scene.
>
> **Limits:** No more than 3 create/delete actions per pass. When in doubt, don't create — a good description update is often better than a new entity.

### Error Handling

| Condition | Response |
|-----------|----------|
| `create_exit` referencing an ID not in the live world and not created in this batch | Drop silently |
| `delete_entity` targeting the player's current location | Drop silently |
| `delete_entity` referencing an entity not found | Drop (idempotent) |
| Any create action with missing required fields | Drop with `console.warn` |
| Malformed action kind | Drop (existing behaviour) |

---

## Feature 2: Undefined Exits

### Schema Changes

`exits.to_location_id` becomes nullable. This requires:

- New Drizzle migration: `ALTER TABLE exits ADD COLUMN` → actually an ALTER to make existing column nullable. Since SQLite does not support `ALTER COLUMN`, this requires a table recreation migration.
- `Exit.to` in `src/core/domain/entities.ts`: `LocationId` → `LocationId | null`
- `UpsertExitInput.to` in `src/core/domain/builder-types.ts`: `LocationId` → `LocationId | null`
- `ExitInput` in MCP tools and all call sites updated accordingly
- Read-side `toExit()` mappers updated to handle null

### Admin UI

`ExitsEditor` gains an "(auto-generate)" option in the destination location selector. When selected, `to` is submitted as `null`. The exit card displays the destination as *"(auto-generate)"* in the UI.

### Stub Creation on Traversal

The move action (`src/core/engine/actions/move.ts`) gains a branch executed when `exit.to === null` **and the moving agent is the player**. NPC movement through undefined exits is blocked (treated as a locked exit) until a destination exists.

1. **Mint stub location** on the live world via builder repo:
   - `id`: `loc_stub_<random8>` (e.g. `loc_stub_a3f9bc21`)
   - `label`: derived from exit label, e.g. *"Beyond the north gate"* or *"The [direction] passage"* if no label
   - `shortDescription`: places the player in the exit itself — e.g. *"You stand in the archway, on the threshold of somewhere not yet formed."*
   - `longDescription`: `''` (empty — will be enriched by consequence engine)
   - `secretDescription`: `''`
   - `tags`: `[]`

2. **Update exit.to** to the new stub ID via builder repo.

3. **Create reciprocal exit** from stub back to origin:
   - Direction: reverse of traversed direction (north↔south, east↔west, up↔down)
   - Label: exit label or `''`
   - `locked: false`

4. **Move the agent** to the stub location normally (existing move logic).

If the builder repo call fails at any step, the move fails with a parse-style error and the player stays put.

### Enrichment by Consequence Engine

No special handling required in the consequence engine. When the player performs their first action in the stub, events occur in that location. The consequence engine receives the stub's sparse descriptions and — guided by the `WORLD_EXPANSION` system prompt addition — generates full content via `update_description` and potentially `create_item`, `create_agent`, `create_exit` (with or without destinations) actions.

The stub's deliberately sparse `longDescription` is a strong LLM signal to generate content rather than preserve what's there.

### Recursive Expansion

The consequence engine may plant further undefined exits (`to: null`) when enriching a stub. This enables infinite recursive world expansion driven by player exploration. No depth limit is enforced in v1.

---

## Out of Scope

- Syncing generated entities back to the draft world (ephemeral by design)
- Deleting undefined exits via consequence engine (delete_entity handles this)
- Generating locations for undefined exits traversed by NPCs (only player-triggered for now)
- Item `ownerKind: 'item'` (container ownership) in consequence-created items — only location/agent ownership supported in v1
- Cycle detection for consequence-created exits (the world graph may become non-planar; this is acceptable)

---

## Files Affected

| File | Change |
|------|--------|
| `drizzle/0015_undefined_exits.sql` | Migration: recreate exits table with nullable to_location_id |
| `drizzle/meta/_journal.json` | New journal entry |
| `src/infra/schema.ts` | `exits.to_location_id` nullable |
| `src/core/domain/entities.ts` | `Exit.to: LocationId \| null` |
| `src/core/domain/builder-types.ts` | `UpsertExitInput.to: LocationId \| null` |
| `src/infra/builder-sqlite-repository.ts` | toExit mapper, upsertExit |
| `src/infra/builder-memory-repository.ts` | upsertExit, toExit |
| `src/infra/sqlite-repository.ts` | toExit mapper |
| `src/core/builder/index.ts` | asExitInput null handling |
| `src/core/engine/actions/move.ts` | Stub creation branch |
| `src/core/engine/consequences.ts` | New action kinds, schema, processing, system prompt |
| `src/core/domain/actions.ts` | New consequence action types (or keep in consequences.ts) |
| `src/core/spawning/expand.ts` | Called by `create_agent` processing; must accept liveWorldId |
| `app/routes/admin/-components/ExitsEditor.tsx` | Auto-generate option in destination selector |
| `src/mcp/tools.ts` | `to` nullable in upsert_exit tool |
| Test fixtures | All Exit object literals with nullable `to` |
