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

### "Recent" events window

`repo.recentEvents(100)` provides the event log. 100 events covers many turns of gameplay. Attack events reference specific agent IDs, so there is no cross-location confusion: a living, `awake` agent at the player's current location that appears in a past attack with the player is unambiguously "the enemy in this fight."

## Approach: thread `playerId` through the dep chain

The check only applies to the player, not to NPCs. `playerId` is added to the dep types and passed from `runTick` through `runTurn` and `dispatch` into `handleMove`.

### Files changed

| File | Change |
|------|--------|
| `src/core/engine/turn.ts` | Add `playerId?: AgentId` to `RunTurnOptions` |
| `src/core/engine/actions/registry.ts` | Add `playerId?: AgentId` to `DispatchDeps`; pass to `handleMove` |
| `src/core/engine/actions/move.ts` | Add `playerId?: AgentId` to `MoveHandlerDeps`; implement combat guard |
| `src/core/engine/tick.ts` | Pass `playerId` in `RunTurnOptions` for both player and NPC `runTurn` calls |
| `src/core/engine/actions/move.test.ts` | New tests for the combat-lock rule |

### Guard location in `handleMove`

After `perceive()` resolves the actor's view (and the early return for unknown exits), before the locked-exit check:

```ts
if (deps.playerId && action.actorId === deps.playerId) {
  const playerId = deps.playerId;
  const here = await repo.agentsAt(view.location.id);
  const livingAwakeEnemyIds = new Set(
    here.filter((a) => a.id !== playerId && a.hp > 0 && a.awake).map((a) => a.id),
  );
  if (livingAwakeEnemyIds.size > 0) {
    const recent = await repo.recentEvents(100);
    const inCombat = recent.some((e) => {
      if (e.kind !== EventKind.Attack) return false;
      const playerIsActor = e.actorId === playerId;
      const playerIsTarget = e.targetAgentId === playerId;
      if (!playerIsActor && !playerIsTarget) return false;
      const enemyId = playerIsActor ? e.targetAgentId : e.actorId;
      return livingAwakeEnemyIds.has(enemyId);
    });
    if (inCombat) return Err("You can't leave while in combat.");
  }
}
```

The `livingAwakeEnemyIds.size > 0` short-circuit avoids the `recentEvents` call when there is no candidate enemy present — the common case for all non-combat movement.

## Error message

```
You can't leave while in combat.
```

Consistent in register and punctuation with the existing locked-door messages in `handleMove`.

## Tests

New `describe` block in `move.test.ts`:

1. **Blocked** — player attacked the enemy; enemy is alive and `awake`; move is rejected.
2. **Blocked** — enemy attacked the player; enemy is alive and `awake`; move is rejected.
3. **Allowed** — enemy is alive and `awake` but there is no attack event involving the player (e.g. friendly NPC woken by a conversation); move succeeds.
4. **Allowed** — there was an attack event but the enemy is now dead (`hp <= 0`); move succeeds.
5. **Allowed** — there was an attack event, enemy is alive, but enemy is no longer `awake` (LLM ended combat); move succeeds.
6. **Allowed** — no `playerId` in deps; guard is skipped; move succeeds.
7. **NPC not blocked** — actor is an NPC (not the player); move succeeds even with a living, awake, previously-attacked enemy present.

## Out of scope

- No change to how `awake` is set or cleared.
- No new schema fields on `Agent` or `Location`.
- No UI messaging beyond the `Err` string returned from `handleMove`.
