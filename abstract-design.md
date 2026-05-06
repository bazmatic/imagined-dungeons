# Imagine Dungeons — Abstract Design

A tech-agnostic specification for a generative, multi-agent text adventure system.

---

## 1. Core Premise

The system simulates a small world inhabited by characters (some human-controlled, some AI-controlled) who perceive, act, and are acted upon. The world's *structure* is stored as data; the world's *behavior* and much of its *narration* are produced by a language model. The goal is emergent, coherent play — not branching pre-written content.

---

## 2. The Three Layers

### 2.1 World State (deterministic, persistent)
A graph of typed entities with relationships, plus stored descriptive prose for entities. This is the ground truth. It must be queryable, mutable through well-defined operations, and survive restarts.

### 2.2 Reasoning (generative, ephemeral)
A language model acts as interpreter, decision-maker, and consequence engine. It never mutates state directly — it *proposes structured actions*, which the system validates and applies.

### 2.3 Narration (mostly mechanical, occasionally generative)
Most narration is **mechanical**: rendered from stored data via templates. "You see a sword and a lantern here. Exits: north, east. Aragorn is here." That's a list, not a story — no model needed.

A language model is reserved for the moments where prose actually matters: narrating *novel events* (combat, dialogue, dramatic action) and *proposing description updates* when the world changes durably (a room set on fire, a door now splintered).

The split matters: state is small and consistent; mechanical narration is fast and free; the model is the expensive layer reserved for moments of genuine novelty. Some model output is disposable (event narration to a specific observer in the moment), some is durable (description updates committed back to entity records).

---

## 3. Entities

Minimum viable ontology:

| Entity | Purpose | Key fields |
|---|---|---|
| **Location** | A place | id, label, short description, long description, structural notes, relationships to contained entities |
| **Exit** | A directed edge between locations | from, to, direction, short/long description, hidden, locked |
| **Item** | A thing | id, label, short/long description, owner (location \| agent \| item), capacity, weight, hidden |
| **Agent** | A character (player or NPC) | id, label, short/long description, location, inventory, stats, personality fields, autonomous flag |
| **Event** | A record of something that happened | id, actor, location, action, arguments, output text (narrated), witnesses, timestamp |

Three principles:

- **Ownership is polymorphic but exclusive.** An item is in exactly one place — a location, an agent, or another item. Containers fall out of this naturally.
- **Agents are not special.** Players and NPCs share the same schema. The only difference is where their commands come from.
- **Events are append-only.** History is the substrate everything else reasons over. Never mutate, never delete.

Personality fields on agents (mood, current intent, long-term goal, backstory) are just text. They are read by the model, not interpreted by code.

Descriptive fields on entities (short/long description) are also text. They are the canonical answer to "what does this look like right now?" They can be updated, but only through the action vocabulary.

---

## 4. The Action Vocabulary

A small, closed set of structured actions. Every actor — player, NPC, or the world itself — speaks only this vocabulary.

Suggested minimum:
- `move(direction)`
- `look(target?)`
- `take(item)` / `drop(item)` / `give(item, agent)`
- `speak(target, utterance)`
- `attack(agent)`
- `use(item, target?)`
- `search(target)`
- `update_self(mood?, intent?)` — for NPCs to express internal change
- `update_description(entity_id, short?, long?)` — for the Narrator to mutate stored descriptions when the world changes

Two design rules:

- **Closed set.** The model proposes calls into this vocabulary; it cannot invent new verbs. This is what keeps the simulation tractable.
- **Validated and applied by deterministic code.** The model says "take the lantern"; code checks the lantern is reachable, transfers ownership, emits an event. The model never writes to the database directly.

---

## 5. The Core Loop

```
        ┌──────────────────────────────────────┐
        │  Input arrives (player or NPC turn)  │
        └────────────────┬─────────────────────┘
                         ▼
        ┌──────────────────────────────────────┐
        │  Interpret: text → action calls      │  (model)
        └────────────────┬─────────────────────┘
                         ▼
        ┌──────────────────────────────────────┐
        │  Validate & apply each action        │  (code)
        │  Emit events                         │
        └────────────────┬─────────────────────┘
                         ▼
        ┌──────────────────────────────────────┐
        │  Decide consequent events            │  (model)
        │  e.g. reveal, spawn, mood shift,     │
        │  description updates                 │
        └────────────────┬─────────────────────┘
                         ▼
        ┌──────────────────────────────────────┐
        │  Autonomous NPCs take their turns    │  (model, recursive)
        └────────────────┬─────────────────────┘
                         ▼
        ┌──────────────────────────────────────┐
        │  Narrate events to each witness      │  (model, per observer)
        └──────────────────────────────────────┘
```

Three model passes per turn: **interpret**, **consequences**, **narrate**. NPC turns re-enter at "interpret" with the model standing in for the player.

A turn ends when no further actions are pending and all witnesses have been narrated to.

---

## 6. Looking, Witnessing, and Narration

Three distinct concerns, often conflated. The first two are mechanical; only the third is generative.

### 6.1 Looking at entities (mechanical)
When an agent looks at a location, item, exit, or another agent, the system serves the **stored description** for that entity. No model call. Fast, deterministic, consistent across observers (modulo perceptibility — hidden items remain hidden).

### 6.2 Mechanical event descriptions (mechanical)
Most events have an obvious, structured form and are rendered by templates from event data:

- "Paff went north."
- "A goblin entered from the east."
- "Aragorn dropped the lantern."
- "You see: a sword, a lantern, a tattered map."
- "Exits: north (a wooden door), east, down (a narrow staircase)."
- "Also here: Aragorn, a goblin."

These descriptions are produced by deterministic code from stored fields. No model is involved. The vast majority of what a player reads during routine play is mechanical.

### 6.3 Narrated events (generative)
Some events warrant prose: combat blows, spoken dialogue, dramatic actions, moments where *how* it happened matters more than the bare fact. For these, a model renders an observer-specific narration, conditioned on:

- what that witness can perceive (line of sight, hidden items, language barriers)
- what they already know (their event history)
- who they are (personality, current mood)

The narrated `output_text` is stored on the event, so it becomes part of the historical record the model reasons over later. Witnessing is the part of the system where two characters can legitimately experience the same moment differently.

Whether an event is mechanically rendered or model-narrated is a property of the action type, not a per-event decision. `move` and `drop` are mechanical; `attack` and `speak` are narrated. Keep the boundary clear.

### 6.4 Descriptions can change
Stored descriptions are not immutable. The Narrator (or the consequence engine) may decide that a recent event has changed how an entity should be described — a room that has been set on fire, a sword now stained with blood, an NPC visibly wounded — and propose an `update_description` action. The action is validated and applied like any other; the new description becomes the canonical answer to "look" from that point on.

This is what gives the world durable visual evolution without pretending every "look" needs a fresh model call.

---

## 7. Autonomous Agents

An NPC marked `autonomous` runs through the same loop as a player, but its input comes from a model call seeded with:

- its personality, mood, intent, goal
- its current location and what it perceives there
- its memory of recent events (see §8)
- its inventory

The model returns a natural-language intention ("I want to put out the fire"), which is then passed through the same interpret step as a player command. NPCs are not special-cased; they are players whose hands are held by a model.

**Activation** is gated. Not every NPC acts every turn — there's a cheap check (impact heuristic, proximity, or simple scheduling) to decide who's "live" this tick. This keeps cost bounded as the world grows.

---

## 8. Agent Memory

Every agent — player or NPC — has a **memory**: a recent-events log of things they were able to perceive. This memory is the primary context fed into any model call made *on that agent's behalf* (NPC decision-making, observer-specific event narration, anything that asks "what does this character think is going on?").

Three rules:

- **Memory is per-agent and perception-gated.** An event enters an agent's memory only if the agent could perceive it: they were a witness, the event happened in a place they could see/hear, the actor wasn't hidden from them, and so on. Events outside their perception simply don't exist for them.
- **Memory derives from the global event log.** The append-only event log is the source of truth; an agent's memory is a filtered, ordered view of it. Memory doesn't need its own storage — it can be computed from `events WHERE this_agent ∈ witnesses`, possibly cached.
- **Memory is bounded.** Only the recent slice is fed to the model. How "recent" is tunable — last N events, last T minutes of game time, or summary-plus-tail. Older memory can be compressed (a model-generated summary stored on the agent) so that long-lived NPCs don't grow unbounded context.

This is what gives the world coherent perspectives. An NPC who didn't see the player steal the lantern doesn't know it's gone. A character who was unconscious during a fight has no memory of it. Two NPCs in the same room can disagree about what just happened because each one's memory is filtered through their own perception.

It also makes the model calls themselves cleaner: you don't pass "the whole world" to the NPC mind — you pass *what this character knows*, which is a far smaller, more relevant prompt.

---

## 9. Consequences

After an action resolves, a dedicated model pass asks: *given what just happened, what should the world do?* Its output is more action calls — issued by "the world" rather than any agent. Examples:

- a hidden item becomes visible after a search
- a creature spawns in response to noise
- a door unlocks because someone pulled the right lever
- an NPC's mood shifts because they witnessed violence
- a location's description is updated to reflect new damage, weather, or aftermath

This is the system's narrative pressure. Without it, the world is inert; with it, actions have weight.

Consequences must terminate. Cap recursion depth or require each consequent pass to strictly reduce some "pending impact" budget.

---

## 10. The Model Roles, Made Explicit

| Role | Input | Output | Frequency |
|---|---|---|---|
| **Interpreter** | natural-language command + actor's memory + immediate context | structured action calls | once per actor turn |
| **Consequence engine** | recent global events + location state | structured action calls (issued by "the world", may include description updates) | once per resolved action batch |
| **Narrator** | event + observer's memory + observer context | prose (stored on event); optionally proposes description updates | only for action types flagged as narrated; mechanical events skip this entirely |
| **NPC mind** *(special case of interpreter)* | NPC's personality + memory + perceived surroundings | natural-language intent | once per autonomous tick |

All roles can be the same model behind the same interface; they differ only in prompt and expected output shape. A clean implementation has one `LanguageModel` interface with these methods, swappable per provider.


## 11. Interface

A single command endpoint is sufficient: `submit(actor_id, text) → events[]`. Everything else (entity lookups, world inspection) is read-only convenience.

Clients are dumb terminals. They send text, receive narrated events, render them. A client written in any language with an HTTP library is enough. Real-time presence (multiplayer, live NPC ticks) is a transport concern, not a model concern — add streaming when needed.

---

## 12. Implementation-Independent Constraints

- **Determinism where possible.** State transitions, validation, and event emission must be reproducible given the same inputs. Only the model calls are nondeterministic.
- **Append-only history.** Events are the audit log and the substrate from which agent memory is derived. Never edit them.
- **Perception-gated memory.** Each agent sees only what they could perceive. Model calls made on an agent's behalf are conditioned on that agent's memory, never on the global event log directly.
- **Closed action vocabulary.** Resist the urge to let the model "do anything." The vocabulary is the contract.
- **Mechanical by default, generative by exception.** Looking at things returns stored prose. Most events are rendered from templates. The model is invoked only for action types that warrant prose (combat, dialogue, dramatic action) and for description updates after meaningful change.
- **Observer-relative event narration.** When an event *is* model-narrated, two witnesses get two narrations. Entity descriptions and mechanical event renderings, by contrast, are shared (modulo perceptibility).
- **Bounded model usage per turn.** Cap interpreter retries, consequence depth, and active NPC count. Cost and latency must be predictable.

---

## 13. What This Buys You

- A small codebase. Most "content" lives in prompts and the database; the engine is a few thousand lines.
- Emergent behavior without scripting. You get story by running the simulation, not by writing one.
- Provider independence. Swap models or providers behind the `LanguageModel` interface.
- Symmetric extensibility. Adding a verb adds it for players, NPCs, and the world simultaneously.
- Cheap routine play, expensive only at moments of change. Looks are free, movement and inventory shuffling are free, lists of exits and contents are free. The model is reserved for combat, dialogue, dramatic moments, and durable description changes — where it earns its keep.

---

## 14. What to Build First

A minimum viable slice, in order:

1. Entities + ownership + a single location with an exit and an item. Stored descriptions on each.
2. Action vocabulary: `move`, `look`, `take`, `drop`. Apply deterministically. Mechanical templates render `look`, movement, inventory changes, and lists of contents/exits. No model anywhere yet — the game is fully playable as a classic text adventure.
3. Event log. Every action emits a structured event with a templated description.
4. Interpreter pass: free-text → action calls. Now the player types naturally; the world's output is still mechanical.
5. Add narrated action types (e.g. `speak`, `attack`). Wire the Narrator in for *those events only*. Everything else stays mechanical.
6. One autonomous NPC in the room. Same interpreter, model-generated input.
7. Consequence pass, including `update_description`. Now actions have ripples and the world visibly evolves.
8. Everything else (combat stats, containers, hidden things, locks) is just more entries in the action vocabulary — each tagged mechanical or narrated.

Each step is independently playable. Don't build the whole thing before testing the loop.
