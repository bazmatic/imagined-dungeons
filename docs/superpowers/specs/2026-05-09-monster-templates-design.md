# Monster Templates and Spawning — Design

Status: draft, awaiting user review.

## Goal

Let an author describe *kinds* of creatures (a "goblin", a "guard", a
"giant rat") once, and have the engine spawn concrete instances of them
into live worlds in response to authored rules — population minimums on
locations, refill-on-death, and event-triggered ambushes — without
hand-placing every individual agent in the campaign builder.

Templates are authored in drafts (alongside locations, items, and unique
named agents) and are pure structural rules. Spawned agents are ordinary
agents in the existing `agents` table, fully indistinguishable from
hand-authored agents at play time, and carry a back-reference to the
template that produced them so the engine can run idempotent
re-publication and refill checks.

## Scope

In scope for v1:

- A new `monster_templates` table sitting alongside the existing
  authored entities, edited through the campaign builder facade.
  Templates are pure creature definitions (label, descriptions, hp,
  mood, autonomous, starter pack) with no placement information.
- Two new tables `location_spawn_rules` and `location_spawn_triggers`,
  each scoped to a parent location, that attach templates to that
  location with quantitative constraints (`min`, `max`,
  `refillOnDeath`) for population rules, or per-event firing config
  for triggers.
- Spawn execution at two seams: at publish time (initial population),
  and during ticks via a per-tick spawn pass (refill + triggered
  spawns).
- Idempotent re-publication: republishing a draft does not duplicate
  monsters. Adjusting `min` upward and republishing produces more
  monsters; killing monsters and republishing produces refills.
- A bounded per-tick spawn cap so a chain of triggers cannot stall a
  player turn.
- MCP tool exposure of the template/rule CRUD operations so an AI
  author can build bestiaries.
- The validator gains rules for templates and spawn rules; publish
  remains the integrity gate.

Out of scope (deferred):

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
  fall; refill creates new instances.

## Decisions (from brainstorming)

1. **Approach 2: sidecar template table, expand-on-publish.** Templates
   live in their own table next to authored entities; publish expands
   templates + rules into concrete `agents` rows. Templates are *not*
   participants in the three-way structural merge — they are rules, not
   entities, and conflating the two would force the merge machinery to
   reason about expansion semantics.
2. **Spawn placement and triggers belong to locations, not templates.**
   `MonsterTemplate` is a pure creature definition (what is a goblin),
   reusable across worlds and rooms. *Where* a goblin spawns and *when*
   are properties of the location: each `Location` carries zero-or-more
   `LocationSpawnRule`s (population: "this room has 1–3 goblins") and
   zero-or-more `LocationSpawnTrigger`s ("when the player enters this
   room with combat already underway, spawn 2 more goblins"). Same
   template reusable across rooms with independent counts. Matches the
   engine's existing pattern of locations owning their exits and items.
3. **Re-publish idempotency: snapshot-tracked instance ids per spawn
   rule.** The published snapshot records, per `(locationId, ruleId)`
   pair, the set of agent ids it produced. Per-rule rather than
   per-template because the same room can have multiple rules
   referencing different templates and they need independent
   bookkeeping. Re-publication reconciles against that set: surviving
   instances stay, missing instances (killed in play) are refilled up
   to `min`, and raising `min` causes additional spawns. Lowering `min`
   does *not* cull live monsters — gameplay drift wins, matching the
   rest of the publish merge model.
4. **`TriggerEventKind` initial set: `PlayerEnters`, `CombatStarts`,
   `ItemTaken`, `Speech`.** Defined as a `const` object in `kinds.ts`
   per the no-string-literals rule. New trigger kinds are a one-line
   addition plus a dispatcher case.
5. **Per-tick spawn cap = 8.** Matches the bounded-tick discipline used
   by `MAX_NPCS_PER_TICK` and `MAX_CONSEQUENCE_DEPTH`. Surplus pending
   spawns are deferred to subsequent ticks; spawn order is
   trigger-priority then rule-id stable order.
6. **Builder UI deferred.** v1 ships MCP-only authoring for templates
   and rules. The existing admin tree's JSON-fallback editor is
   sufficient for occasional manual tweaks.

## Architecture

Spawning sits between the builder (where templates are authored) and the
engine (where instances appear). To preserve the hexagonal layering, the
work splits into three pieces:

- **`src/core/builder/`** — extends the builder facade with template
  and spawn-rule CRUD, validation, and the publish-time expansion step.
- **`src/core/spawning/`** — new pure module containing the expansion
  logic, idempotency reconciliation, and trigger evaluation. Depends
  only on the `Repository` port.
- **`src/core/engine/tick.ts`** — gains a single new pass invoked once
  per tick that calls into `spawning` to materialise pending spawns
  produced by the just-applied events.

```
draft authoring (UI / MCP)
        |
        v
  monster_templates                  (creature definitions)
  locations
    └── location_spawn_rules         (population per room per template)
    └── location_spawn_triggers      (event-driven spawns per room)
        |
        v
   publish.ts ── expand rules ──> agents (live)
                     │
                     └── records instance ids per rule in world_snapshots.spawnState
        |
        v
   tick.ts ── spawn pass ── refill / trigger spawns ──> agents (live)
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

### `location_spawn_rules` (new)

Population-style spawns: "this location has 1-3 goblins, refilling on
death." One row per (location, template) is the simplest constraint;
`(worldId, locationId, templateId)` is enforced unique.

```
location_spawn_rules(
  id text not null,                    -- stable rule id, e.g. "rule_<short>"
  worldId text not null,
  locationId text not null,            -- where instances appear
  templateId text not null references monster_templates.id,
  min integer not null default 0,
  max integer not null default 0,
  refillOnDeath integer not null default 1,  -- boolean
  primary key (worldId, id),
  unique (worldId, locationId, templateId)
)
```

Composite primary key matches the campaign-builder convention
(`worldId, id`) so the same rule id can appear in different worlds
without collision. The `(worldId, locationId, templateId)` uniqueness
constraint enforces "one rule per template per location" — multiple
templates per location is fine (a room with goblins and a rat),
multiple rules for the same template in the same location is
rejected by the validator (collapse them into one rule with a wider
`min..max`).

Initial publish spawns `min` instances at `locationId`. Tick refill
tops up to `min` when the population drops below.

### `location_spawn_triggers` (new)

Event-driven spawns: "when the player enters this room, spawn 2
goblins." One row per (location, event-kind, template) combination is
the simplest constraint — an author who wants two different "on
PlayerEnters" rules in the same room with different templates uses two
rows.

```
location_spawn_triggers(
  id text not null,                    -- stable trigger id
  worldId text not null,
  locationId text not null,            -- where the trigger lives and instances spawn
  templateId text not null references monster_templates.id,
  event text not null,                 -- TriggerEventKind value
  triggerParamsJson text,              -- JSON: per-event-kind config; nullable
  min integer not null default 1,      -- spawn count per firing
  max integer not null default 0,      -- lifetime population cap from this trigger; 0 = unlimited
  primary key (worldId, id)
)
```

`max = 0` means no lifetime cap (the trigger keeps firing every time
its event matches, subject only to per-tick spawn caps). `max > 0`
caps the total instances ever produced by this trigger row across all
firings in the live world's lifetime.

`triggerParamsJson` schema is per-kind (see §"Trigger evaluation").
The trigger's `locationId` is implicit context for every event kind;
params carry only the per-kind extras (e.g. `phrase` for `Speech`).
All kinds are defined in `kinds.ts`:

```
export const TriggerEventKind = {
  PlayerEnters:  'player_enters',
  CombatStarts:  'combat_starts',
  ItemTaken:     'item_taken',
  Speech:        'speech',
} as const;
export type TriggerEventKind = (typeof TriggerEventKind)[keyof typeof TriggerEventKind];
```

(There is no longer a `SpawnScope` discriminator — the scope is
implied by which table a row lives in.)

### `agents` (modified)

Add columns:

- `spawnedFromTemplateId`: nullable text references `monster_templates.id`.
  Null for hand-authored agents; set on spawned instances. Indexed.
- `spawnedFromRuleId`: nullable text. References either
  `location_spawn_rules.id` or `location_spawn_triggers.id` —
  application-level union, no FK (both ids share the rule-id
  namespace). Same nullability semantics. Indexed.

These are the back-references the reconciliation step uses to identify
which live agents belong to which rule.

### `world_snapshots.snapshotJson` (extended shape)

The campaign-builder spec defines `world_snapshots` as one row per live
world with `snapshotJson: CampaignSeedData`. We extend the snapshot
payload (not the column) with a `spawnState` field:

```
spawnState: {
  byRuleId: Record<RuleId, { instanceIds: AgentId[] }>
}
```

`instanceIds` is the set of agent ids the rule has produced (across all
publishes and trigger firings). The reconciliation pass treats this as
the source of truth for "what this rule has already done."

## Components

### `src/core/spawning/expand.ts` (pure)

```
expandSpawn(args: {
  ruleId: string                     // location_spawn_rules.id or location_spawn_triggers.id
  templateId: MonsterTemplateId
  template: MonsterTemplate
  locationId: LocationId
  existingInstanceIds: AgentId[]     // from snapshot, scoped to this rule
  liveAgents: ReadonlyArray<Agent>   // current live agent rows
  desiredCount: number               // rule.min for population; rule.min for a trigger firing
}): {
  toInsert: AgentInsert[]
  newInstanceIds: AgentId[]
}
```

Pure — takes the current state and computes what to insert. Does not
write. Surviving instance ids are filtered against `liveAgents`; the
gap between surviving count and `desiredCount` is filled with new
inserts. Each insert lands at `locationId` carrying
`spawnedFromTemplateId = templateId` and `spawnedFromRuleId = ruleId`.

### `src/core/spawning/reconcile.ts` (pure)

Given the draft's templates, the per-location spawn rules, and the
current live state, computes the spawn deltas to apply at the end of
publish. One reconciliation per `location_spawn_rules` row:

- Compute surviving `instanceIds` (intersection of snapshot
  `instanceIds` with live `agents`).
- Target population: `rule.min`.
- Emit inserts to fill the gap, plus the updated `instanceIds` to
  write back into `spawnState`.

`location_spawn_triggers` rows are *not* reconciled at publish time —
they fire from tick events. Publish records each trigger row with an
empty instance set in `spawnState`.

### `src/core/spawning/triggers.ts` (pure)

```
matchTriggers(args: {
  events: ReadonlyArray<DomainEvent>
  triggers: ReadonlyArray<LocationSpawnTrigger>
  perception: PerceptionView   // for filter resolution
}): TriggerHit[]
```

Pattern-matches the tick's events against `location_spawn_triggers`
rows. Each `TriggerEventKind` has a small dispatcher; the trigger's
`locationId` field is the implicit location filter for every kind:

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

1. Run `matchTriggers` against this tick's events using the live
   world's `location_spawn_triggers` rows.
2. For each hit, check `existingInstanceIds.length < trigger.max` (or
   `trigger.max === 0` meaning unlimited). If room remains, generate
   up to `trigger.min` (per-firing batch) inserts via `expandSpawn`.
3. For every `location_spawn_rules` row, check current population at
   the rule's location vs. `rule.min`. If under and `refillOnDeath`
   is true, generate top-up inserts.
4. Cap the combined insert list at `MAX_SPAWNS_PER_TICK = 8`. Surplus
   is *not* queued — it falls out, the next tick re-evaluates from
   live state. (No backlog state to corrupt.)
5. Apply inserts in a single repository write; update `spawnState`.

The cap is exported from `src/core/spawning/limits.ts` next to
`MAX_NPCS_PER_TICK`.

### `src/core/builder/` (extended)

New facade methods, all enforcing the `WorldKindMismatch` invariant
from the campaign-builder spec (templates and rules are authored on
drafts, never live):

- `upsertMonsterTemplate / deleteMonsterTemplate(worldId, input)`.
- `upsertLocationSpawnRule / deleteLocationSpawnRule(worldId, locationId, input)`.
- `upsertLocationSpawnTrigger / deleteLocationSpawnTrigger(worldId, locationId, input)`.

The location-scoped operations mirror how exits are modelled today —
explicit per-rule operations rather than replacing the whole
location's payload. This preserves partial-edit capability and keeps
the validator's per-row checks tight.

The publish flow gains a final phase: after the structural merge
commits, run `reconcile` for every `location_spawn_rules` row in the
draft, apply the resulting inserts, and persist `spawnState`. All
within the same SQLite transaction as the structural merge.

`resetLiveToDraft` clears `spawnState` and runs reconciliation from
scratch.

### `src/core/builder/validate.ts` (extended)

New `Problem` codes (added to the const-object registry):

- `TemplateLabelEmpty`, `TemplateHpInvalid`, `TemplateStartingItemMissing`.
- `LocationSpawnRuleTemplateMissing` — rule's `templateId` doesn't
  resolve to any template in the draft.
- `LocationSpawnRuleLocationMissing` — rule's `locationId` doesn't
  resolve. (Should be unreachable when rules are authored through the
  facade, since the facade requires a parent location, but defensive
  for direct DB edits.)
- `LocationSpawnRuleDuplicate` — two rules with the same
  `(locationId, templateId)` exist; collapse them.
- `LocationSpawnRuleBoundsInvalid` — `min < 0`, `max < min`, or
  `max == 0` (zero-population rules are deletes, not zero rules).
- `LocationSpawnTriggerTemplateMissing` — trigger's `templateId`
  doesn't resolve.
- `LocationSpawnTriggerLocationMissing` — trigger's `locationId`
  doesn't resolve.
- `LocationSpawnTriggerBoundsInvalid` — `min < 1`, or `max < 0`.
- `LocationSpawnTriggerParamsInvalid` — `triggerParamsJson` fails the
  per-kind schema.

### MCP server (extended)

New tools (each a thin wrapper over the corresponding builder facade
method):

- `upsert_monster_template`, `delete_monster_template`.
- `upsert_location_spawn_rule`, `delete_location_spawn_rule`.
- `upsert_location_spawn_trigger`, `delete_location_spawn_trigger`.
- `list_monster_templates(worldId)`,
  `list_location_spawn_rules(worldId, locationId?)`,
  `list_location_spawn_triggers(worldId, locationId?)`.

Inputs use the same shared schemas the facade validates against.
`reset_live_to_draft` remains *not* exposed — same reasoning as the
campaign-builder spec.

### Admin UI (deferred per Decision 6)

Templates and rules surface in the admin tree under a new "Bestiary"
node per world. Editing them in v1 uses the existing JSON-fallback
form; a bespoke form is a later slice.

## Data flow

### Authoring (draft)

1. Author calls `upsert_monster_template` (MCP) or edits via the JSON
   fallback.
2. Builder facade validates and writes to `monster_templates`.
3. Author calls `upsert_location_spawn_rule(worldId, locationId, ...)`
   to populate a room with monsters, and/or
   `upsert_location_spawn_trigger(worldId, locationId, ...)` to attach
   event-driven spawns.
4. `validate_world` reports any structural problems (missing template,
   missing location, duplicate rule, invalid bounds, bad trigger
   params).

### Publish (draft → live)

1. Existing structural merge runs (locations, exits, items, agents),
   per the campaign-builder spec. Templates and rules are also stored
   on the live world (same `worldId` row family) so the tick pass can
   read them at runtime; on each publish, the live world's templates
   and rules are *replaced wholesale* with copies of the draft's. They
   do not participate in the three-way merge — they are authoring
   artifacts, and gameplay never mutates them. The wholesale-replace
   is therefore lossless.
2. After the structural merge commits its plan but inside the same
   transaction:
   a. For each `location_spawn_rules` row in the draft, fetch
      `spawnState.byRuleId[rule.id]?.instanceIds ?? []`.
   b. Filter against current live agents (some may have been killed
      between publishes).
   c. Top up to `rule.min` via `expandSpawn`.
   d. For each `location_spawn_triggers` row in the draft, no inserts
      at publish time — the trigger is just registered with an empty
      instance set in `spawnState`.
   e. Update `spawnState.byRuleId[rule.id].instanceIds` with the union
      of survivors and new inserts.
3. Rules, triggers, and templates removed in the draft: live rows are
   deleted; their `spawnState` entries are dropped; their existing
   live instances are *not* despawned (gameplay drift wins, mirroring
   the structural merge's delete-with-drift skip).
4. Commit transaction. Publish returns `PublishResult { applied,
   skipped, spawned }` where `spawned` is the per-rule counts of new
   instances created.

### Tick spawn pass

1. After consequences resolve, before narration, `tickPass` runs.
2. Trigger hits and refill needs collected; capped at 8 inserts.
3. Inserts applied; `spawnState` updated; new agents are immediately
   eligible for the next tick's NPC scheduling (but not the *current*
   tick — they observe their first event next round, matching how
   `npc-mind` already handles newly-woken NPCs).
4. Spawn events emitted as `DomainEvent`s of a new
   `EventKind.AgentSpawned` so observers (and the player, if
   co-located) get a narration line.

### Reset live to draft

1. Same destructive flow as the campaign-builder spec.
2. `spawnState` is cleared.
3. Reconciliation runs from scratch — every `location_spawn_rules`
   row spawns its `min` population at its `locationId`.
   `location_spawn_triggers` rows have empty instance sets.

## Trigger evaluation details

Trigger params per kind (TypeScript types; runtime schemas mirror).
The trigger row's own `locationId` field provides the implicit
location filter, so kinds carry only their kind-specific extras:

```
type TriggerParams =
  | { kind: TriggerEventKind.PlayerEnters }
  | { kind: TriggerEventKind.CombatStarts }
  | { kind: TriggerEventKind.ItemTaken; itemTemplateKey?: string }
  | { kind: TriggerEventKind.Speech; phrase: string };
```

The dispatcher is a const-object lookup `TriggerDispatchers:
Record<TriggerEventKind, MatchFn>` defined in
`src/core/spawning/triggers.ts`. Adding a new trigger kind is:

1. One entry in `TriggerEventKind`.
2. One typed param variant.
3. One match function.

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
- Reconciliation transaction failures roll back the entire publish,
  including the structural merge — atomicity is preserved.

## Integrity invariants

Continuing the campaign-builder invariant set:

6. **Templates, spawn rules, and triggers on live worlds are
   publish-only writable.** Builder facade refuses
   `upsertMonsterTemplate` / `upsertLocationSpawnRule` /
   `upsertLocationSpawnTrigger` (and their delete counterparts) on a
   `live` world — the only paths that mutate these on a live world
   are `publish` (wholesale replace from draft) and
   `resetLiveToDraft`. Gameplay never reads-then-writes them; the
   tick pass reads them only.
7. **Spawned agents are normal agents.** Once expanded into the
   `agents` table, spawned instances are mechanically identical to
   hand-authored agents. The engine, `npc-mind`, and the perception
   system do not branch on `spawnedFromTemplateId`. The column exists
   solely for the publish reconciliation step.
8. **Killed monsters stay killed within a publish window.** The
   reconciliation step considers an instance "alive" iff it appears in
   the live `agents` table with `hp > 0`. Killed monsters are not
   despawned (their corpses remain), but they *are* refilled by the
   tick refill pass and on the next publish. Lowering `min` does not
   cull live monsters.
9. **Trigger spawns respect `max` across all firings.** A
   `location_spawn_triggers` row with `min = 2, max = 6` spawns at
   most 6 instances total over its lifetime in a given live world;
   further firings are no-ops once the snapshot's `instanceIds` for
   that trigger reaches `max`. `max = 0` means unlimited firings
   (subject to the per-tick cap and population-rule constraints
   elsewhere).
10. **Per-tick spawn cap is hard.** No backlog persists between ticks —
    the next tick re-evaluates against live state. This makes the cap
    a true bound, not a deferred queue that could grow without bound.

## Testing

- `core/spawning/expand.ts` — table-driven over (existing instance ids
  set, live agents set, desired count) inputs. Cases: cold-start
  spawn, full survivors, partial survivors, over-population on `min`
  reduction (no cull).
- `core/spawning/triggers.ts` — one test per `TriggerEventKind`
  covering the match + miss + filter cases.
- `core/spawning/tickPass.ts` — integration with a `MemoryRepository`:
  trigger fires, refill fires, cap clips correctly, no backlog
  retained.
- `core/builder/validate.ts` — one case per new `Problem` code.
- Publish reconciliation — integration tests on the DB-backed builder:
  initial publish creates `min` instances; republish with survivors
  preserves them; raise `min` and republish spawns more; lower `min`
  does not cull; killed monster refilled on republish.
- MCP smoke test gains one case per new tool to verify wiring.
- One end-to-end tick test: a draft with a `PlayerEnters`
  `location_spawn_triggers` row spawns the goblin when the player
  walks into the room, and the spawn event surfaces in narration.

## Migration

- Drizzle migration creates `monster_templates`,
  `location_spawn_rules`, and `location_spawn_triggers`; adds
  `spawnedFromTemplateId` and `spawnedFromRuleId` to `agents` (both
  nullable). Existing rows migrate with both columns null.
- `world_snapshots.snapshotJson` is a JSON column; the additive
  `spawnState` field requires no schema migration. Existing snapshots
  read with `spawnState` defaulting to `{ byRuleId: {} }` via a
  parser default.
- No automatic backfill: the seeded burning-district world has no
  templates or rules, so no spawn behaviour activates until an author
  introduces some.
