# Creative Attack Design

**Date:** 2026-05-16

## Overview

In combat, both players and NPCs can cause damage through creative actions — shoving furniture, triggering environmental hazards, using the world inventively. The consequence engine (which already runs after every action) recognises these moments and resolves them as a distinct `creative_attack` action, with dice expressions chosen by the LLM to reflect both plausibility and creativity.

## Data Model

A new action kind is added to `src/core/domain/actions.ts`:

```ts
export const ActionKind = {
  ...,
  CreativeAttack: 'creative_attack',
} as const;

type CreativeAttackAction = {
  kind: typeof ActionKind.CreativeAttack;
  actorId: AgentId;
  targetAgentId: AgentId;
  toHit: { sides: number; threshold: number };
  damage: { count: number; sides: number; bonus: number };
  narrative: string;
};
```

- `toHit` — roll `1dX`, hit if result >= `threshold`. The LLM sets both.
- `damage` — roll `count × dY + bonus`. The LLM sets these to reflect physical severity.
- `narrative` — the LLM's prose description of the action, used verbatim in the event log.

A corresponding domain event `CreativeAttackEvent` is emitted by the handler:

```ts
type CreativeAttackEvent = {
  kind: 'creative_attack';
  actorId: AgentId;
  targetId: AgentId;
  outcome: 'hit' | 'miss';
  damageDealt: number;
  defenderHpAfter: number;
  narrative: string;
};
```

## Consequence Engine Prompt

The consequence LLM prompt in `src/core/engine/consequences.ts` gains the following guidance:

**Plausibility gate (first):** Only emit `creative_attack` for actions that could realistically work in the world given the environment and physics. Silly or implausible actions (e.g. hypnotising a troll with a spoon, invoking nonexistent fire) produce nothing — the action simply fails to cause damage.

**Creativity → hit threshold:** Among plausible actions, the `toHit.threshold` reflects how clever the idea is:
- Genuinely inventive, environment-aware idea → threshold 4–6 (almost certain to land)
- Solid but ordinary creative attempt → threshold 10–14
- Clumsy or telegraphed attempt → threshold 16+

**Severity → damage dice:** The `damage` expression reflects the physical weight of the action, independent of its cleverness:
- Small hazard (thrown object, trip) → 1d4
- Moderate hazard (shoved furniture, burning torch) → 1d6–1d8
- Serious hazard (chandelier, collapsing shelf, brazier) → 2d6

The `narrative` field is populated with the LLM's own prose description of the event. It flows from the consequence engine's structured output → the `CreativeAttackAction` → the `CreativeAttackEvent`, so the rendered log always reflects the LLM's wording.

The consequence engine's structured output JSON schema gains a `creative_attack` variant alongside the existing `update_description` shape.

## Resolution Handler

New file: `src/core/engine/actions/creative-attack.ts`

Steps:
1. Read seeded RNG state from repo
2. Roll to-hit: `Math.floor(rng.next() * toHit.sides) + 1`, compare to `toHit.threshold`
3. On hit: roll damage — sum of `count` rolls of `Math.floor(rng.next() * damage.sides) + 1`, plus `bonus`
4. Persist advanced RNG seed
5. Apply `setAgentHp(target, target.hp - damageDealt)`
6. If HP <= 0: drop target inventory to location, emit `Death` event (existing death path)
7. Emit `CreativeAttackEvent` with outcome, damageDealt, defenderHpAfter, narrative

Invalid targets (not in same location, already dead, nonexistent) return an error result and are silently skipped — matching the pattern of other action handlers. Malformed dice params (sides = 0, count < 1) are caught at schema validation before dispatch.

## Event Rendering

Because `CreativeAttackEvent` carries `narrative`, the event log renders the LLM's own description rather than a generic template:

> *Mira sweeps the candelabra into the orc's face (hit, 4 dmg)*

rather than:

> *Mira attacks the orc*

## Dispatcher

`src/core/engine/actions/registry.ts` is updated to route `ActionKind.CreativeAttack` to the new handler.

## Testing

Three unit tests in `creative-attack.test.ts`:

1. **Hit** — correct HP reduction, `CreativeAttackEvent` with `outcome: 'hit'`
2. **Miss** — HP unchanged, `CreativeAttackEvent` with `outcome: 'miss'`
3. **Death** — HP at or below 0 triggers inventory drop and `Death` event

Integration coverage: a full tick with a creative player action produces a `CreativeAttackEvent` in the output event list.
