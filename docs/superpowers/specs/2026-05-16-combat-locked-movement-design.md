# Combat-Locked Movement

**Date:** 2026-05-16
**Status:** Approved

## Problem

A player can walk away from an active fight by issuing a move command. There is nothing stopping them from leaving a location mid-combat.

## Rule

When the player attempts to move, the handler checks whether they are currently in combat at their location. If so, the move is rejected with an error message before any exit or lock validation runs.

## Definition of "combat underway"

Three conditions must all be true:

1. **An attack has occurred** — there is a recent `Attack` event where the player was the actor or the target. This ensures only actual combat (not conversation) locks movement.
2. **The enemy is still alive** — the agent on the other side of that attack has `hp > 0`.
3. **The enemy is still engaged** — that agent is `awake`. The `awake` flag is the LLM-controlled end-of-combat signal: when the NPC mind decides the enemy surrenders, flees, or gives up, it clears `shortTermIntent`, the sleep sweep clears `awake`, and the player is free to move again.

**"Combat is underway" = there exists a recent `Attack` event where the player was actor or target, and the other party is currently at the player's location, alive (`hp > 0`), and `awake`.**

### Why this definition

- A friendly shopkeeper who is `awake` from a conversation does **not** block movement — they were never in an attack event with the player.
- An enemy who attacked the player but then had their `shortTermIntent` cleared by the LLM (surrendered, calmed down) does **not** block movement — they are no longer `awake`.
- An enemy who is alive and `awake` but was never involved in an attack with the player does **not** block movement.
- A dead enemy (`hp <= 0`) does **not** block movement regardless of `awake` state.
- An enemy who has **left the location** does **not** block movement — `agentsAt` only returns agents currently present, so a fleeing enemy immediately lifts the block.

### "Recent" events window

`repo.recentEvents(100)` provides the event log. 100 events covers many turns of gameplay. Attack events reference specific agent IDs, so there is no cross-location confusion: a living, `awake` agent at the player's current location that appears in a past attack with the player is unambiguously "the enemy in this fight."

## Approach: thread `playerId` through the dep chain; extract combat query

The check only applies to the player, not to NPCs. `playerId` is added to the dep types and passed from `runTick` through `runTurn` and `dispatch` into `handleMove`.

The detection logic is extracted into a single named function so the definition of "in combat" lives in exactly one place (DRY) and has a single responsibility (SOLID-S).

### New module: `src/core/engine/combat.ts`

```ts
export async function isPlayerInCombat(
  playerId: AgentId,
  locationId: LocationId,
  repo: Repository,
): Promise<boolean>
```

**Algorithm:**
1. Call `repo.agentsAt(locationId)` and collect IDs of agents that are not the player, alive (`hp > 0`), and `awake` → `livingAwakeEnemyIds`.
2. Short-circuit: if `livingAwakeEnemyIds` is empty, return `false` immediately (no `recentEvents` call needed — the common non-combat case).
3. Call `repo.recentEvents(100)` and scan for any `Attack` event where the player was actor or target and the other party is in `livingAwakeEnemyIds`.
4. Return `true` if any such event is found, `false` otherwise.

This function owns the entire definition of "in combat." Any future caller (e.g. a `flee` action, a UI status query) uses this function — no duplication.

### Files changed

| File | Change |
|------|--------|
| `src/core/engine/combat.ts` | New file — `isPlayerInCombat` function |
| `src/core/engine/combat.test.ts` | Unit tests for `isPlayerInCombat` in isolation |
| `src/core/engine/turn.ts` | Add `playerId?: AgentId` to `RunTurnOptions` |
| `src/core/engine/actions/registry.ts` | Add `playerId?: AgentId` to `DispatchDeps`; pass to `handleMove` |
| `src/core/engine/actions/move.ts` | Add `playerId?: AgentId` to `MoveHandlerDeps`; call `isPlayerInCombat` |
| `src/core/engine/tick.ts` | Pass `playerId` in `RunTurnOptions` for both player and NPC `runTurn` calls |

### Guard location in `handleMove`

After `perceive()` resolves the actor's view (and the early return for unknown exits), before the locked-exit check:

```ts
if (deps.playerId && action.actorId === deps.playerId) {
  if (await isPlayerInCombat(deps.playerId, view.location.id, repo)) {
    return Err("You can't leave while in combat.");
  }
}
```

Clean, readable, and delegates all combat reasoning to the dedicated function.

## Error message

```
You can't leave while in combat.
```

Consistent in register and punctuation with the existing locked-door messages in `handleMove`.

## Tests

`combat.test.ts` tests `isPlayerInCombat` directly against a mock/in-memory repo — no need to go through `handleMove` to test the detection logic.

`move.test.ts` adds a single integration-level test confirming that `handleMove` rejects a move when `isPlayerInCombat` would return `true`, and passes when it would return `false`. The detailed case coverage lives in `combat.test.ts`.

### `combat.test.ts` cases

1. **True** — player attacked the enemy; enemy is alive and `awake`.
2. **True** — enemy attacked the player; enemy is alive and `awake`.
3. **False** — enemy is alive and `awake` but no attack event involves the player (friendly NPC woken by conversation).
4. **False** — attack event exists but the enemy is dead (`hp <= 0`).
5. **False** — attack event exists, enemy is alive, but enemy is no longer `awake` (LLM ended combat).
6. **False** — attack event exists but the enemy has moved to a different location (not in `agentsAt`).
7. **False** — no agents at the location at all.

### `move.test.ts` additions

8. **Blocked** — `handleMove` returns `Err` when combat is underway (player attacked an alive, awake enemy).
9. **Allowed** — `handleMove` proceeds normally when no combat is underway.
10. **NPC not blocked** — actor is an NPC (`actorId` does not match `playerId`); move succeeds even with combat underway.

## Out of scope

- No change to how `awake` is set or cleared.
- No new schema fields on `Agent` or `Location`.
- No UI messaging beyond the `Err` string returned from `handleMove`.
