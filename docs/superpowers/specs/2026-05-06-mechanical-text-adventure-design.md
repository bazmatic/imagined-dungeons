# Imagined Dungeons — Mechanical Text Adventure (Slice 1)

**Status:** Design approved (in conversation), ready for implementation plan.
**Scope:** Steps 1–3 of `abstract-design.md` §14: deterministic core, no language model.
**Stack:** TanStack Start, Drizzle ORM, SQLite (via `better-sqlite3`), TypeScript strict.
**World:** The Burning District, seeded from `burning-district-data.md`.

---

## 1. Goal

Ship a fully playable, classic-style text adventure in The Burning District. The player (Paff Pinkerton) types `move`/`look`/`take`/`drop` commands, the engine validates them deterministically, mutates state, emits an event, and renders the result through mechanical templates. Refresh resumes. No model anywhere.

This slice is the foundation for every future slice. The engine boundaries, action vocabulary contract, repository interface, and event log established here are what the model layers (interpreter, consequences, narrator) will plug into in subsequent slices without rewrites.

## 2. Non-Goals (explicitly deferred)

- Language model integration of any kind. The "interpret" step is a verb-noun parser.
- NPC agency. NPCs are seeded as inert entities (visible via mechanical narration, no turns taken).
- Combat. Stats are stored on agents but no `attack` verb yet.
- Creature spawning. Templates and spawn tables are not seeded.
- Hidden items, search verb. Items flagged `hidden: true` in the source data are seeded but unreachable until `search` lands in a later slice.
- Unlocking exits. Locked exits store the `lockedBy` item id but the player cannot unlock them yet — movement just blocks with a message naming the obstacle.
- Containers as a verb (`open`, `put-in`). Container *ownership* is supported in the schema (an item can own another item), but the player cannot manipulate containers in this slice.
- `give`, `speak`, `use`, `attack`, `update_self`, `update_description`. Out of scope.
- Multiplayer, accounts, multiple saves. Single browser session, single world.
- Streaming, real-time presence. Request/response only.

## 3. Architecture — Layered Hexagonal

Dependencies point inward only. Outer layers may import from inner; inner layers know nothing of outer.

```
┌──────────────────────────────────────────────────────┐
│  app/  — TanStack Start routes, server fns, UI       │
│  ┌────────────────────────────────────────────────┐  │
│  │  infra/  — Drizzle schema, repo implementations │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  core/engine — actions, parser, loop     │  │  │
│  │  │  ┌────────────────────────────────────┐  │  │  │
│  │  │  │  core/domain — types, invariants   │  │  │  │
│  │  │  └────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 3.1 `core/domain`

Pure TypeScript. No imports outside its own folder. No I/O. Fully unit-testable.

Holds:
- **Entity types**: `Location`, `Exit`, `Item`, `Agent`, `Event`. Discriminated unions where useful.
- **Branded id types**: `LocationId`, `ItemId`, `AgentId`, `ExitId`, `EventId` — prevent mixing.
- **Action types**: discriminated union `Action` with variants `Move`, `Look`, `Take`, `Drop`. Every action carries `actorId` and the verb-specific arguments.
- **Result type**: `Result<T, E>` (success | failure with reason). The engine returns these; transport translates to UI.
- **Owner type**: `Owner = { kind: 'location'; id: LocationId } | { kind: 'agent'; id: AgentId } | { kind: 'item'; id: ItemId }`. Polymorphic but exclusive — exactly one parent per item, enforced by construction.
- **Direction type**: closed enum of compass directions plus `up`/`down`. Anything else is rejected at parse time.

Invariants enforced here (not at the DB layer):
- An item has exactly one owner.
- An agent has exactly one location.
- An exit has distinct `from` and `to`.
- An event is immutable once constructed.

### 3.2 `core/engine`

Pure functions over a `Repository` *interface* (defined here, implemented in `infra`). No SQL, no Drizzle imports, no `process`, no `fetch`. Engine code can be tested with an in-memory repo fake.

Modules:

- **`parser.ts`** — `parse(text: string, actor: Agent): Action | ParseError`. Tiny verb-noun grammar. Strips articles ("the", "a"), handles direction abbreviations (`n` → `north`), resolves nouns against the actor's perceivable surroundings (case-insensitive label match, prefix match as fallback, ambiguity → `ParseError.Ambiguous`). The parser is the *mechanical* stand-in for the interpreter role from the design's §10; it shares the same input/output shape (text → action), so swapping in a model later is purely a constructor change.

- **`actions/move.ts`** — Validates the direction has an exit from the actor's location, that the exit is unlocked, and applies the location change. Emits `MoveEvent`.

- **`actions/look.ts`** — No mutation. Returns the actor's current location's description, list of perceivable items, list of perceivable agents, list of unblocked exits with their labels. If a target argument is given, returns that target's stored description (mechanical, no model).

- **`actions/take.ts`** — Validates the item is in the actor's current location (not in a container, not held by another agent, not hidden), and the actor has capacity. Transfers ownership. Emits `TakeEvent`.

- **`actions/drop.ts`** — Validates the actor holds the item. Transfers ownership to the location. Emits `DropEvent`.

- **`actions/inventory.ts`** — No mutation. Returns the actor's held items. Renders as a list. Aliased as `i` in the parser. (Not in `abstract-design.md` §4 vocabulary, but a trivial mechanical convenience that costs us nothing and makes acceptance test #5 reachable. If you'd rather make it `look self`, that also works — same code path.)

- **`actions/registry.ts`** — Maps `Action.kind` to its handler. Adding a verb in a future slice is one line here. (This is the open/closed seam.)

- **`perception.ts`** — Single source of truth for "what can actor X perceive in their current location?". Returns `{ items: Item[], agents: Agent[], exits: Exit[] }` filtered by hidden/lockedFrom/etc. flags. Used by parser, look, and the eventual narrator.

- **`templates.ts`** — Mechanical narration. Pure functions from event + observer to string. Examples:
  - `renderLook(loc, perception): string`
  - `renderMove(event): string` → `"You go north."` (for actor) / `"Paff went north."` (for others)
  - `renderTake(event): string` → `"Taken."` / `"Paff picked up the rusty key."`
  - `renderDrop(event): string`
  - `renderError(reason): string` → `"You can't go that way."`, `"There is no rusty key here."`, etc.

- **`turn.ts`** — `runTurn(actorId, text, repo): Promise<{ events: Event[], render: string }>`. The orchestrator. Parses → dispatches → persists event → returns event + rendered text. For this slice it's a single actor, single action; in step 6+ this expands to NPC turns.

- **`repository.ts`** — The interface, no implementation:
  ```ts
  interface Repository {
    getAgent(id: AgentId): Promise<Agent>;
    getLocation(id: LocationId): Promise<Location>;
    getItem(id: ItemId): Promise<Item>;
    itemsAt(owner: Owner): Promise<Item[]>;
    agentsAt(loc: LocationId): Promise<Agent[]>;
    exitsFrom(loc: LocationId): Promise<Exit[]>;
    appendEvent(e: Event): Promise<void>;
    moveAgent(agent: AgentId, to: LocationId): Promise<void>;
    transferItem(item: ItemId, to: Owner): Promise<void>;
    // ... narrow, intent-revealing methods. No `query(sql)` escape hatch.
  }
  ```
  Every method is tightly scoped. No "give me everything" methods. This is what makes the engine fake-able and the SQLite→Postgres swap mechanical.

### 3.3 `infra/persistence`

The only place SQL exists.

- **`schema.ts`** — Drizzle schema. Tables: `worlds`, `locations`, `exits`, `items`, `agents`, `events`. Item ownership is a single column with a discriminator (`owner_kind`, `owner_id`) — checked at the application layer, not via FK (because the FK target depends on the discriminator).
- **`db.ts`** — `better-sqlite3` connection, migration runner. On boot: run pending migrations, then if the DB is empty seed from `burning-district-data.md` parsed at build time into a TypeScript module (`infra/seed/burning-district.ts`).
- **`repositories/`** — One file per aggregate, each implementing the slice of `Repository` it owns. Composed at the app boundary.
- **`seed/`** — `parse-burning-district.ts` (a build-time script that reads the markdown tables and emits a typed `WorldData` constant); `seeder.ts` (idempotent: applies the constant only if `worlds` is empty).

The schema is **multi-world capable** from day one (every entity has a `worldId`). The slice uses a single hardcoded world id. This costs us nothing now and means adding multiple saves later is a UI/auth change, not a migration.

### 3.4 `app`

TanStack Start. Thin.

- **Server functions:**
  - `submit(text: string)` → calls `runTurn(playerAgentId, text, repo)`, returns `{ render: string, events: Event[] }`.
  - `getInitialView()` → returns the rendered output of an implicit `look` so a fresh page load shows the starting room.
- **Routes:** A single page route. Header with location name, scrollable transcript, command input at the bottom. Submit button + Enter key. No fancy UI — black background, monospace, that's it.
- **State:** Transcript lives in component state. Server is the source of truth for world; the transcript is presentation only and is not persisted.

## 4. Data Flow — One Turn

```
[user types "take rusty key"]
        │
        ▼  (server fn `submit`)
runTurn(actorId, text, repo)
        │
        ▼
parser.parse(text, actor)
   ├─ ParseError → render error template, return
   └─ Action { kind: 'take', itemRef: 'rusty key' }
        │
        ▼
registry.dispatch(action)
        │
        ▼
actions/take.handle(action, repo)
   ├─ validate: item visible? in same location? actor has capacity?
   │   └─ failure → return Result.Err(reason)
   └─ repo.transferItem(itemId, { kind: 'agent', id: actorId })
        │
        ▼
event = makeTakeEvent(actor, item)
repo.appendEvent(event)
        │
        ▼
templates.renderTake(event, observer=actor) → "Taken."
        │
        ▼
return { events: [event], render: "Taken." }
        │
        ▼  (back through server fn)
client appends `render` to transcript
```

A `look` follows the same path but mutates nothing and renders a multi-line block (description, items, agents, exits).

## 5. Event Log

Events are append-only, stored once. The schema:

```
events {
  id: ulid (lexicographic, time-ordered)
  worldId: string
  actorId: string
  kind: 'move' | 'take' | 'drop' | 'look'   -- closed set
  payload: json                               -- action-specific
  witnesses: json (string[])                  -- agent ids who could perceive it
  createdAt: timestamp
}
```

For this slice `look` doesn't strictly need to be an event (it has no consequence), but storing it costs nothing and gives us a complete play trace for debugging. We can decide in slice 2 whether to keep it or drop it. Until then: log everything.

`witnesses` is computed at write time using `perception.ts`. For this slice it's just "agents in the same location at the moment of action", but the field is in place so slice 5 (the narrator) can use it without a migration.

## 6. Seed Strategy

`burning-district-data.md` is the source of truth for the starting world. A build-time parser converts the markdown tables into a strongly-typed `WorldData` object. The parser is *not* part of the runtime — it produces a `.ts` file checked into the repo.

What gets seeded:
- All 16 locations, with short and long descriptions.
- All 31 exits, with `lockedBy` populated where applicable. Locked exits block movement with a templated message; the unlocking mechanism is deferred.
- Items at their starting positions, including container nesting (`item_rusty_key` inside `item_wooden_box`). Items flagged `hidden: true` are stored with `hidden: true` and filtered by `perception.ts` (so they're effectively unreachable until `search` ships).
- The player agent (`char_39322`, Paff Pinkerton) at `loc_flaming_goblet` with the magical fire extinguisher in inventory.
- All NPCs as inert agents at their listed locations. They appear in "Also here:" lists but cannot act, be spoken to, or be attacked.

What does *not* get seeded:
- Creature templates and spawn tables.
- Combat stats are stored on agents (HP/DMG/DEF columns exist) but no system reads them.

## 7. Testing Strategy

Three tiers, fastest first.

- **Unit (vitest)** — every action handler, the parser, the perception filter, every template. Use the in-memory `Repository` fake. No DB, no TanStack. These run in milliseconds and are the bulk of the test suite.
- **Integration (vitest)** — the `runTurn` orchestrator end-to-end with a real SQLite (`:memory:`). Verifies repos and engine compose correctly. A handful of tests, not hundreds.
- **End-to-end (Playwright, optional)** — one happy-path test: load page, see starting room, type `take rusty key`, see error (it's in the box), type `look`, see the room again. Establishes the wire and nothing more. We can defer this until slice 2 if it slows us down.

TDD discipline: write the test for each action *before* the handler. Each action is small and pure — this is the easy case for TDD.

## 8. Error Handling Boundary

Validation lives in the engine, not the transport. The server function never throws on game-logic failures — it returns `Result.Err(reason)` and lets the template layer convert to user-facing prose.

The transport layer only handles *infrastructure* errors (DB unreachable, malformed request). Those bubble as exceptions; TanStack's error boundary catches them.

This gives us one place (templates) where every user-facing error message lives, instead of strings sprinkled through handlers.

## 9. Repository Layout

```
imagined-dungeons/
├── abstract-design.md
├── burning-district-data.md
├── docs/superpowers/specs/
│   └── 2026-05-06-mechanical-text-adventure-design.md
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   └── index.tsx                  -- the play page
│   ├── server/
│   │   ├── submit.ts                  -- server fn
│   │   └── initial-view.ts            -- server fn
│   ├── components/
│   │   ├── Transcript.tsx
│   │   └── CommandInput.tsx
│   └── styles.css
├── src/
│   ├── core/
│   │   ├── domain/
│   │   │   ├── ids.ts
│   │   │   ├── entities.ts
│   │   │   ├── actions.ts
│   │   │   ├── events.ts
│   │   │   └── result.ts
│   │   └── engine/
│   │       ├── parser.ts
│   │       ├── perception.ts
│   │       ├── templates.ts
│   │       ├── turn.ts
│   │       ├── repository.ts          -- interface
│   │       └── actions/
│   │           ├── registry.ts
│   │           ├── move.ts
│   │           ├── look.ts
│   │           ├── take.ts
│   │           └── drop.ts
│   └── infra/
│       ├── db.ts
│       ├── schema.ts
│       ├── repositories/
│       │   ├── sqlite-repository.ts   -- composes the four below
│       │   ├── locations.ts
│       │   ├── items.ts
│       │   ├── agents.ts
│       │   └── events.ts
│       ├── seed/
│       │   ├── burning-district.ts    -- generated, checked in
│       │   ├── parse-markdown.ts      -- build-time
│       │   └── seeder.ts
│       └── memory-repository.ts       -- test fake
├── drizzle/                           -- migrations
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── vite.config.ts                     -- TanStack Start
└── vitest.config.ts
```

## 10. SOLID & DRY in Practice

- **Single responsibility.** Each action handler does one verb. Templates don't validate. Parser doesn't dispatch. Repos don't hold game logic.
- **Open/closed.** Adding `speak` in a future slice = new file under `actions/`, one line in `registry.ts`, one template, one schema update. No existing handler is touched.
- **Liskov.** The in-memory repo and the SQLite repo are interchangeable. Tests rely on that.
- **Interface segregation.** `Repository` is one interface today because it's small. If it crosses ~15 methods we'll split it (`AgentRepository`, `WorldRepository`, etc.).
- **Dependency inversion.** Engine depends on the `Repository` interface, not on Drizzle. The composition root (`app/server/*`) wires the concrete repo in.
- **DRY.** Perception is computed once, used everywhere. Templates are the only place narration strings exist. Ids are branded once and used everywhere — no string ids floating in business logic.

## 11. Acceptance Criteria

The slice is done when:

1. `pnpm dev` starts a server, the page loads, and the starting view shows: name and long description of the Flaming Goblet, list of items the player can see, "Also here: Spark.", and the available exits including the locked Tavern Back Door (rendered as such).
2. Typing `n` or `north` produces "You can't go that way — the Tavern Back Door is locked." (no state change).
3. Typing `s` moves Paff to the Dockside Markets, the rendered output is the new room, and the events table contains a `move` row.
4. Typing `look fire map` returns the long description of the fire map.
5. Typing `take fire map` succeeds and a subsequent `look` no longer lists the fire map in the room (it's in inventory). Inventory is visible via `inventory` or `i`.
6. `drop fire map` reverses it.
7. Refreshing the page resumes exactly where Paff was, with current inventory.
8. `pnpm test` passes — unit and integration suites both green.
9. Type-check passes with TypeScript strict.
10. Lint passes (eslint or biome — picked during plan).

## 12. Open Questions for the Plan

These are decisions to make during plan-writing, not now:
- Biome vs. ESLint+Prettier for lint/format. (Biome leans simpler.)
- Test runner config — single vitest config or split unit/integration.
- Migration strategy: Drizzle Kit `push` for dev, `migrate` for prod. (Standard.)
- Whether to use ULID, UUID v7, or human-readable ids matching the markdown (`loc_flaming_goblet`). The markdown uses readable ids — preserving them aids debugging, costs nothing.

## 13. Out of Scope, On the Roadmap

The next slices (each its own spec):
- **Slice 2** — Interpreter pass: free-text input → action calls via a model, replacing the verb-noun parser. The action vocabulary doesn't change. (Design §14 step 4.)
- **Slice 3** — Narrated action types: `speak`, `attack`, with the Narrator generating observer-specific prose. (§14 step 5.)
- **Slice 4** — One autonomous NPC. (§14 step 6.)
- **Slice 5** — Consequences and `update_description`. (§14 step 7.)
- **Slice 6+** — Combat, containers, search, locks-with-keys, hidden things. (§14 step 8.)

Each slice is independently playable and ships behind no feature flag.
