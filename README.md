# Imagined Dungeons

A living world that remembers what happens in it.

Imagined Dungeons is a text adventure engine where the world isn't scripted — it's *alive*. The locations, inhabitants, and items exist as structured data you write. What those inhabitants *do*, what gets *said*, and how the world *responds* to events is handled by language models working behind the scenes.

You write a world. The engine breathes life into it.

## What makes it different

**The world notices things.** After anything significant happens — a key item is taken, a fight breaks out, a door is forced open — a consequence engine surveys the event and decides whether any room descriptions should change to reflect it. Launch a fireball that misses its target, and the room description might update to note the scorch mark on the wall. The world's memory is durable.

**NPCs have their own agenda.** Characters in the world take autonomous turns. They move, act, speak, and respond to events without being driven by the player. Share a location with an NPC and you'll witness them going about their business.

**Natural language, interpreted.** Players type what they'd naturally say — not `GO NORTH` but `head toward the sound of the market`. A language model interprets intent and maps it to the world's action vocabulary, falling back to a simpler parser when no AI key is present.

**Narration shaped by perspective.** What a player sees depends on where they are and who they are. The narrator renders events differently depending on who witnessed them — a bystander gets a different account than someone who was involved.

## Building a world

World-building is designed to be conversational. You describe what you want — a location, a character, an item, a connection between places — and AI tools handle the construction.

**From the app:** An in-app feature lets you request changes and additions in plain language. Describe a new room, ask for an NPC with a particular personality, or tell it what should change about a place — the engine works out the details.

**From an AI agent:** The builder is exposed as an MCP server (`pnpm mcp`). This lets you drive world construction from any AI assistant that supports MCP — describe your world across a conversation, iterate on it, and have the agent build it out incrementally.

The included world is the **Burning District**: a smoke-filled corner of a city under a slow catastrophe, where displaced people shelter in half-collapsed buildings and a market somehow still operates in the ruins.

An admin-facing builder lives at `/admin`. You can clone an existing world as a draft, edit locations and items directly, and publish changes back — authored edits merge cleanly with any gameplay drift that's happened in the live world.

## Getting started

```bash
pnpm install
pnpm seed:gen   # parse the world markdown into a seed module
pnpm dev        # start the dev server
```

Open the URL it prints (typically `http://localhost:5173`). Type `look` to orient yourself, then move, take things, talk to people. State persists between sessions — close the tab and pick up where you left off.

## Technical stack

- **TanStack Start** — server-rendered React with server functions
- **Drizzle ORM + SQLite** — file-backed persistence, multi-world capable
- **TypeScript strict** — `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **vitest** — unit and integration tests
- **biome** — lint and format

## Architecture

Layered hexagonal. Dependencies point inward only.

```
app/                       — TanStack Start routes, server functions, UI
└── src/infra/             — Drizzle schema, SQLite repository, world seeder
    └── src/core/engine/   — parser, perception, templates, action handlers, turn orchestrator
        └── src/core/domain/  — entities, ids, actions, events, Result
```

The engine is written against a `Repository` interface; tests use an in-memory implementation, production uses Drizzle/SQLite. The action vocabulary is a closed set dispatched through a registry — adding a verb is one new file and one line in `registry.ts`. The seam where the model layers slot in (interpreter, narrator, consequences) is the parser/template boundary — the rest of the engine is unaware of how text turns into actions or how events turn into prose.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run the test suite |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | biome check |
| `pnpm format` | biome format --write |
| `pnpm seed:gen` | Regenerate the seed module from the markdown source |

## Layout

```
abstract-design.md           — tech-agnostic specification
burning-district-data.md     — world data (locations, exits, items, agents)
docs/superpowers/
  specs/                     — design documents per slice
  plans/                     — implementation plans per slice
src/
  core/
    domain/                  — entity types, ids, Result, no I/O
    engine/                  — pure logic over a Repository interface
      actions/               — one file per verb + registry
      parser.ts              — verb-noun parser (fallback for the LLM interpreter)
      perception.ts          — what an actor can see in their location
      templates.ts           — mechanical narration; sole home for user-facing strings
      turn.ts                — orchestrator: parse → dispatch → render
      repository.ts          — the port (interface)
  infra/
    schema.ts                — Drizzle schema
    db.ts                    — DB connection + migration runner
    sqlite-repository.ts     — Repository implementation
    memory-repository.ts     — Repository fake for unit tests
    seed/
      burning-district.ts    — generated, checked in
      seeder.ts              — idempotent loader
app/
  routes/                    — TanStack Start route tree
  server/                    — server functions (composition root)
scripts/
  parse-world.ts             — markdown → seed module
tests/integration/           — full-flow + repo + seeder tests
```

## Roadmap

- ✅ **Slice 1** — mechanical core (move/look/take/drop/inventory)
- ✅ **Slice 2** — LLM-backed interpreter, falls back to the rule parser
- ✅ **Slice 3** — narrated action types (`speak`/`attack`) with observer-specific narration
- ✅ **Slice 4** — autonomous NPCs taking turns
- ✅ **Slice 5** — consequence engine and durable description updates
- **Slice 6+** — combat depth, containers, search, locks and keys

Each slice is independently playable and ships behind no feature flag.

## Design references

- [abstract-design.md](abstract-design.md) — the full system design (entities, action vocabulary, three model roles, perception-gated memory, etc.)
- [burning-district-data.md](burning-district-data.md) — the seeded world
- [docs/superpowers/specs/](docs/superpowers/specs/) — slice-by-slice design notes
- [docs/superpowers/plans/](docs/superpowers/plans/) — slice-by-slice implementation plans
