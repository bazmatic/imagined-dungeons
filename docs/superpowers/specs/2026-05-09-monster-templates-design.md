# Monster Templates and Spawning — Design

Status: draft, awaiting user review.

## Goal

Let an author describe *kinds* of creatures (a "goblin", a "guard", a
"giant rat") once, and have the engine spawn concrete instances of them
into live worlds in response to authored triggers — first-entry
populations and event- or judgement-driven ambushes — without
hand-placing every individual agent in the campaign builder.

Templates are authored in drafts (alongside locations, items, and unique
named agents) and are pure structural rules. Spawned agents are ordinary
agents in the existing `agents` table, fully indistinguishable from
hand-authored agents at play time. The engine does not track which
template produced which instance — once a monster is spawned it is just
a regular agent, and dies permanently if killed.

## Scope

In scope for v1:

- A new `monster_templates` table sitting alongside the existing
  authored entities, edited through the campaign builder facade.
  Templates are pure creature definitions (label, descriptions, hp,
  mood, autonomous, starter pack) with no placement information.
- A new `location_spawn_triggers` table, scoped to a parent location,
  that attaches templates to that location and fires either on a
  matching mechanical event (player enters the room, combat starts,
  an item is taken, a phrase is spoken), on an LLM judgement (the
  game agent decides "the room is noisy enough to draw something
  in"), or **at initial publish time** (deterministic placement of
  specific monsters in specific rooms). Each trigger row carries a
  `count` (instances per firing) and an optional `oneShot` flag.
- Spawn execution at two seams:
  - **Initial publish** — fires every trigger whose
    `fireOnInitialPublish` flag is set. Runs ONLY when there is no
    pre-existing live world for the draft, OR when invoked via
    `resetLiveToDraft`. Never runs on re-publish.
  - **Per-tick spawn pass** — fires triggers whose mechanical or
    judgement conditions match. Runs every tick.
- A bounded per-tick spawn cap so a chain of triggers cannot stall a
  player turn.
- A bounded per-tick LLM judgement cap so judgement triggers cannot
  blow the model budget.
- MCP tool exposure of the template/trigger CRUD operations so an AI
  author can build bestiaries.
- The validator gains rules for templates and spawn triggers; publish
  remains the integrity gate.

Out of scope (deferred):

- **Tracking which template produced which agent.** Once spawned, an
  instance is a regular agent. There is no `spawnedFromTemplateId`
  column, no snapshot reconciliation, no refill-on-death.
- **Refilling killed monsters.** A goblin killed by the player is gone
  for the rest of that live world's life. Re-populating the room
  requires a fresh `resetLiveToDraft`.
- **Population-style rules** ("this room always has 1-3 goblins").
  Replaced by a trigger that fires on first player entry. The author
  chooses whether that trigger is one-shot or fires every entry.
- **Re-publication never spawns monsters.** Re-publishing a draft
  does not fire `fireOnInitialPublish` triggers, does not reconcile
  populations, does not insert any agents. Triggers that have
  already fired stay fired across re-publishes; their `firedAt`
  timestamp on the live world is preserved when the live world's
  trigger row is replaced from the draft. Newly-authored triggers
  (added in the draft since last publish) inherit no firing
  history — they will fire at *tick* time on the next qualifying
  event, but not on this re-publish. The author's response to "I
  added a goblin and want it to appear" is `resetLiveToDraft` — a
  full publish-to-replace — not a re-publish.
- A bespoke builder UI for templates. v1 uses the existing JSON-fallback
  editor in the admin tree for "exotic" entity kinds; MCP is the primary
  authoring surface for templates.
- Loot tables, drop tables, monster inventories beyond a flat starting
  item list.
- Monster AI specialisation (custom behaviour trees, faction systems,
  pack behaviour). Spawned agents reuse the existing `npc-mind`
  pipeline.
- Procedural generation (random rooms, random templates). Templates are
  hand-authored; only *instances* are generated.
- Levelling, scaling by player progression, encounter budget systems.
- Despawn/cleanup of stale monsters. v1 leaves dead monsters where they
  fall.

## Decisions (from brainstorming)

1. **Approach 2: sidecar template table, expand-at-tick.** Templates
   live in their own table next to authored entities. Templates are
   *not* participants in the three-way structural merge — they are
   rules, not entities, and conflating the two would force the merge
   machinery to reason about expansion semantics.
2. **Spawn triggers belong to locations, not templates.**
   `MonsterTemplate` is a pure creature definition (what is a goblin),
   reusable across worlds and rooms. *Where* a goblin spawns and
   *when* are properties of the location: each `Location` carries
   zero-or-more `LocationSpawnTrigger`s. Same template reusable across
   rooms with independent firing rules. Matches the engine's existing
   pattern of locations owning their exits and items.
3. **No instance tracking, no refill.** Once a monster is spawned it
   is a normal agent and is no longer associated with the template
   that produced it. If the player kills it, it stays dead. The only
   spawn-related state stored in the live world is "has this trigger
   fired yet?" — a per-trigger `firedAt` timestamp in the
   `world_snapshots` payload.
4. **Initial publish spawns; re-publish does not.** A trigger with
   `fireOnInitialPublish: true` fires deterministically when the
   draft is published into a fresh live world (either no prior live
   world existed, or `resetLiveToDraft` was invoked). On any
   subsequent re-publish the same trigger is a no-op — re-publish
   never inserts agents and never reconciles populations. This
   matches the intuition that re-publish is for incremental edits
   to an in-progress live world, while a full reset is what an
   author does when they want their authoring intent (including new
   monsters) to take effect across the board. Population semantics
   (a room "always has" some monsters when the campaign starts) are
   expressed as a `PlayerEnters` trigger with both
   `fireOnInitialPublish: true` and `oneShot: true`.
5. **Two trigger kinds: mechanical events and LLM judgements.**
   Mechanical triggers pattern-match concrete domain events
   (`PlayerEnters`, `CombatStarts`, `ItemTaken`, `Speech`); these are
   cheap and deterministic. Judgement triggers carry a natural-language
   predicate (e.g. "the room is noisy") that the consequence-engine
   LLM evaluates against the recent event stream for the trigger's
   location; these are expensive but expressive. Both kinds live in
   the same `location_spawn_triggers` table as a discriminated union
   on `kind`. The `fireOnInitialPublish` flag (decision 4) is
   orthogonal to `kind` — any kind can be marked initial-publish.
6. **`TriggerEventKind` initial set: `PlayerEnters`, `CombatStarts`,
   `ItemTaken`, `Speech`, `LlmJudgement`.** Defined as a `const`
   object in `kinds.ts` per the no-string-literals rule. New kinds
   are a one-line addition plus a dispatcher case.
7. **Per-tick spawn cap = 8; per-tick judgement-call cap = 4.**
   Matches the bounded-tick discipline used by `MAX_NPCS_PER_TICK`
   and `MAX_CONSEQUENCE_DEPTH`. Mechanical triggers run first
   (cheap). The judgement-call cap bounds LLM cost per tick; surplus
   eligible judgement triggers are skipped this tick. Initial-publish
   spawns are NOT subject to the per-tick cap — publish is its own
   bounded operation and the author has explicitly authored each
   spawn.
8. **Builder UI deferred.** v1 ships MCP-only authoring for templates
   and triggers. The existing admin tree's JSON-fallback editor is
   sufficient for occasional manual tweaks.

## Architecture

Spawning sits between the builder (where templates are authored) and the
engine (where instances appear). To preserve the hexagonal layering, the
work splits into three pieces:

- **`src/core/builder/`** — extends the builder facade with template
  and trigger CRUD, validation, and trigger-fire-state preservation
  during publish.
- **`src/core/spawning/`** — new pure module containing the expansion
  logic and trigger evaluation. Depends only on the `Repository` port
  and (for the judgement pass) the `LanguageModel` port.
- **`src/core/engine/tick.ts`** — gains a single new pass invoked once
  per tick that calls into `spawning` to materialise pending spawns
  produced by the just-applied events.

```
draft authoring (UI / MCP)
        |
        v
  monster_templates                  (creature definitions)
  locations
    └── location_spawn_triggers      (event-, judgement-, or
                                       initial-publish-driven spawns
                                       per room; one-shot or repeating)
        |
        v
   publish.ts
     ├── INITIAL publish (no prior live world, or resetLiveToDraft):
     │     copy templates + triggers wholesale
     │     fire every trigger with fireOnInitialPublish: true
     │     ──> agents (live)
     │     set firedAt for each fired trigger
     │
     └── RE-publish (live world already exists):
           copy templates + triggers wholesale
           preserve world_snapshots.triggerFireState
           insert NO agents
        |
        v
   tick.ts ── spawn pass ── mechanical match → judgement match →
                            expandSpawn ──> agents (live)
                            update world_snapshots.triggerFireState
```

Adapters (TanStack server functions, MCP tools) gain new entry points
that delegate to the builder facade. No new HTTP routes — the HTTP API
is still deferred per the campaign-builder spec.

## Schema changes

### `monster_templates` (new)

```
monster_templates(
  id text primary key,
  worldId text not null references worlds.id,
  templateKey text not null,           -- author-stable key, e.g. "goblin"
  label text not null,                 -- "goblin", rendered to the player
  shortDescription text not null,
  longDescription text not null,
  hp integer not null,                 -- default starting HP
  mood text,                           -- default starting mood, nullable
  startingItemRefs text not null,      -- JSON: string[] of item template keys
  unique(worldId, templateKey)
)
```

Templates carry no location and no runtime fields beyond starting
defaults. `startingItemRefs` references *item templates* (a separate
concept — items spawned alongside the agent are also expanded at
publish, see §"Item starter packs"). For v1, item refs may be empty;
loot tables are out of scope.

### `location_spawn_triggers` (new)

The single per-location spawn-rule table. Each row says "in this
location, when this thing happens, spawn this many of this template."
Population semantics ("a goblin lair has 3 goblins") are expressed as
a one-shot trigger keyed on `PlayerEnters`.

```
location_spawn_triggers(
  id text not null,                          -- stable trigger id, e.g. "trg_<short>"
  worldId text not null,
  locationId text not null,                  -- where the trigger lives and instances spawn
  templateId text not null references monster_templates.id,
  kind text not null,                        -- TriggerEventKind value
  paramsJson text,                           -- JSON: per-kind config; nullable
  count integer not null default 1,          -- how many instances to spawn per firing
  oneShot integer not null default 0,        -- boolean: fire at most once
  fireOnInitialPublish integer not null default 0,  -- boolean: spawn at initial publish / reset
  primary key (worldId, id)
)
```

There is no `min`/`max` and no `refillOnDeath`. A trigger fires when
either:

- its `kind`-specific dispatcher matches at tick time, or
- it has `fireOnInitialPublish: true` and the publish is an *initial*
  publish (no prior live world, or via `resetLiveToDraft`).

In both cases, if `oneShot` is set the trigger only fires when its
live `firedAt` is null. Each firing inserts `count` agent rows at
`locationId`. After firing, the live row's `firedAt` is updated (see
snapshot below).

The author can express the common cases this way:
- "Goblin lair starts with 3 goblins, no respawn":
  `kind: PlayerEnters, count: 3, oneShot: true,
  fireOnInitialPublish: true`. The 3 goblins materialise at
  initial-publish; the trigger doesn't re-fire if the player walks
  in again.
- "A specific named monster placed at world start":
  `kind: PlayerEnters, count: 1, oneShot: true,
  fireOnInitialPublish: true`, with the template carrying a unique
  name.
- "Random ambush every time you walk in (but not at start)":
  `kind: PlayerEnters, count: 1, oneShot: false,
  fireOnInitialPublish: false`.
- "Something stirs when you make noise": `kind: LlmJudgement,
  paramsJson: {predicate: "the room is noisy"}, count: 1,
  oneShot: false, fireOnInitialPublish: false`.

All kinds are defined in `kinds.ts`:

```
export const TriggerEventKind = {
  PlayerEnters:  'player_enters',
  CombatStarts:  'combat_starts',
  ItemTaken:     'item_taken',
  Speech:        'speech',
  LlmJudgement:  'llm_judgement',
} as const;
export type TriggerEventKind = (typeof TriggerEventKind)[keyof typeof TriggerEventKind];
```

Per-kind `paramsJson` schemas are defined in §"Trigger evaluation".

### `world_snapshots.snapshotJson` (extended shape)

The campaign-builder spec defines `world_snapshots` as one row per
live world with `snapshotJson: CampaignSeedData`. We extend the
snapshot payload (not the column) with a `triggerFireState` field:

```
triggerFireState: {
  byTriggerId: Record<TriggerId, { firedAt: number }>
}
```

If a trigger id is absent from the map, it has never fired. If
present, `firedAt` is the engine timestamp of its first firing.
For `oneShot: true` triggers this gates further firings; for
`oneShot: false` triggers `firedAt` is informational only (records
when the trigger first fired but doesn't gate anything).

Re-publish copies the live world's `triggerFireState` forward
verbatim, then drops entries whose trigger id is no longer present
in the draft. Newly-authored triggers therefore start absent from
the map and fire on the next qualifying tick.

`resetLiveToDraft` clears `triggerFireState` entirely.

Note: the `agents` table is **not** modified. Spawned instances are
just normal agents; nothing in the schema points back at the trigger
or template that produced them.

## Components

### `src/core/spawning/expand.ts` (pure)

```
expandSpawn(args: {
  template: MonsterTemplate
  locationId: LocationId
  count: number
}): AgentInsert[]
```

Pure — takes the template, the destination, and a count, and returns
`count` agent inserts. Each insert lands at `locationId` carrying the
template's narrative fields. New agent ids are minted with a fresh
short suffix per call. There is no per-instance state — once these
rows are inserted into `agents`, the spawning subsystem forgets about
them.

(There is no `reconcile.ts` — the previous design tracked live
instances per rule against a snapshot to support refill semantics.
Refill was cut from scope, so reconciliation is gone with it.)

### `src/core/spawning/triggers.ts` (mostly pure)

```
matchTriggers(args: {
  events: ReadonlyArray<DomainEvent>
  triggers: ReadonlyArray<LocationSpawnTrigger>
  triggerFireState: TriggerFireState
  perception: PerceptionView           // for filter resolution
  llm: LanguageModel | null            // for judgement triggers; nullable
  judgementBudget: number              // remaining LLM calls this tick
}): Promise<TriggerHit[]>
```

Two-pass evaluation:

1. **Mechanical pass (cheap, sync):** for each trigger whose `kind`
   is one of `PlayerEnters` / `CombatStarts` / `ItemTaken` / `Speech`,
   run the per-kind dispatcher against the events. The trigger's
   `locationId` field is the implicit location filter for every kind.
   Skip triggers whose `oneShot` flag is set and whose
   `triggerFireState` shows a prior firing.
2. **Judgement pass (expensive, async):** for each trigger whose kind
   is `LlmJudgement`, only proceed if `judgementBudget > 0` and
   the trigger's `locationId` had any events this tick. Decrement
   budget, prompt the LLM with the recent events scoped to that
   location plus the predicate, and act on a yes/no response. Same
   `oneShot` gating applies.

Mechanical dispatchers:

- `PlayerEnters`: matches `move` events whose actor is the player and
  whose destination equals `trigger.locationId`.
- `CombatStarts`: matches an `attack` event whose target is in
  `trigger.locationId` with no prior combat there in this tick (the
  dispatcher reads a per-tick "combat already started in L" set the
  engine threads through).
- `ItemTaken`: matches `take` events in `trigger.locationId`, filtered
  by `triggerParams.itemTemplateKey` (or any item if omitted).
- `Speech`: matches `speak` events in `trigger.locationId` with
  utterance containing `triggerParams.phrase` (case-insensitive
  substring; v1 keeps it simple).

Dispatchers are routed by a const lookup keyed on `TriggerEventKind`,
not a switch on raw strings.

### `src/core/spawning/tickPass.ts` (pure-ish)

Invoked once per tick after consequences have been resolved but before
narration. Steps:

1. Run `matchTriggers` (mechanical pass) against this tick's events
   using the live world's `location_spawn_triggers` rows. Skip
   triggers whose `oneShot` flag is set and whose
   `triggerFireState[id].firedAt` is non-null.
2. Run the judgement pass over the remaining triggers (kind ===
   `LlmJudgement`), bounded by `MAX_JUDGEMENT_CALLS_PER_TICK = 4`.
3. For each hit, generate `trigger.count` inserts via `expandSpawn`.
4. Cap the combined insert list at `MAX_SPAWNS_PER_TICK = 8`. Surplus
   is *not* queued — it falls out, the next tick re-evaluates from
   live state. (No backlog state to corrupt.)
5. Apply inserts in a single repository write. For every fired
   trigger, update `triggerFireState[id].firedAt = now()`.

Both caps are exported from `src/core/spawning/limits.ts` next to
`MAX_NPCS_PER_TICK`.

### `src/core/builder/` (extended)

New facade methods, all enforcing the `WorldKindMismatch` invariant
from the campaign-builder spec (templates and triggers are authored
on drafts, never live):

- `upsertMonsterTemplate / deleteMonsterTemplate(worldId, input)`.
- `upsertLocationSpawnTrigger / deleteLocationSpawnTrigger(worldId, locationId, input)`.

The location-scoped trigger operations mirror how exits are modelled
today — explicit per-trigger operations rather than replacing the
whole location's payload. This preserves partial-edit capability and
keeps the validator's per-row checks tight.

The publish flow does NOT spawn at publish time. Triggers are
copied wholesale from draft to live, and `triggerFireState` from the
prior live world is preserved (filtered to drop entries whose
trigger id no longer exists in the draft).

`resetLiveToDraft` clears `triggerFireState`. The next qualifying
tick fires every applicable trigger from scratch.

### `src/core/builder/validate.ts` (extended)

New `Problem` codes (added to the const-object registry):

- `TemplateLabelEmpty`, `TemplateHpInvalid`, `TemplateStartingItemMissing`.
- `LocationSpawnTriggerTemplateMissing` — trigger's `templateId`
  doesn't resolve.
- `LocationSpawnTriggerLocationMissing` — trigger's `locationId`
  doesn't resolve.
- `LocationSpawnTriggerCountInvalid` — `count < 1`.
- `LocationSpawnTriggerParamsInvalid` — `paramsJson` fails the
  per-kind schema (e.g. an `LlmJudgement` trigger missing `predicate`).

### MCP server (extended)

New tools (each a thin wrapper over the corresponding builder facade
method):

- `upsert_monster_template`, `delete_monster_template`.
- `upsert_location_spawn_trigger`, `delete_location_spawn_trigger`.
- `list_monster_templates(worldId)`,
  `list_location_spawn_triggers(worldId, locationId?)`.

Inputs use the same shared schemas the facade validates against.
`reset_live_to_draft` remains *not* exposed — same reasoning as the
campaign-builder spec.

### Admin UI (deferred per Decision 8)

Templates and rules surface in the admin tree under a new "Bestiary"
node per world. Editing them in v1 uses the existing JSON-fallback
form; a bespoke form is a later slice.

## Data flow

### Authoring (draft)

1. Author calls `upsert_monster_template` (MCP) or edits via the JSON
   fallback.
2. Builder facade validates and writes to `monster_templates`.
3. Author calls `upsert_location_spawn_trigger(worldId, locationId, ...)`
   to attach a trigger to a location. Population semantics ("3 goblins
   in the lair") are expressed as `kind: PlayerEnters, count: 3,
   oneShot: true`.
4. `validate_world` reports any structural problems (missing template,
   missing location, invalid count, bad trigger params).

### Publish (draft → live)

Publish has two modes — **initial** and **re-publish** — distinguished
by whether a live world already exists for the draft (and not via
`resetLiveToDraft`).

1. Existing structural merge runs (locations, exits, items, agents),
   per the campaign-builder spec. Templates and triggers are also
   stored on the live world (same `worldId` row family) so the tick
   pass can read them at runtime; on each publish, the live world's
   templates and triggers are *replaced wholesale* with copies of the
   draft's. They do not participate in the three-way merge — they
   are authoring artifacts, and gameplay never mutates them.
2. The live world's `triggerFireState` is preserved across the
   replacement, then filtered: any entry whose trigger id is no
   longer in the draft is dropped. Newly-authored triggers therefore
   start with no firing record.
3. **Initial publish only** — for every trigger with
   `fireOnInitialPublish: true`, run `expandSpawn` once and insert
   `count` agents at `locationId`. Set
   `triggerFireState[id].firedAt = now()` for each fired trigger.
   This pass is bounded only by the count of `fireOnInitialPublish`
   triggers in the draft (no per-tick cap; the author has authored
   each spawn explicitly).
4. **Re-publish** — skip step 3 entirely. Insert no agents.
   Re-publish never spawns. The live world's already-spawned
   monsters remain as ordinary agents, untouched.
5. Commit transaction. Publish returns
   `PublishResult { applied, skipped, initialSpawns }` where
   `initialSpawns` is the count of agents inserted by step 3 (zero
   on re-publish).

`resetLiveToDraft` is treated as initial publish for the purposes of
step 3 — `triggerFireState` is cleared first, then every
`fireOnInitialPublish` trigger fires as if from scratch.

### Tick spawn pass

1. After consequences resolve, before narration, `tickPass` runs.
2. Run the mechanical pass over `location_spawn_triggers` rows
   against this tick's events; collect hits.
3. Run the LLM judgement pass over the remaining triggers, bounded by
   `MAX_JUDGEMENT_CALLS_PER_TICK = 4`.
4. For each hit, emit `count` agent inserts via `expandSpawn`. Cap
   the combined insert list at `MAX_SPAWNS_PER_TICK = 8`. Surplus is
   *not* queued — it falls out, the next tick re-evaluates from live
   state.
5. Apply inserts in a single repository write. For each fired
   trigger, set its `triggerFireState[triggerId].firedAt = now()` —
   one-shot triggers will be gated on subsequent ticks.
6. New agents are immediately eligible for the next tick's NPC
   scheduling (but not the *current* tick — they observe their first
   event next round, matching how `npc-mind` already handles
   newly-woken NPCs).
7. Spawn events emitted as `DomainEvent`s of a new
   `EventKind.AgentSpawned` so observers (and the player, if
   co-located) get a narration line.

### Reset live to draft

1. Same destructive flow as the campaign-builder spec.
2. `triggerFireState` is cleared.
3. The next qualifying tick will fire every applicable trigger from
   scratch — including any one-shot triggers whose `firedAt` was
   previously set.

## Trigger evaluation details

Trigger params per kind (TypeScript types; runtime schemas mirror).
The trigger row's own `locationId` field provides the implicit
location filter, so kinds carry only their kind-specific extras:

```
type TriggerParams =
  | { kind: TriggerEventKind.PlayerEnters }
  | { kind: TriggerEventKind.CombatStarts }
  | { kind: TriggerEventKind.ItemTaken; itemTemplateKey?: string }
  | { kind: TriggerEventKind.Speech; phrase: string }
  | { kind: TriggerEventKind.LlmJudgement; predicate: string };
```

`LlmJudgement.predicate` is a short natural-language sentence the
consequence-engine LLM evaluates as true or false against the recent
events scoped to the trigger's location. Examples: "the room is
noisy", "something has been taken from this room", "the player has
lingered here for several turns". The judgement pass batches all
eligible predicates for the same location into a single LLM call.

The dispatcher is a const-object lookup `TriggerDispatchers:
Record<TriggerEventKind, MatchFn>` defined in
`src/core/spawning/triggers.ts`. Mechanical kinds resolve
synchronously; `LlmJudgement` resolves async via a model call.
Adding a new trigger kind is:

1. One entry in `TriggerEventKind`.
2. One typed param variant.
3. One match function (sync or async).

No string-literal switches; no implicit fallthrough.

## Item starter packs

`monster_templates.startingItemRefs` is a JSON array. v1 *defers* item
templates as a first-class concept; each entry is a structural item
seed (label, descriptions, weight, etc.) embedded inline, and the
expander inserts a fresh `items` row owned by the spawned agent for
each entry. Two goblins both carrying a "rusty knife" produce two
distinct knife rows — no item identity is shared.

A proper item-template table is a follow-up slice. The JSON entry
shape is intentionally a tagged object so the follow-up can introduce
a `{ kind: 'templateRef', templateKey }` variant alongside today's
inline `{ kind: 'inline', ...itemFields }` without a column migration.

For v1, the array may be empty, and most templates will leave it that
way; this section exists so the column shape doesn't need to change
when item templates land.

## Error handling

- Builder facade returns `Result`. No exceptions cross the seam.
- Trigger param schema failures are validation `Problem`s, not runtime
  errors — they surface during draft validation, not at tick time.
- Spawn-pass insert failures (e.g. missing location at tick time
  because of unrelated drift) are logged via the existing log infra
  and skipped; the tick proceeds.
- LLM judgement failures (model unavailable, malformed response) are
  logged and treated as "no spawn this tick"; the tick proceeds. The
  trigger remains eligible to fire next tick.
- Publish transaction failures roll back the entire publish, including
  the structural merge — atomicity is preserved.

## Integrity invariants

Continuing the campaign-builder invariant set:

6. **Templates and triggers on live worlds are publish-only writable.**
   Builder facade refuses `upsertMonsterTemplate` /
   `upsertLocationSpawnTrigger` (and their delete counterparts) on a
   `live` world — the only paths that mutate these on a live world
   are `publish` (wholesale replace from draft) and
   `resetLiveToDraft`. Gameplay never reads-then-writes them; the
   tick pass reads them only.
7. **Spawned agents are normal agents.** Once expanded into the
   `agents` table, spawned instances are mechanically identical to
   hand-authored agents. The engine, `npc-mind`, and the perception
   system do not branch on origin. There is no column on `agents`
   pointing at the producing template or trigger.
8. **Killed monsters stay killed.** The engine never refills. A
   monster killed by the player is gone for the rest of that live
   world's life. Re-populating requires `resetLiveToDraft`.
9. **Re-publish never spawns.** Publish into an existing live world
   (i.e. one that already has a `parentDraftId` linkage to the draft
   being published) does not insert into `agents`. Triggers with
   `fireOnInitialPublish: true` are no-ops on re-publish.
10. **Initial publish fires `fireOnInitialPublish` triggers exactly
    once.** The first publish from a draft to a fresh live world, or
    a `resetLiveToDraft`, fires every trigger marked
    `fireOnInitialPublish: true` and records `firedAt`. Because
    `oneShot` is gated by `firedAt`, an initial-publish
    one-shot trigger does not double-fire at tick time on the same
    live world.
11. **One-shot triggers fire at most once per live world.** The
    `firedAt` field in `triggerFireState` is the gate; once set, the
    trigger is ineligible until `resetLiveToDraft` clears it. This
    rule applies uniformly to triggers fired at initial publish and
    triggers fired at tick time.
12. **Per-tick spawn cap is hard.** No backlog persists between ticks —
    the next tick re-evaluates against live state. This makes the cap
    a true bound, not a deferred queue that could grow without bound.
    Initial-publish spawns are NOT subject to this cap (publish is
    its own bounded operation).
13. **Per-tick judgement-call cap is hard.** Same reasoning as #12
    applied to LLM cost. Surplus eligible judgement triggers wait
    until the next tick.

## Testing

- `core/spawning/expand.ts` — table-driven over (template, location,
  count) inputs. Cases: count=1, count=N, ids unique per call.
- `core/spawning/triggers.ts` — one test per `TriggerEventKind`
  covering match, miss, and (where relevant) param-filter cases.
  `LlmJudgement` tested with a fake language model returning
  scripted yes/no; budget exhaustion case also covered.
- `core/spawning/tickPass.ts` — integration with a `MemoryRepository`:
  one-shot trigger fires once and stays gated; non-one-shot trigger
  fires every qualifying tick; spawn cap clips correctly; judgement
  budget clips correctly; no backlog retained.
- `core/builder/validate.ts` — one case per new `Problem` code.
- Publish — integration tests on the DB-backed builder:
  - Initial publish with a `fireOnInitialPublish` trigger inserts
    `count` agents at the trigger's location and records `firedAt`.
  - Re-publish of the same draft into the existing live world
    inserts no new agents — the prior monsters remain (if alive)
    or stay killed (if killed), and the trigger's `firedAt` is
    preserved.
  - Adding a new `fireOnInitialPublish` trigger and re-publishing
    does NOT spawn it (re-publish is a no-op for monsters); a
    subsequent `resetLiveToDraft` does spawn it.
  - Removing a trigger from the draft drops its `triggerFireState`
    entry on re-publish without despawning the agents it produced.
  - `resetLiveToDraft` clears `triggerFireState` and re-fires all
    `fireOnInitialPublish` triggers.
- MCP smoke test gains one case per new tool to verify wiring.
- One end-to-end tick test: a draft with a one-shot `PlayerEnters`
  trigger (no `fireOnInitialPublish`) spawns the goblin when the
  player first walks into the room, and does not produce more
  goblins on a second visit.

## Migration

- Drizzle migration creates `monster_templates` and
  `location_spawn_triggers`. No changes to the `agents` table.
- `world_snapshots.snapshotJson` is a JSON column; the additive
  `triggerFireState` field requires no schema migration. Existing
  snapshots read with `triggerFireState` defaulting to
  `{ byTriggerId: {} }` via a parser default.
- No automatic backfill: the seeded burning-district world has no
  templates or triggers, so no spawn behaviour activates until an
  author introduces some.
