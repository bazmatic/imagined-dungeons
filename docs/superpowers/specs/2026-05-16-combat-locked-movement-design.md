# Combat-Locked Movement

**Date:** 2026-05-16
**Status:** Approved

## Problem

A player can walk away from an active fight by issuing a move command. There is nothing stopping them from leaving a location mid-combat.

## Rule

When the player attempts to move, the handler checks whether any co-located agent (other than the player) is alive (`hp > 0`) and engaged (`awake`). If so, the move is rejected with an error message before any exit or lock validation runs.

## Definition of "combat underway"

There is no explicit combat flag in the engine. The `awake` boolean on `Agent` is the closest existing signal: it is set when an agent witnesses a waking event (attack, speak, emote, move, drop, give, death) and cleared after the agent finishes its `shortTermIntent`. In active combat, a struck enemy will be `awake` and will hold a `shortTermIntent` (e.g. "attack the player") until it dies or the fight resolves — it never self-clears mid-combat.

**"Combat underway" = any co-located non-player agent has `hp > 0 && awake`.**

Edge case: a talkative NPC who is `awake` from a `speak` event would temporarily block movement. This is acceptable — the NPC clears their intent after one turn and goes back to sleep, so the block lasts at most one turn.

## Approach: thread `playerId` through the dep chain

The check only applies to the player, not to NPCs. To know whether the current actor is the player, `playerId` is added to the dep types and passed from `runTick` through `runTurn` and `dispatch` into `handleMove`.

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
  const here = await repo.agentsAt(view.location.id);
  const combatUnderway = here.some((a) => a.id !== action.actorId && a.hp > 0 && a.awake);
  if (combatUnderway) return Err("You can't leave while in combat.");
}
```

`view.location.id` is already known from the preceding `perceive()` call, so no extra I/O is needed beyond the `agentsAt` query, which is already called later in the same function to gather witnesses.

## Error message

```
You can't leave while in combat.
```

Consistent in register and punctuation with the existing locked-door messages in `handleMove`.

## Tests

New `describe` block in `move.test.ts`:

1. **Blocked — awake, alive enemy present:** player move returns `Err` with the combat message.
2. **Allowed — enemy dead (`hp <= 0`):** dead enemy does not block movement.
3. **Allowed — enemy alive but dormant (`awake = false`):** non-engaged enemy does not block.
4. **Allowed — no `playerId` in deps:** guard is skipped when `playerId` is absent (legacy/NPC callers).
5. **NPC not blocked:** when actor is an NPC (not the player), move succeeds even with an awake enemy present.

## Out of scope

- No change to how `awake` is set or cleared.
- No new schema fields on `Agent` or `Location`.
- No UI messaging beyond the `Err` string returned from `handleMove`.
