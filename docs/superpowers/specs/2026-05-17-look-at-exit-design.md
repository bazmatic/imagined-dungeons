# Look at Exit — Design Spec

**Date:** 2026-05-17

## Overview

When a player or NPC looks at an exit, they see LLM-generated prose describing what lies beyond it — unless the exit is locked, in which case only the mechanical description is shown.

---

## Data Model

No schema changes. All needed data already exists:

- `Exit`: `id`, `from`, `to: LocationId | null`, `direction`, `label`, `locked`
- `Location`: `label`, `shortDescription`, `longDescription`, `tags`
- `TagLore`: resolved via `loadLoreContext` using destination tags

---

## New `GameAI` Method

```ts
peekExit(exit: Exit, destination: Location, lore: LoreContext | null): Promise<string | null>
```

Added to the `GameAI` interface. Returns LLM-generated prose or `null` (null = use template fallback).

- `nullGameAI.peekExit` returns `null`
- `LlmGameAI.peekExit` delegates to a new `peek-exit.ts` module

This keeps the LLM boundary invariant: no handler imports `LanguageModel` directly.

---

## New Module: `peek-exit.ts`

Owns the system prompt, user prompt, and `LanguageModel` call. Pattern follows `narrate.ts` and `trade-decide.ts`.

**System prompt:**
> You are the narrator of a fantasy text adventure. The player peers through or past an exit. In one or two sentences, describe what they can perceive — sights, sounds, atmosphere drifting through. Present tense. Second person ("You see...", "Through the doorway you glimpse..."). Do not invent people, events, or information not grounded in the location's description. Be evocative but concise.

**User prompt fields:**
- Exit label and direction (e.g. "oak door, leading north")
- Destination name (e.g. "Merchant Quarter")
- Destination short description
- Destination long description
- Tag lore: each `tag → description` pair from `lore.tagDescriptions` (if lore is non-null)

**Mechanical fallback** (if LLM unavailable or returns empty string): returns `null`, caller uses template.

---

## `handleLook` — Exit Case

Three cases:

| Condition | Behaviour |
|-----------|-----------|
| `exit.locked` | Template only: "The oak door leads north. It is locked." |
| `exit.to === null` | Template only: "The oak door leads north. It is unobstructed." (destination procedurally unknown) |
| Unlocked + `exit.to` known | LLM peek; template fallback if null |

**Data flow for the third case:**

1. `exit = await repo.getExit(target.id)`
2. `destination = await repo.getLocation(exit.to)`
3. If `deps.builderRepo` and `deps.worldId` present: `lore = await loadLoreContext(deps.builderRepo, repo, deps.worldId, { tags: destination.tags, locationId: null })`
4. `prose = await deps.ai?.peekExit(exit, destination, lore ?? null) ?? null`
5. If `prose`: render as `Narration` segment
6. If `null`: render template — "The oak door leads north to the Merchant Quarter."

`deps.builderRepo` and `deps.worldId` are already available in the dispatch layer (used by `handleSearch`). `deps.ai` is already available (used by `handleBuy`, `handleSell`).

---

## Updated Template Fallback

`renderLookExit` gains an optional `destinationLabel?: string` parameter:

- Locked: `"The {label} leads {direction}. It is locked."`
- Unlocked, destination unknown: `"The {label} leads {direction}. It is unobstructed."`
- Unlocked, destination known, no LLM: `"The {label} leads {direction} to {destinationLabel}."`

---

## Wiring

`handleLook` receives `deps.ai`, `deps.builderRepo`, and `deps.worldId` from the dispatch layer — no new wiring needed. The registry's `HandlerDeps` already carries all three for the search/buy/sell handlers.

---

## Error Handling

- LLM error or empty response → `peekExit` returns `null` → template fallback
- `getLocation(exit.to)` throws (stale reference) → catch, fall back to template without destination name
- `loadLoreContext` throws → catch, call `peekExit` with `lore: null`

---

## Testing

- `peek-exit.ts`: unit tests with a stub `LanguageModel` — verify prompt includes destination name, descriptions, and tag lore; verify empty response returns `null`
- `handleLook` (exit case): unit tests for all three cases (locked, null destination, unlocked+known) using `nullGameAI` and a spy `GameAI`
- `renderLookExit`: update existing unit tests for the new optional parameter
