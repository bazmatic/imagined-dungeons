# Monster Template: Per-Instance Labels and HP Range

**Date:** 2026-05-15
**Status:** Approved

## Summary

Two changes to `MonsterTemplate` that make spawned agents more varied:

1. Each spawned agent gets a unique LLM-generated label prefix (e.g. `"[Tall chatty] Ash Zombie"`), generated in a single batch call at spawn time.
2. HP becomes a range (`hpMin`/`hpMax`) instead of a fixed value; each agent's HP is rolled randomly within the range at spawn time.

## Data Model

### `MonsterTemplate` changes

| Field | Change |
|---|---|
| `label` | Unchanged — now explicitly the *base* label (e.g. `"Ash Zombie"`) |
| `labelPrefixInstructions` | New — `string \| null`. Admin-written prompt fragment telling the LLM what kinds of prefixes to generate. `null` means no LLM call; agents get numbered names. |
| `hp` | Removed |
| `hpMin` | New — `number`, required |
| `hpMax` | New — `number`, required, must be `>= hpMin` |

### Spawned `Agent` — no field changes

- `label` receives the fully composed name at spawn time
- `hp` receives a random integer in `[hpMin, hpMax]` (uniform, inclusive)

## New: `generateAgentNames()`

**Location:** `src/core/spawning/generate-names.ts`

```typescript
generateAgentNames(
  template: MonsterTemplate,
  count: number,
  llm: LLM | null
): Promise<string[]>
```

### Behaviour

Returns an array of `count` labels. Three cases:

| Condition | Output |
|---|---|
| `labelPrefixInstructions` is `null` | All numbered: `"Ash Zombie 1"`, `"Ash Zombie 2"`, … |
| `llm` is `null` | All numbered (treated same as no instructions) |
| LLM call succeeds with K names (K ≤ count) | Indices 0..K-1 get LLM names; indices K..count-1 get numbered fallback |
| LLM call fails / returns 0 | All numbered |

Numbered fallback uses 1-based position index: `"${template.label} ${i + 1}"`.

### LLM call

- Single call requesting `count` distinct full labels as a JSON array of strings
- Prompt feeds in `template.label` and `template.labelPrefixInstructions`
- Uses JSON mode / structured output where the LLM interface supports it
- Never throws — all errors are caught and trigger the numbered fallback

## Changes to `expandSpawn()`

**Location:** `src/core/spawning/expand.ts`

Two changes:

1. Accept optional `labels?: readonly string[]`. If provided, `labels[i]` is used as each agent's label; otherwise falls back to `template.label`.
2. Replace `template.hp` with `randomInt(template.hpMin, template.hpMax)` (inclusive) per agent.

`expandSpawn()` remains a pure synchronous function — no LLM dependency.

## Changes to `tick-pass.ts`

Before calling `expandSpawn()` for a spawn group:

1. Call `generateAgentNames(template, count, llm)`
2. Pass the result as `labels` to `expandSpawn()`

`generateAgentNames` is safe (never throws), so no additional error handling is needed at the call site.

## Database Migration

New migration on the `monsterTemplates` table:

- Add `label_prefix_instructions TEXT` (nullable, default `null`)
- Add `hp_min INTEGER NOT NULL` (default: existing `hp` value)
- Add `hp_max INTEGER NOT NULL` (default: existing `hp` value)
- Drop `hp` column

Existing templates are migrated with `hpMin = hpMax = old hp`, preserving fixed-HP behaviour as a degenerate range.

## Admin UI (`TemplateForm`)

- **Base label field** — unchanged, label updated to "Base Label" for clarity
- **Label Prefix Instructions** — new optional textarea below the base label field. Placeholder: *"LLM instructions for generating a unique prefix per spawn, e.g. 'Generate a short physical/personality descriptor in square brackets'"*
- **HP** — single number input replaced with two side-by-side inputs: **HP Min** and **HP Max**
