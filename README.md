# Imagined Dungeons

A generative, multi-agent text adventure engine. The world's *structure* is stored as data; the world's *behavior* and much of its *narration* are produced by a language model. The goal is emergent, coherent play — not branching pre-written content.

This repository is the staged build-out of the design in [abstract-design.md](abstract-design.md), beginning with a fully deterministic core and adding generative layers one slice at a time.

## Status — Slice 1 (current)

A classic, fully mechanical text adventure for **The Burning District** — playable, type-safe, persistent, and serving as the foundation for every subsequent slice.

- Engine: parse → validate → mutate → emit event → render
- Verbs: `move` / `look` / `take` / `drop` / `inventory` (with the obvious aliases)
- 16 locations, 31 exits, 20 items, 1 player + 14 inert NPCs, seeded from [burning-district-data.md](burning-district-data.md)
- 47 tests, TypeScript strict, biome clean
- No language model calls anywhere — that comes in slice 2

## Stack

- **TanStack Start** (Vite plugin) — server-rendered React, server functions
- **Drizzle ORM + better-sqlite3** — file-backed persistence; schema is multi-world capable
- **TypeScript** strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **vitest** for unit + integration tests
- **biome** for lint + format

## Architecture

Layered hexagonal. Dependencies point inward only.

```
app/                       — TanStack Start routes, server functions, UI
└── src/infra/             — Drizzle schema, SQLite repository, world seeder
    └── src/core/engine/   — parser, perception, templates, action handlers, turn orchestrator
        └── src/core/domain/  — entities, ids, actions, events, Result
```

The engine is written against a `Repository` interface; tests use an in-memory implementation, production uses Drizzle/SQLite. Swapping to Postgres later is a single concrete class.

The action vocabulary is a closed set, dispatched through a registry. Adding a verb is one new file under `src/core/engine/actions/` and one line in `registry.ts`. The seam where the model layers slot in (interpreter, narrator, consequences) is the parser/template boundary — the rest of the engine is unaware of how text turns into actions or how events turn into prose.

## Getting started

```bash
pnpm install
pnpm seed:gen   # parse burning-district-data.md → src/infra/seed/burning-district.ts
pnpm dev        # start the dev server
```

Then open the URL it prints (typically `http://localhost:5173`). Type `look`, `n`, `take fire map`, `i`, `drop fire map`, etc. State persists in `imagined-dungeons.db` — refresh resumes.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run the test suite (47 tests) |
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
      parser.ts              — verb-noun parser (slice-1 stand-in for the LLM interpreter)
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
  smoke-resume.ts            — manual persistence smoke test
tests/integration/           — full-flow + repo + seeder tests
```

## What slice 2 will add

Per [abstract-design.md §14](abstract-design.md#14-what-to-build-first):

- An LLM-backed **interpreter** replacing the verb-noun parser. The action vocabulary doesn't change; the parser is swapped behind the same input/output contract.
- Narrated action types (`speak`, `attack`) wired into a Narrator that produces observer-specific prose.
- One autonomous NPC.
- A consequence pass that lets the world act in response to events, including durable description updates.

Each slice is independently playable and ships behind no feature flag.

## Design references

- [abstract-design.md](abstract-design.md) — the full system design (entities, action vocabulary, three model roles, perception-gated memory, etc.)
- [burning-district-data.md](burning-district-data.md) — the seeded world
- [docs/superpowers/specs/](docs/superpowers/specs/) — slice-by-slice design notes
- [docs/superpowers/plans/](docs/superpowers/plans/) — slice-by-slice implementation plans
