# Imagined Dungeons

A generative, multi-agent text adventure engine. The world's *structure* is stored as data; the world's *behavior* and much of its *narration* are produced by a language model. The goal is emergent, coherent play — not branching pre-written content.

This repository is the staged build-out of the design in [abstract-design.md](abstract-design.md), beginning with a fully deterministic core and adding generative layers one slice at a time.

## Status — Slice 5 (current)

Slices 1–4 plus the consequence engine. After the player's turn and after autonomous NPC ticks, a fourth model role — the consequence engine — surveys the events that just happened and decides whether the world's stored descriptions should change to reflect them durably. Description updates are issued as `update_description` actions by a synthetic `system` agent through the same dispatch pipeline as everything else.

- Engine: player turn → consequence pass → NPC ticks → consequence pass → witnessed render
- Bounded use: 1 LLM call per consequence pass; max 3 actions per pass; recursion depth capped at 1 (so at most 2 consequence calls per tick).
- The closed action vocabulary now includes `update_description`, but it is reserved for the consequence engine — player and NPC interpreters cannot emit it by design.
- Conservative prompt: routine moves/looks/inventory checks never produce consequences. Only events that genuinely change the room (taking a key item, combat damage, etc.) prompt a description update.
- Mechanical fallback: with `OPENAI_API_KEY` unset, the consequence pass returns `[]` and behaviour is identical to slice 4.
- 183 tests, TypeScript strict, biome clean

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

## Roadmap

Per [abstract-design.md §14](abstract-design.md#14-what-to-build-first):

- ✅ **Slice 1** — mechanical core (move/look/take/drop/inventory).
- ✅ **Slice 2** — LLM-backed interpreter, falls back from the rule parser.
- ✅ **Slice 3** — narrated action types (`speak`/`attack`) with an observer-specific Narrator.
- ✅ **Slice 4** — autonomous NPCs taking turns.
- ✅ **Slice 5** — consequence engine + durable `update_description`.
- **Slice 6+** — combat depth, containers, search, locks-with-keys.

Each slice is independently playable and ships behind no feature flag.

## Implementation rules learned

Stack-specific lessons accumulated across slices 1–5. These are TypeScript/OpenAI/codebase rules, not architecture-level claims — those live in [abstract-design.md](abstract-design.md).

### OpenAI strict mode forbids `oneOf`

Structured outputs in strict mode reject `oneOf` / `anyOf` at the schema root and require every property listed under `properties` to also appear in `required`. Express union-shaped responses as a single flat object with a `kind` discriminator (an `enum`) and union/nullable payload fields; the validator picks the relevant fields per `kind` and ignores the rest. The slice 2 player-action schema (`src/core/engine/llm-output.ts`) and the slice 5 consequence schema (`src/core/engine/consequences.ts`) both follow this pattern.

### NPC mind prompt must enumerate available verbs

An open-ended "decide what you want to do" prompt produces verbs the closed parser rejects ("greet", "smile", "compliment", "wave"). The NPC mind's system prompt must enumerate the available verbs with first-person examples and explicitly forbid common alternatives. Without this, autonomous NPCs go silent — every intent fails to parse and the player sees nothing.

### No string literals in logic

Discriminator values (`kind`, `ownerKind`, `outcome`, etc.) live in `src/core/domain/kinds.ts` as `as const` objects, not raw strings sprinkled through the codebase. The TypeScript types stay as string-literal unions for inference; the *literals in code* always go through the const objects (`ActionKind.Move`, `EventKind.Attack`, `OwnerKind.Location`). This catches typos at compile time. The rule applies to logic; type declarations and test assertion strings keep raw literals.

### Exhaustive switches over `EventKind` proliferate

Every new event kind needs handling in `narrate.ts:summariseEvent`, `npc-mind.ts:summariseEvent`, `tick.ts:renderWitnessForPlayer`, and `consequences.ts:summarise`. TypeScript's exhaustiveness check catches missed cases at compile time — but the duplication itself is a smell. If more verbs land, consolidating into a single shared `summariseEvent` helper is the obvious next step. Flagged after slice 5.

## Design references

- [abstract-design.md](abstract-design.md) — the full system design (entities, action vocabulary, three model roles, perception-gated memory, etc.)
- [burning-district-data.md](burning-district-data.md) — the seeded world
- [docs/superpowers/specs/](docs/superpowers/specs/) — slice-by-slice design notes
- [docs/superpowers/plans/](docs/superpowers/plans/) — slice-by-slice implementation plans
