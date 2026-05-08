# Sidebar — surrounding context

**Status:** Approved 2026-05-08

## Problem

The sidebar currently shows only the player's inventory. Players have to read the room narration to know what items are on the ground, who is present, and which exits exist (and whether any are locked). That's fine for atmosphere but inconvenient for at-a-glance state.

## Goal

Surface the perceptual snapshot the player already has access to — items in the room, exits (with lock state), other characters (with short description and mood) — in the sidebar, refreshed every turn.

## Non-goals

- Live polling / push updates between turns.
- Click-to-look or any interactivity in the sidebar.
- Expand/collapse, character portraits, item icons.
- Reading shared NPC inventories or non-visible state.

## Architecture

A single helper, `buildSurroundings(playerId, repo)`, lives in `app/server/` and shapes the output of `perceive(playerId, repo)` into the wire-format `SurroundingsView`. Both server functions (`getInitialView`, `submitCommand`) call it and include the result alongside `inventory` in their response. The client renders four sidebar sections in fixed order: `HERE`, `EXITS`, `CHARACTERS`, `INVENTORY`.

The data is already produced by the existing perception layer; this design just exposes it.

## Wire format

```ts
interface SurroundingsView {
  items: { id: string; label: string }[];
  exits: { id: string; direction: string; label: string | null; locked: boolean }[];
  characters: { id: string; label: string; shortDescription: string; mood: string | null }[];
}
```

Both `getInitialView` and `submitCommand` return:

```ts
{ render, displayName?, witnessed?, inventory, surroundings: SurroundingsView }
```

(`displayName` only on initial view; `witnessed` only on submit — unchanged from today.)

## Server

`app/server/surroundings.ts` (new):

```ts
export async function buildSurroundings(
  playerId: AgentId,
  repo: Repository,
): Promise<SurroundingsView> {
  const view = await perceive(playerId, repo);
  return {
    items: view.items.map((i) => ({ id: i.id as string, label: i.label })),
    exits: view.exits.map((e) => ({
      id: e.id as string,
      direction: e.direction,
      label: e.label && e.label !== e.direction ? e.label : null,
      locked: e.locked,
    })),
    characters: view.agents.map((a) => ({
      id: a.id as string,
      label: a.label,
      shortDescription: a.shortDescription,
      mood: a.mood,
    })),
  };
}
```

`perceive` already excludes hidden items and the actor themselves, so no further filtering is needed.

`initial-view.ts` and `submit.ts` each gain one call:

```ts
const surroundings = await buildSurroundings(PLAYER_ID, repo);
return { ..., surroundings };
```

## Client

`app/routes/index.tsx`:

- Add `surroundings` state initialised from `initial.surroundings`.
- After `submitCommand`, if `r.surroundings` is present, replace it.
- Sidebar renders four sections in order: `HERE`, `EXITS`, `CHARACTERS`, `INVENTORY`. Each section reuses the existing inventory header styling (uppercase, letter-spaced, opacity 0.6).
- Empty sections render `(none)` (or `(empty)` for inventory, matching today) in muted italic.

Per-section rendering:

- **HERE:** label only — `fire map`.
- **EXITS:** `${direction}${label ? ` (${label})` : ''}${locked ? ' 🔒' : ''}` — e.g. `north (Tavern Back Door) 🔒`, `south`.
- **CHARACTERS:** `${label} — ${shortDescription}${mood ? ` (${mood})` : ''}` — e.g. `Spark — a halfling courier (energetic)`, `Paff Pinkerton — a tavern-keeper`.
- **INVENTORY:** unchanged.

## Testing

Unit tests in `app/server/surroundings.test.ts` against `MemoryRepository`:

1. Locked exit comes through with `locked: true`; unlocked with `locked: false`.
2. Exit with `label === direction` returns `label: null` (so the client doesn't render `north (north)`).
3. Agent without `mood` comes through as `mood: null`; with mood, the string passes through verbatim.
4. Hidden items are excluded (verifies the perceive-passthrough assumption).
5. The player themselves is not in `characters`.

No new integration tests; `perceive` correctness is already covered by the existing tick suite.

## Update timing

Sidebar refreshes on initial page load and after every `submitCommand`. No other refresh paths.

## Out of scope

- Polling.
- Sidebar interactivity.
- Showing item descriptions, character full descriptions, or exit descriptions in the sidebar.
- Mood-change animations.
