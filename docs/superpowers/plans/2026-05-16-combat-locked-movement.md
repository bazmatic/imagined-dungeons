# Combat-Locked Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the player from moving between locations while an active combat encounter is underway.

**Architecture:** A new `isPlayerInCombat` function in `src/core/engine/combat.ts` owns the detection logic (recent attack event involving the player + living + awake enemy still present). `handleMove` calls it after resolving the exit and before any lock check. The player's ID is threaded through the existing dep chain (`RunTurnOptions` → `DispatchDeps` → `MoveHandlerDeps`) so the guard fires only for the player, not for NPC-driven moves.

**Tech Stack:** TypeScript, Vitest, `MemoryRepository` for in-memory test repos.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/engine/combat.ts` | **Create** | `isPlayerInCombat` — single source of truth for combat state |
| `src/core/engine/combat.test.ts` | **Create** | Unit tests for `isPlayerInCombat` in isolation |
| `src/core/engine/turn.ts` | **Modify** | Add `playerId?: AgentId` to `RunTurnOptions`; pass to `dispatch` |
| `src/core/engine/actions/registry.ts` | **Modify** | Add `playerId?: AgentId` to `DispatchDeps`; forward to `handleMove` |
| `src/core/engine/actions/move.ts` | **Modify** | Add `playerId?: AgentId` to `MoveHandlerDeps`; call `isPlayerInCombat` |
| `src/core/engine/tick.ts` | **Modify** | Pass `playerId` in both `runTurn` calls |
| `src/core/engine/actions/move.test.ts` | **Modify** | Add integration tests for the combat guard in `handleMove` |

---

## Task 1: Create `combat.ts` with `isPlayerInCombat`

**Files:**
- Create: `src/core/engine/combat.ts`

- [ ] **Step 1: Write the file**

```ts
// src/core/engine/combat.ts
import type { AgentId, LocationId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import type { Repository } from './repository';

const RECENT_EVENT_WINDOW = 100;

export async function isPlayerInCombat(
  playerId: AgentId,
  locationId: LocationId,
  repo: Repository,
): Promise<boolean> {
  const here = await repo.agentsAt(locationId);
  const livingAwakeEnemyIds = new Set(
    here.filter((a) => a.id !== playerId && a.hp > 0 && a.awake).map((a) => a.id),
  );
  if (livingAwakeEnemyIds.size === 0) return false;
  const recent = await repo.recentEvents(RECENT_EVENT_WINDOW);
  return recent.some((e) => {
    if (e.kind !== EventKind.Attack) return false;
    const playerIsActor = e.actorId === playerId;
    const playerIsTarget = e.targetAgentId === playerId;
    if (!playerIsActor && !playerIsTarget) return false;
    const enemyId = playerIsActor ? e.targetAgentId : e.actorId;
    return livingAwakeEnemyIds.has(enemyId);
  });
}
```

- [ ] **Step 2: Confirm file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/combat.ts
git commit -m "feat(combat): add isPlayerInCombat query"
```

---

## Task 2: Unit-test `isPlayerInCombat`

**Files:**
- Create: `src/core/engine/combat.test.ts`

- [ ] **Step 1: Write all tests (they will pass — no mocking needed, pure MemoryRepository)**

```ts
// src/core/engine/combat.test.ts
import type { Agent, Location } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import { type AgentId, asAgentId, asEventId, asLocationId, asWorldId } from '@core/domain/ids';
import { EventKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { isPlayerInCombat } from './combat';

const W = asWorldId('w');
const LOC_A = asLocationId('loc_a');
const LOC_B = asLocationId('loc_b');

const locA: Location = {
  id: LOC_A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '',
};
const locB: Location = {
  id: LOC_B, worldId: W, label: 'B', shortDescription: '', longDescription: '', tags: [], secretDescription: '',
};

const PLAYER_ID = asAgentId('char_player');
const GOBLIN_ID = asAgentId('char_goblin');
const OTHER_ID = asAgentId('char_other');

const player: Agent = {
  id: PLAYER_ID, worldId: W, label: 'Player', shortDescription: '', longDescription: '',
  locationId: LOC_A, hp: 10, damage: 2, defense: 1, capacity: 10,
  mood: null, shortTermIntent: null, goal: null, autonomous: false, awake: false, gold: 0,
  tags: [], secretDescription: '',
};

function makeGoblin(overrides: Partial<Agent> = {}): Agent {
  return {
    id: GOBLIN_ID, worldId: W, label: 'Goblin', shortDescription: '', longDescription: '',
    locationId: LOC_A, hp: 5, damage: 2, defense: 1, capacity: 5,
    mood: null, shortTermIntent: 'attack the player', goal: null, autonomous: false, awake: true, gold: 0,
    tags: [], secretDescription: '',
    ...overrides,
  };
}

function attackEvent(actorId: AgentId, targetId: AgentId): DomainEvent {
  return {
    id: asEventId('evt_1'),
    worldId: W,
    actorId,
    kind: EventKind.Attack,
    witnesses: [actorId, targetId],
    createdAt: new Date(),
    targetAgentId: targetId,
    outcome: 'hit',
    damageDealt: 1,
  };
}

describe('isPlayerInCombat', () => {
  it('returns true when the player attacked a living, awake goblin', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin()] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(true);
  });

  it('returns true when the goblin attacked the player and the goblin is still alive and awake', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin()] });
    await repo.appendEvent(attackEvent(GOBLIN_ID, PLAYER_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(true);
  });

  it('returns false when no attack events exist', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin()] });
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when there is an attack event but the goblin is dead (hp <= 0)', async () => {
    const deadGoblin = makeGoblin({ hp: 0 });
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, deadGoblin] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when there is an attack event but the goblin is no longer awake', async () => {
    const dormantGoblin = makeGoblin({ awake: false });
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, dormantGoblin] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when a living awake goblin is present but the attack was between two other agents', async () => {
    const other: Agent = { ...makeGoblin(), id: OTHER_ID, label: 'Other' };
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player, makeGoblin(), other] });
    await repo.appendEvent(attackEvent(GOBLIN_ID, OTHER_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when the goblin has moved to a different location', async () => {
    const goblinElsewhere = makeGoblin({ locationId: LOC_B });
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [], agents: [player, goblinElsewhere] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });

  it('returns false when there are no agents at the location', async () => {
    const repo = new MemoryRepository(W, { locations: [locA], exits: [], items: [], agents: [player] });
    await repo.appendEvent(attackEvent(PLAYER_ID, GOBLIN_ID));
    expect(await isPlayerInCombat(PLAYER_ID, LOC_A, repo)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/core/engine/combat.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/engine/combat.test.ts
git commit -m "test(combat): unit-test isPlayerInCombat"
```

---

## Task 3: Thread `playerId` through the dep chain

**Files:**
- Modify: `src/core/engine/turn.ts`
- Modify: `src/core/engine/actions/registry.ts`
- Modify: `src/core/engine/actions/move.ts`
- Modify: `src/core/engine/tick.ts`

- [ ] **Step 1: Add `playerId` to `RunTurnOptions` in `turn.ts`**

In `src/core/engine/turn.ts`, the `RunTurnOptions` interface (lines 40–45) currently reads:

```ts
export interface RunTurnOptions {
  readonly parse?: ParseFn;
  readonly llm?: LanguageModel | null;
  readonly builderRepo?: BuilderRepository;
  readonly discoveryBudget?: DiscoveryBudget;
}
```

Replace with:

```ts
export interface RunTurnOptions {
  readonly parse?: ParseFn;
  readonly llm?: LanguageModel | null;
  readonly builderRepo?: BuilderRepository;
  readonly discoveryBudget?: DiscoveryBudget;
  readonly playerId?: AgentId;
}
```

(`AgentId` is already imported at the top of the file.)

- [ ] **Step 2: Pass `playerId` to `dispatch` in `turn.ts`**

The `dispatch` call (lines 143–147) currently reads:

```ts
const r = await dispatch(
  parsed,
  repo,
  opts.builderRepo ? { llm, worldId, builderRepo: opts.builderRepo } : { llm, worldId },
);
```

Replace with:

```ts
const r = await dispatch(
  parsed,
  repo,
  opts.builderRepo
    ? { llm, worldId, builderRepo: opts.builderRepo, playerId: opts.playerId }
    : { llm, worldId, playerId: opts.playerId },
);
```

- [ ] **Step 3: Add `playerId` to `DispatchDeps` in `registry.ts`**

Add `AgentId` to the import line at the top of `src/core/engine/actions/registry.ts`:

```ts
import type { AgentId, WorldId } from '@core/domain/ids';
```

Then in the `DispatchDeps` interface (lines 35–39):

```ts
export interface DispatchDeps {
  readonly llm?: LanguageModel | null;
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
  readonly playerId?: AgentId;
}
```

- [ ] **Step 4: Add `playerId` to `MoveHandlerDeps` in `move.ts`**

Add `AgentId` to the import line at the top of `src/core/engine/actions/move.ts`:

```ts
import { asExitId, asLocationId, type AgentId, type WorldId } from '@core/domain/ids';
```

Then in the `MoveHandlerDeps` interface (lines 13–16):

```ts
export interface MoveHandlerDeps {
  readonly builderRepo?: BuilderRepository;
  readonly worldId?: WorldId;
  readonly playerId?: AgentId;
}
```

- [ ] **Step 5: Pass `playerId` in both `runTurn` calls in `tick.ts`**

In `src/core/engine/tick.ts`, the player `runTurn` call (lines 425–430) currently reads:

```ts
const playerResult = await runTurn(playerId, text, repo, {
  parse,
  llm,
  discoveryBudget,
  ...(opts.builderRepo ? { builderRepo: opts.builderRepo } : {}),
});
```

Replace with:

```ts
const playerResult = await runTurn(playerId, text, repo, {
  parse,
  llm,
  discoveryBudget,
  playerId,
  ...(opts.builderRepo ? { builderRepo: opts.builderRepo } : {}),
});
```

The NPC `runTurn` call (lines 500–505) currently reads:

```ts
const npcResult = await runTurn(npcId, intent, repo, {
  parse,
  llm,
  discoveryBudget,
  ...(opts.builderRepo ? { builderRepo: opts.builderRepo } : {}),
});
```

Replace with:

```ts
const npcResult = await runTurn(npcId, intent, repo, {
  parse,
  llm,
  discoveryBudget,
  playerId,
  ...(opts.builderRepo ? { builderRepo: opts.builderRepo } : {}),
});
```

- [ ] **Step 6: Verify it still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/engine/turn.ts src/core/engine/actions/registry.ts src/core/engine/actions/move.ts src/core/engine/tick.ts
git commit -m "feat(combat): thread playerId through dep chain"
```

---

## Task 4: Add combat guard to `handleMove` + integration tests

**Files:**
- Modify: `src/core/engine/actions/move.ts`
- Modify: `src/core/engine/actions/move.test.ts`

- [ ] **Step 1: Write failing integration tests in `move.test.ts`**

Add a new `describe` block at the end of `src/core/engine/actions/move.test.ts`:

```ts
describe('handleMove — combat guard', () => {
  const goblin: Agent = {
    id: asAgentId('char_goblin'),
    worldId: W,
    label: 'Goblin',
    shortDescription: '',
    longDescription: '',
    locationId: A,
    hp: 5,
    damage: 2,
    defense: 1,
    capacity: 5,
    mood: null,
    shortTermIntent: 'attack the player',
    goal: null,
    autonomous: false,
    awake: true,
    gold: 0,
    tags: [],
    secretDescription: '',
  };

  it('blocks the player from moving when combat is underway', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitN],
      items: [],
      agents: [paff, goblin],
    });
    await repo.appendEvent({
      id: asEventId('evt_1'),
      worldId: W,
      actorId: paff.id,
      kind: 'attack',
      witnesses: [paff.id, goblin.id],
      createdAt: new Date(),
      targetAgentId: goblin.id,
      outcome: 'hit',
      damageDealt: 1,
    });
    const r = await handleMove(
      { kind: 'move', actorId: paff.id, direction: 'north' },
      repo,
      { playerId: paff.id },
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/combat/i);
  });

  it('allows the player to move when there is no combat', async () => {
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitN],
      items: [],
      agents: [paff],
    });
    const r = await handleMove(
      { kind: 'move', actorId: paff.id, direction: 'north' },
      repo,
      { playerId: paff.id },
    );
    expect(r.ok).toBe(true);
  });

  it('does not block an NPC from moving even when the player is in combat with a goblin', async () => {
    const npc: Agent = {
      ...goblin,
      id: asAgentId('char_npc'),
      label: 'NPC',
      awake: false,
    };
    const repo = new MemoryRepository(W, {
      locations: [locA, locB],
      exits: [exitN],
      items: [],
      agents: [paff, goblin, npc],
    });
    await repo.appendEvent({
      id: asEventId('evt_1'),
      worldId: W,
      actorId: paff.id,
      kind: 'attack',
      witnesses: [paff.id, goblin.id],
      createdAt: new Date(),
      targetAgentId: goblin.id,
      outcome: 'hit',
      damageDealt: 1,
    });
    // NPC (not the player) tries to move — should succeed
    const r = await handleMove(
      { kind: 'move', actorId: npc.id, direction: 'north' },
      repo,
      { playerId: paff.id },
    );
    expect(r.ok).toBe(true);
  });
});
```

You'll also need to add these imports at the top of `move.test.ts`:

```ts
import { asEventId } from '@core/domain/ids';
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```bash
npx vitest run src/core/engine/actions/move.test.ts
```

Expected: the 3 new tests in the `combat guard` describe block fail (the guard doesn't exist yet).

- [ ] **Step 3: Add the combat guard to `handleMove` in `move.ts`**

Add the import for `isPlayerInCombat` at the top of `src/core/engine/actions/move.ts`:

```ts
import { isPlayerInCombat } from '../combat';
```

Then, in the body of `handleMove`, after line 38 (`if (!exit) return Err("You can't go that way.");`) and before line 40 (`if (exit.to === null) {`), insert:

```ts
  if (deps.playerId && action.actorId === deps.playerId) {
    if (await isPlayerInCombat(deps.playerId, view.location.id, repo)) {
      return Err("You can't leave while in combat.");
    }
  }
```

- [ ] **Step 4: Run the new tests and confirm they pass**

```bash
npx vitest run src/core/engine/actions/move.test.ts
```

Expected: all tests in the file pass, including the 3 new ones.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine/actions/move.ts src/core/engine/actions/move.test.ts
git commit -m "feat(combat): block player movement during active combat"
```
