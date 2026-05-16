# Consequence Engine

The consequence engine is a post-hoc world mutation system that infers durable changes to the game world from events. After player and NPC actions resolve, the engine asks an LLM whether anything in the world should *permanently* change: descriptions updated, items revealed, new locations or entities created, or old ones deleted.

## Mental Model

Most game state is either recomputed each turn (who is in the room, NPC positions) or updated deterministically by action handlers (HP, inventory, locks). The consequence engine handles a third category: **durable atmospheric and structural changes** that no action handler can predict in advance.

- A fight leaves scorch marks on the wall → `update_description` on the location
- A hidden compartment is triggered by a lever → `reveal_item`  
- A blast opens a passage to a new area → `create_location` + `create_exit`
- A merchant arrives after hearing rumors → `create_agent`
- A bridge collapses → `delete_entity`

These are things only an LLM can decide contextually. The engine runs them through a structured prompt and applies the results.

## When It Runs

The engine runs **twice per tick** inside `runConsequencePass()` ([tick.ts](src/core/engine/tick.ts)):

1. **Depth 0** — after the player's action resolves, over player-generated events only
2. **Depth 1** — after all NPC actions resolve, over new NPC-generated events only

A hard cap of `MAX_CONSEQUENCE_DEPTH = 1` prevents cascading: consequences can't trigger more consequences.

## Data Flow

```
Events (from player/NPC actions)
    ↓
consequencesFor(events, repo, llm)
    ├── buildUserPrompt() — summarizes events + entity state + GM notes
    ├── llm.complete() — structured output against CONSEQUENCE_SCHEMA
    ├── parseResponse() — validates and drops malformed entries
    ├── applyWorldExpansion() — executes create/delete immediately via builderRepo
    └── returns [update_description, reveal_item] Actions
    ↓
dispatch(action, repo) for each Action
    ↓
New DomainEvents (DescriptionUpdated, Reveal)
```

## Consequence Kinds

All seven kinds are defined in [consequences.ts](src/core/engine/consequences.ts).

### `update_description`
Patches stored descriptions and mood on a location, item, or agent.

```ts
{
  kind: 'update_description',
  targetKind: 'location' | 'item' | 'agent',
  targetRef: string,           // natural-language name, resolved by the engine
  shortDescription: string | null,
  longDescription: string | null,
  mood: string | null,         // agents only
  shortTermIntent: string | null,  // always null from consequences
}
```

`targetRef` is a fuzzy natural-language name (e.g. `"the scorched wall"`) that the engine resolves to an actual entity ID. The LLM is never given raw IDs to generate.

`shortTermIntent` is agent-owned state; the consequence engine sets it to `null` to signal no override.

### `reveal_item`
Flips a hidden item to visible.

```ts
{ kind: 'reveal_item', targetRef: string }
```

This is idempotent — no-op if the item is already visible.

### `create_location`
Creates a new persistent location.

```ts
{
  kind: 'create_location',
  id: string,           // snake_case, prefix loc_
  label: string,
  shortDescription: string,
  longDescription: string,
  secretDescription: string,   // GM-only, never shown to player or NPC
  tags: string[],
}
```

### `create_exit`
Connects two locations.

```ts
{
  kind: 'create_exit',
  id: string,           // snake_case, prefix exit_
  from: string,
  to: string | null,    // null = procedurally generated destination
  direction: string,
  label: string,
  locked: boolean,
}
```

Exits are validated in Step 3 of world expansion — both endpoints must exist (either newly created in the same batch or already in the world). Exits with missing endpoints are silently dropped.

### `create_agent`
Spawns NPCs from an existing monster template.

```ts
{
  kind: 'create_agent',
  templateKey: string,
  locationId: string,
  count: number,
}
```

The template must already exist in the world. `expandSpawn()` is called to generate full agent state from the template.

### `create_item`
Creates a new persistent item.

```ts
{
  kind: 'create_item',
  id: string,           // snake_case, prefix item_
  label: string,
  shortDescription: string,
  longDescription: string,
  ownerKind: 'location' | 'agent',
  ownerId: string,
  weight: number,
  hidden: boolean,
  tags: string[],
}
```

### `delete_entity`
Removes an entity from the world permanently.

```ts
{
  kind: 'delete_entity',
  targetKind: 'location' | 'exit' | 'agent' | 'item',
  entityId: string,
}
```

Safety: the engine refuses to delete the player's current location.

## World Expansion

`create_*` and `delete_entity` consequences are not returned as `Action` objects — they're executed immediately as side effects inside `applyWorldExpansion()` ([consequences.ts](src/core/engine/consequences.ts)), in this order:

1. Create locations
2. Create items and agents
3. Create exits (validates both endpoints exist)
4. Delete entities (skips player's current location)

This ordering matters: an exit can reference a location created in the same batch.

Only `update_description` and `reveal_item` are returned as `Action` objects to be dispatched through the normal action/event pipeline, producing `DescriptionUpdated` and `Reveal` events.

## LLM Guidance: When to Emit Consequences

The system prompt (`SYSTEM_PROMPT_LINES` in [consequences.ts](src/core/engine/consequences.ts)) instructs the LLM to be conservative:

**Emit when:**
- The change is durable (scars, destruction, permanent shifts in relationship)
- The change flows naturally from what just happened
- A GM would write it into the game world

**Don't emit when:**
- The action is routine (movement, looking, inventory checks, speech that doesn't damage)
- The change is transient (mood during perception, who is currently in the room)
- You'd have to invent a reason

**Agent mood updates** are a special case — the engine updates mood after combat (fearful, defiant, angry) or emotionally significant events (melancholy, warmer), but not for routine interactions.

**GM-only notes** (`secretDescription` on locations) are visible to the engine but never to the player, narrator, or NPC minds. The engine uses them to inform world changes — for example, revealing a hidden item when an event triggers its discovery condition — without echoing them verbatim.

## Schema and Limits

The LLM response is validated against `CONSEQUENCE_SCHEMA` (JSON Schema with `additionalProperties: false`). The schema enforces:

- Maximum 5 consequences per pass (`maxItems: 5`)
- Each consequence is a discriminated union on `kind`
- All required fields must be present

`parseResponse()` drops malformed entries with a warning and retains valid ones. The engine degrades gracefully rather than failing the whole pass.

The system prompt also asks the LLM to limit world expansion to ≤3 create/delete per batch, though this is guidance rather than a hard code constraint.

## Relationship to the Action/Event System

Consequences plug into the same dispatch registry as player and NPC actions ([registry.ts](src/core/engine/actions/registry.ts)). The handlers are:

- `handleUpdateDescription()` in [update-description.ts](src/core/engine/actions/update-description.ts) — patches entity, emits `DescriptionUpdated`
- `handleRevealItem()` in [reveal-item.ts](src/core/engine/actions/reveal-item.ts) — flips `hidden`, emits `Reveal`

The resulting events are witnessed by co-located agents and feed back into NPC cognition on the next tick — so a consequence that updates a location's description becomes part of what the agents at that location perceive.

## Story Continuity

The LLM response also carries an `updatedStorySoFar` field. If non-null, it's written to world lore via `builderRepo` as a running campaign narrative. This gives the engine a way to accumulate story context across many turns without bloating the event log.
