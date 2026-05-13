# Agent Secret Description

**Date:** 2026-05-13
**Status:** Approved

## Summary

Add a `secretDescription` field to Agent, mirroring the existing field on Location. The consequence engine sees it; the player, narrator, and NPC minds never do.

## Motivation

The consequence engine already receives GM-only notes for locations when deciding what to reveal, spawn, or change. Agents have no equivalent. GMs need a place to author hidden character dynamics — secret allegiances, concealed intentions, information the agent holds but hasn't revealed — so the engine can use that context when resolving events.

## Design

### Schema & Migration

New column on the `agents` table:

```sql
ALTER TABLE agents ADD COLUMN secret_description TEXT NOT NULL DEFAULT '';
```

New migration file: `drizzle/0014_agent_secret_description.sql`

### Domain Types

`src/core/domain/entities.ts` — add to `Agent`:

```ts
/**
 * GM-only secret notes about this agent. Visible to the consequence
 * engine and the admin UI, but NEVER surfaced to the player, the
 * narrator, NPC minds, or any player-visible event. Use for hidden
 * dynamics — secret allegiances, concealed goals, information the
 * agent holds but hasn't revealed.
 */
readonly secretDescription: string;
```

`src/core/domain/builder-types.ts` — add to `UpsertAgentInput`:

```ts
/** GM-only secret notes; never surfaced to the player. Default ''. */
readonly secretDescription: string;
```

### Repositories

All three persistence files map the new field:

- `src/infra/builder-sqlite-repository.ts` — upsert (insert values) and select (row → entity)
- `src/infra/builder-memory-repository.ts` — upsert (stored record)
- `src/infra/sqlite-repository.ts` — read-side row → entity

### Builder Use-Case

`src/core/builder/index.ts` — `asAgentInput` (line 416) maps `Agent` → `UpsertAgentInput` for world cloning. Add `secretDescription: a.secretDescription`. The `upsertAgent` function itself (line 218) passes the input through unchanged, so no edit needed there.

### Consequence Engine

`src/core/engine/consequences.ts` — in the agent block (around line 459), add after `mood`:

```ts
if (a.secretDescription && a.secretDescription.length > 0) {
  lines.push(`    GM-only notes: ${a.secretDescription}`);
}
```

The existing system prompt (line 36) already explains GM-only notes generically and does not need updating.

### Admin UI

`app/routes/admin/-components/AgentForm.tsx` — add a GM-only Notes section in the primary column, after the long description and before the save button. Same structure as the Location form:

- `<label>` with "GM-only Notes"
- `<p className="t-metadata">` helper text explaining it is engine-visible but never player-visible
- `<textarea className="manuscript-input-v2">` bound to `v.secretDescription`

Form state initialisation: `secretDescription: agent.secretDescription ?? ''`

### Tests

Adding `secretDescription` to the `Agent` interface will cause TypeScript errors in every test file that constructs an inline `Agent` object literal. Each gets `secretDescription: ''` added. No test logic changes — this is purely fixture completeness.

Files expected to need updates (from grep):
- `src/infra/memory-repository.test.ts`
- `src/core/lore/context.test.ts`
- `src/core/spawning/tick-pass.test.ts`
- `src/core/builder/validate.test.ts`
- `src/core/builder/index.test.ts`
- `src/core/engine/consequences.test.ts` (also add a test for the new agent GM-only notes surface)
- `src/core/engine/turn.test.ts`
- `src/core/engine/llm-prompt.test.ts`
- `src/core/engine/tick.test.ts`
- `src/core/engine/templates.test.ts`
- `src/core/engine/llm-interpret.test.ts`
- `src/core/engine/npc-mind.test.ts`
- `src/core/engine/memory.test.ts`
- `src/core/engine/npc-scheduler.test.ts`
- `src/core/engine/narrate.test.ts`
- `src/core/engine/parser.test.ts`
- `src/core/engine/parser/composite.test.ts`
- `src/core/engine/perception.test.ts`
- `src/core/engine/actions/` (all action test files)

A new test in `consequences.test.ts` should verify:
- Agent `secretDescription` is surfaced in the consequence user prompt when non-empty
- Agent `secretDescription` is NOT emitted when empty (matching the existing location tests at lines 328 and 356)

## Out of Scope

- Items do not get `secretDescription` in this change.
- No changes to MCP tools (Location's MCP tool already handles `secretDescription`; agents have no equivalent MCP tool for this field).
- The system prompt wording does not change.
