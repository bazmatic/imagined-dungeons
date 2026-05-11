# Lore and Generative Discovery — Design

Status: draft, awaiting user review.

## Goal

Two related capabilities:

1. **Lore** — give the engine an always-available world context plus per-tag descriptions, so every LLM-backed prompt (narrator, NPC mind, consequence engine, and the new generative-discovery pass below) has grounding without the author hand-writing it into every prompt template.
2. **Generative discovery** — when the player asks about something specific that isn't authored into the world (`look pendant` with no pendant; `search dusty corner`), an LLM pass invents a response grounded in lore. It may produce flavour-only text or a real, persisted item or agent that joins the world for future turns.

## Scope

In scope for v1:

- Two world-level lore slots: `worldOverview` (author-static) and `storySoFar` (consequence-engine-updated).
- `TagLore` — one description per tag per world. Optional: not every tag needs lore.
- `tags` as a first-class field on `Location`, `Item`, `Agent`, and `MonsterTemplate`. (`Location.tags` already shipped.)
- Spawned monsters copy `template.tags` at spawn time (frozen).
- A relevance resolver: given any "subject" (room, item, agent), compute the union of its own tags and (if it has a location) the location's tags, and pull the matching `TagLore` entries.
- A new `search` action verb.
- A generative-discovery pass invoked on (a) failed `look` and (c) explicit `search`. Returns a uniform structured response: `{ narration, spawnedItem?, spawnedAgent? }`. Bounded per-turn.
- Consequence engine gains an optional `updatedStorySoFar` output field, written only on significant events.
- Admin UI lore page: edit the two world slots and the per-tag descriptions.
- MCP tools mirroring the lore CRUD.

Out of scope (deferred):

- Free-form lore documents not pinned to a tag (no `LoreDoc` corpus). If the author wants standalone lore, they create a tag for it.
- Embedding-based relevance retrieval; tag intersection is the only relevance mechanism in v1.
- Auto-tagging by the LLM during generation beyond what the structured output allows.
- Generation triggered by other parser failures (`take pendant` with no pendant). Players use `search` explicitly.
- Generation embellishing room `look` output. Bare `look` keeps producing the authored room description (or the existing narrator pass).
- Versioning, history, or undo of LLM-updated `storySoFar`. The author can edit it freely; the LLM overwrites.

## Decisions (from brainstorming)

1. **Always-on slots, no corpus.** Lore has exactly two world-level fields: `worldOverview` and `storySoFar`. Beyond that, all lore lives in per-tag descriptions.
2. **Lore is keyed by tag, not "topic" or "kind."** One `TagLore` row per `(worldId, tag)`. If the author wants sub-categories ("sewers-east" vs "sewers-west"), they create more tags. The tag vocabulary IS the lore taxonomy.
3. **Relevance = tag union over subject + its location.** When examining a room, the union is just the room's tags. When examining an agent or item, the union is the subject's own tags plus its location's tags. For spawned-from-template monsters, the agent's frozen `tags` field carries the template's tags forward (and is no longer linked back to the template).
4. **Generative discovery fires on (a) `look <target>` parser failures and (c) the new `search <area>` verb.** Bare `look` and `take` are unaffected. The LLM decides per-call what to do via a uniform response shape — no schema discriminator on outcome.
5. **Uniform LLM response.** `{ narration: string; spawnedItem: UpsertItemInput | null; spawnedAgent: UpsertAgentInput | null }`. The engine reads optional fields and dispatches accordingly. Reuses existing input types — no new entity shape for "things invented by the LLM."
6. **`storySoFar` updates only when the consequence engine flags a significant event.** The existing consequence-engine schema gains an optional `updatedStorySoFar: string | null` field. The prompt instructs the LLM to leave it null for routine events. Matches the engine's existing discipline around durable-only mutations.
7. **Tags on every taggable entity.** `Agent.tags`, `Item.tags`, `MonsterTemplate.tags` join `Location.tags`. Spawned agents inherit `template.tags` at spawn time as a frozen copy.
8. **Builder UI deferred for richer authoring.** v1 ships a simple "Lore" page in the admin UI showing the two slots and a list of tags drawn from the world's entities, each with an "edit description" affordance. MCP exposes the same CRUD.

## Architecture

```
authored entities (UI / MCP)
        |
        v
  locations / items / agents / monster_templates
    each with tags: string[]                        ──┐
        |                                              │
        v                                              │
  tag vocabulary (derived: union of every entity's tags)
        |                                              │
        v                                              ▼
  tag_lore                                  ┌── relevance resolver ──┐
    {worldId, tag, title, description}     │                          │
        |                                  │  given a "subject", pull │
        v                                  │  TagLore for (subject.tags
  world_lore                                │  ∪ subject.location.tags)│
    {worldId, worldOverview, storySoFar}   │                          │
        |                                  └──────────┬───────────────┘
        |                                             │
        +───────────────────────────────────────────┐ │
        |  always-on lore (worldOverview,           │ │
        |  storySoFar) injected into every          │ │
        |  LLM-backed prompt                        │ │
        v                                            ▼ ▼
  LLM-backed passes:
    - narrator                  ── all receive: always-on lore +
    - npc-mind                   tag-resolved lore for the relevant
    - consequence engine         subject
    - generative discovery
        |
        v
  generative discovery pass:
    triggered by failed `look` or new `search` verb
    response: { narration, spawnedItem?, spawnedAgent? }
    dispatched: emit narration line; insert item/agent if present
        |
        v
  consequence engine:
    existing pass + new optional updatedStorySoFar in output schema
    when non-null, write to world_lore.story_so_far
```

The lore subsystem is a thin module (`src/core/lore/`) that exposes:

- `loadLoreContext(repo, worldId, subject): Promise<LoreContext>` — returns `{ worldOverview, storySoFar, tagDescriptions: Record<tag, string> }` for the subject. Used as a prompt-prep helper by every LLM pass.
- `applyConsequenceLoreUpdate(repo, worldId, update)` — applied by the consequence engine when its output contains an `updatedStorySoFar`.

The generative-discovery pass is its own module (`src/core/engine/discovery.ts`) with its own LLM schema and dispatch.

## Schema changes

### `world_lore` (new)

```
world_lore(
  worldId text primary key references worlds.id,
  worldOverview text not null default '',
  storySoFar text not null default ''
)
```

One row per world. Created lazily on first read or first write. Carried like other authoring artefacts: edited on the draft, copied wholesale to live on publish (no merge; lore is a *world-level* document, not an entity participating in three-way merge).

### `tag_lore` (new)

```
tag_lore(
  id text not null,                      -- tlr_<short>
  worldId text not null references worlds.id,
  tag text not null,
  title text not null,
  description text not null,
  primary key (worldId, id),
  unique (worldId, tag)
)
```

`(worldId, id)` is the composite primary key (matches the rest of the schema). `(worldId, tag)` is uniquely indexed so the author can't accidentally create two descriptions for one tag. Edited on the draft; copied wholesale to live on publish.

### Tags on more entities (additive columns)

```
ALTER TABLE agents          ADD tags text NOT NULL DEFAULT '[]';
ALTER TABLE items           ADD tags text NOT NULL DEFAULT '[]';
ALTER TABLE monster_templates ADD tags text NOT NULL DEFAULT '[]';
```

`tags` is a JSON array of strings on every row. Mirrors the existing `locations.tags` (added in a prior slice). Default `'[]'` lets the additive migration apply cleanly to existing rows.

### Consequence engine output schema (extended)

The existing consequence-engine structured output gains:

```ts
updatedStorySoFar: string | null;
```

When non-null, the engine writes `world_lore.story_so_far = updatedStorySoFar` for the world.

## Components

### `src/core/domain/builder-types.ts` (extended)

New types:

```ts
export interface WorldLore {
  readonly worldId: WorldId;
  readonly worldOverview: string;
  readonly storySoFar: string;
}

export interface TagLore {
  readonly id: TagLoreId;
  readonly worldId: WorldId;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface UpsertTagLoreInput {
  readonly id: TagLoreId;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface LoreContext {
  readonly worldOverview: string;
  readonly storySoFar: string;
  readonly tagDescriptions: Readonly<Record<string, string>>;
}
```

`Agent`, `Item`, `MonsterTemplate` gain `readonly tags: readonly string[]`. The corresponding `Upsert*Input` types also gain `tags`. `Location.tags` already exists.

`TagLoreId` is a new brand in `src/core/domain/ids.ts`.

### `src/core/builder/repository.ts` (extended)

New port methods:

```ts
readWorldLore(worldId: WorldId): Promise<WorldLore>;
writeWorldLore(worldId: WorldId, lore: Omit<WorldLore, 'worldId'>): Promise<void>;

listTagLore(worldId: WorldId): Promise<readonly TagLore[]>;
getTagLore(worldId: WorldId, id: TagLoreId): Promise<TagLore | null>;
getTagLoreByTag(worldId: WorldId, tag: string): Promise<TagLore | null>;
upsertTagLore(worldId: WorldId, input: UpsertTagLoreInput): Promise<void>;
deleteTagLore(worldId: WorldId, id: TagLoreId): Promise<void>;
```

`readWorldLore` returns defaults (`{ worldOverview: '', storySoFar: '' }`) when no row exists. Lazy create on first `write*`.

`MemoryBuilderRepository` and `SqliteBuilderRepository` implement these.

### `src/core/lore/context.ts` (new, pure)

```ts
export interface LoreSubject {
  readonly tags: readonly string[];
  readonly locationId: LocationId | null;
}

export async function loadLoreContext(
  repo: BuilderRepository,
  engineRepo: Repository,
  worldId: WorldId,
  subject: LoreSubject,
): Promise<LoreContext>;
```

Resolution:
1. Read `world_lore` for the world (defaults if absent).
2. Compute the tag union: `subject.tags ∪ (subject.locationId ? engineRepo.getLocation(subject.locationId).tags : [])`.
3. For each tag in the union, read `getTagLoreByTag(worldId, tag)`. Tags without lore contribute nothing.
4. Return `{ worldOverview, storySoFar, tagDescriptions }`.

This is the only public surface other passes consume. Narrator, npc-mind, consequence-engine, and discovery all call this once and feed the result into their prompts.

### `src/core/builder/index.ts` (extended)

Facade additions:

```ts
export async function getWorldLore(repo: BuilderRepository, worldId: WorldId): Promise<Result<WorldLore, BuilderError>>;
export async function updateWorldLore(repo, worldId, patch: { worldOverview?: string; storySoFar?: string }): Promise<Result<void, BuilderError>>;

export async function upsertTagLore(repo, worldId, input: UpsertTagLoreInput): Promise<Result<TagLoreId, BuilderError>>;
export async function deleteTagLore(repo, worldId, id: TagLoreId): Promise<Result<void, BuilderError>>;
```

`updateWorldLore` and `upsertTagLore`/`deleteTagLore` go through the existing `requireDraft` gate (live worlds are read-only outside publish/reset).

`copyTreeIntoWorld` is extended to copy `world_lore` and the world's `tag_lore` rows. Publish/reset behave like every other authoring artefact: wholesale replacement.

### `src/core/builder/validate.ts` (extended)

New `ProblemKind`s:

- `TagLoreTagEmpty` — empty `tag` field.
- `TagLoreDuplicate` — two rows with the same `(worldId, tag)`.
- `WorldOverviewLooksMalformed` (optional, low-priority) — could be omitted in v1.

### `src/core/engine/actions/search.ts` (new)

A new `ActionKind.Search` verb (`search`). The parser maps `search <area>` (or bare `search`) to this action. The action handler invokes the generative-discovery pass with the player's current location as the subject and the parsed `<area>` (if any) as the LLM-prompt hint.

### `src/core/engine/discovery.ts` (new)

The generative-discovery pass.

```ts
interface DiscoveryRequest {
  readonly trigger: 'failed_look' | 'search';
  readonly actorId: AgentId;
  readonly locationId: LocationId;
  readonly query: string;            // what the player asked about
  readonly loreContext: LoreContext;
  readonly visibleItems: readonly Item[];
  readonly visibleAgents: readonly Agent[];
}

interface DiscoveryResponse {
  readonly narration: string;
  readonly spawnedItem: UpsertItemInput | null;
  readonly spawnedAgent: UpsertAgentInput | null;
}

export async function runDiscovery(
  req: DiscoveryRequest,
  llm: LanguageModel,
): Promise<DiscoveryResponse>;
```

OpenAI strict-mode schema flattens to a single object with `narration` (required), and `spawnedItem`/`spawnedAgent` as `null | T`. The dispatch code in the action handler:

1. Always: emit a `look`-style domain event carrying the narration to the player.
2. If `spawnedItem !== null`: `repo.upsertItem(...)` with the location as owner; tags from the LLM-chosen set; emit an event so witnesses see it.
3. If `spawnedAgent !== null`: `repo.upsertAgent(...)` with `awake: false`, `shortTermIntent: null`; tags from the LLM; emit an event.

The dispatch is gated by a per-tick discovery budget:

```ts
export const MAX_DISCOVERY_CALLS_PER_TICK = 1;
```

The dispatch enforces this in `tick.ts` (a discovery call is a single LLM round-trip and unlikely to fire multiple times per turn, but the cap prevents pathological loops).

### `src/core/engine/parser/` (extended)

The rule parser learns the `search` verb. Compositional parser fall-through: `search` parses to `ActionKind.Search` with the trailing text as `query`.

### `src/core/engine/consequences.ts` (extended)

The consequence engine's output schema gains `updatedStorySoFar: string | null`. When non-null, the engine writes it via the new `applyConsequenceLoreUpdate`. The system prompt is updated to instruct the LLM:

> "Only set `updatedStorySoFar` for events that meaningfully change the campaign — a major character dying, a quest resolving, a faction shifting. Routine moves, conversations, and inventory changes leave it null."

### Server functions (`app/server/admin/`)

New `app/server/admin/lore.ts`:

- `getWorldLore({ id })` → `Result<WorldLore, BuilderError>`.
- `updateWorldLore({ id, worldOverview?, storySoFar? })` → `Result<void, BuilderError>`.
- `listTagLore({ worldId })` → `readonly TagLore[]`.
- `upsertTagLore({ worldId, payload })` → `Result<TagLoreId, BuilderError>`.
- `deleteTagLore({ worldId, id })` → `Result<void, BuilderError>`.

Mirrors the existing thin-wrapper style in `app/server/admin/templates.ts`.

### MCP tools (`src/mcp/tools.ts`)

New tools:

- `get_world_lore({ worldId })`.
- `update_world_lore({ worldId, worldOverview?, storySoFar? })`.
- `list_tag_lore({ worldId })`.
- `upsert_tag_lore({ worldId, id, tag, title, description })`.
- `delete_tag_lore({ worldId, id })`.

`reset_live_to_draft` is still NOT exposed (existing safety rule).

### Admin UI (`app/routes/admin/$worldId.tsx`)

A new top-level "Lore" node in the tree, alongside Locations and Bestiary. Selecting it opens a form panel with:

- `worldOverview` (textarea, multi-line)
- `storySoFar` (textarea, multi-line; with a note "auto-updated by the engine; you can edit freely")
- A list of tags drawn from the world's entities (union of all `tags` columns from locations/items/agents/templates). For each tag:
  - If `TagLore` exists: show title + description, with edit/delete affordances.
  - If not: show "no lore" with an "+ add description" button.

Editing uses the existing JSON-fallback editor pattern for v1 simplicity (structured form is a later polish).

## Data flow

### Authoring (draft)

1. Author edits world lore via the admin UI or `update_world_lore` MCP tool.
2. Author tags entities (locations/items/agents/templates) — same UI as today.
3. Author writes per-tag lore via `upsert_tag_lore`, filling in descriptions for tags they want grounded.
4. The validator checks for duplicate `(worldId, tag)` and empty tags. `TagLore` without a corresponding tag on any entity is allowed (background lore).

### Publish (draft → live)

1. Existing structural merge runs.
2. `world_lore` and all `tag_lore` rows are copied wholesale from draft to live (matching how templates and triggers behave).
3. Initial-publish-spawn (`fireOnInitialPublish`) and trigger machinery unchanged.

### Lore context at runtime

Every LLM-backed pass (narrator, npc-mind, consequence engine, discovery) calls `loadLoreContext(repo, engineRepo, worldId, subject)` once before its prompt build:

- For the narrator (rendering an event): subject = the actor's location (or the target for look events).
- For npc-mind: subject = the NPC (own tags + location tags).
- For the consequence engine: subject = the player's location (since most consequences are scene-level).
- For discovery: subject = the room (the "thing being searched").

The returned `LoreContext` is rendered into the system prompt as a structured block:

```
World overview: <worldOverview>
Story so far: <storySoFar>
Tag context:
- <tag>: <description>
- <tag>: <description>
```

### Discovery flow (search verb / failed look)

1. Player types `search the dusty corner` or `look pendant` where pendant doesn't exist.
2. Parser produces either `ActionKind.Search { query: "the dusty corner" }` or the `look` action with a no-match outcome.
3. Action handler (or the look-failure path) builds a `DiscoveryRequest` and calls `runDiscovery`.
4. `runDiscovery` builds a prompt with `loreContext`, the room's static description, the visible items/agents, and the player's query. LLM returns `DiscoveryResponse`.
5. Dispatch:
   - Emit a look-style domain event with `narration` as the rendered text.
   - If `spawnedItem`: insert via the builder repo's `upsertItem` (bypassing `requireDraft`, same way `runSpawnTickPass` does for trigger spawns).
   - If `spawnedAgent`: same.
6. The new item or agent is now visible to subsequent ticks. The player can `take` it, examine it again, interact with it.

The discovery budget (`MAX_DISCOVERY_CALLS_PER_TICK = 1`) is enforced in `tick.ts` so a turn that involves search + failed look only calls the LLM once.

### Consequence-engine `storySoFar` update

1. After NPC consequences resolve, the consequence engine's structured output is parsed.
2. If `updatedStorySoFar` is non-null:
   - Read current `world_lore.story_so_far`.
   - Write the new value.
3. Otherwise leave it unchanged.

No diff, no history. The author can edit it back if the LLM produces something they don't like.

## Error handling

- Builder facade returns `Result`. No exceptions cross the seam.
- The discovery LLM call may fail (network, model error). The failure path: emit a generic narration ("You search the dusty corner but find nothing of note.") and continue. The tick is not aborted.
- The consequence engine's `updatedStorySoFar` write failure (e.g. DB error) is logged but the tick proceeds.
- An LLM returning malformed structured output (schema validation failure) is treated as a no-op for discovery and consequence-engine-lore-update.

## Integrity invariants

Continuing the existing invariant set:

1. **Author-edits to lore are draft-only; the consequence engine is the one exception that writes `storySoFar` on live worlds.** The facade's `requireDraft` gate rejects `update_world_lore`, `upsert_tag_lore`, and `delete_tag_lore` against live worlds. The consequence engine's `applyConsequenceLoreUpdate` writes `world_lore.story_so_far` on the live world directly via the port (same intentional bypass that `runSpawnTickPass` uses for spawned agents). `worldOverview` is never updated at runtime — only in the draft.
2. **`world_lore` is one row per world.** `worldId` is the primary key; the row is lazily created.
3. **`(worldId, tag)` is unique in `tag_lore`.** The validator catches duplicates before publish.
4. **Spawned agents from monster templates carry frozen `tags` at spawn time.** Renaming or deleting a template later does not affect already-spawned agents' tags.
5. **Discovery-spawned items/agents are real and persistent.** Once dispatched they appear in the entity tables; they are mechanically indistinguishable from authored or template-spawned entities.
6. **`updatedStorySoFar` overwrites `storySoFar` wholesale when non-null.** No partial merging; the LLM produces the full new value.
7. **Per-tick discovery cap is hard.** A tick can produce at most `MAX_DISCOVERY_CALLS_PER_TICK = 1` discovery LLM call.

## Testing

- `core/lore/context.test.ts` — table-driven. Cases: subject with no tags + no location (returns world slots only); subject with own tags only; subject with location tags only; subject with both; tags without lore contribute nothing.
- `core/builder/validate.test.ts` — `TagLoreTagEmpty` and `TagLoreDuplicate` problem cases.
- `core/engine/discovery.test.ts` — `runDiscovery` with a `FakeLanguageModel`:
  - Returns flavour-only narration (no spawn).
  - Returns narration + spawnedItem.
  - Returns narration + spawnedAgent.
  - LLM error path returns the generic fallback.
- `core/engine/actions/search.test.ts` — the search action handler calls discovery, emits the event, dispatches spawns. Use the `MemoryRepository` + `MemoryBuilderRepository` setup pattern.
- `core/engine/consequences.test.ts` — extended cases: `updatedStorySoFar` flows back into `world_lore`; null leaves it unchanged.
- `core/builder/index.test.ts` — `upsertTagLore` + `getWorldLore` round-trip; live-world rejection.
- One MCP smoke test for the lore tools (matching the existing `src/mcp/server.test.ts` pattern).
- One end-to-end integration test in `tests/integration/`: author lore + tags + a `search` verb, publish, run a tick with `search dusty corner`, assert the discovery pass fires and the response is plumbed correctly.

## Migration

- Drizzle migration creates `world_lore` and `tag_lore`. Adds nullable-with-default `tags` columns to `agents`, `items`, `monster_templates`.
- The seeded burning-district campaign initially has no lore — `getWorldLore` returns defaults, `listTagLore` returns empty. Authors can fill them in via `/admin/<world>/lore`.
