# Creative Attack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the consequence engine recognise when a creative in-combat action should cause damage and resolve it through a new `creative_attack` action kind, using LLM-chosen dice for both to-hit and damage.

**Architecture:** A new `creative_attack` action kind is added to the closed vocabulary. A shared `applyDeathEffects` helper (extracted from `attack.ts`) avoids duplicating death/inventory-drop logic. The consequence engine's prompt, JSON schema, and parse/resolve loop are extended to emit `creative_attack` actions. Narration, NPC memory, and templates are updated in parallel with the new event kind.

**Tech Stack:** TypeScript, Vitest, existing `rollD`/`makeRng` from `src/core/engine/rng.ts`, `MemoryRepository` from `src/infra/memory-repository.ts` for tests.

---

## Task 1 — Extract `applyDeathEffects` from `attack.ts`

**Goal:** Prevent duplication of the death/inventory-drop path in the new handler.

**Files:**
- Create: `src/core/engine/actions/combat-effects.ts`
- Modify: `src/core/engine/actions/attack.ts`

- [ ] **Step 1.1: Create `combat-effects.ts` with the shared helper**

```ts
// src/core/engine/actions/combat-effects.ts
import type { Agent } from '@core/domain/entities';
import type { DomainEvent } from '@core/domain/events';
import type { AgentId, LocationId, WorldId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { nextEventId } from '../ids-gen';
import type { HandlerRepo } from '../repository';

export async function applyDeathEffects(
  actorId: AgentId,
  target: Agent,
  locationId: LocationId,
  witnesses: readonly AgentId[],
  worldId: WorldId,
  repo: HandlerRepo,
): Promise<void> {
  const items = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: target.id });
  for (const item of items) {
    await repo.transferItem(item.id, { kind: OwnerKind.Location, id: locationId });
  }
  const deathEvent: DomainEvent = {
    id: nextEventId(),
    worldId,
    actorId,
    kind: EventKind.Death,
    witnesses,
    createdAt: new Date(),
    targetAgentId: target.id,
    locationId,
  };
  await repo.appendEvent(deathEvent);
}
```

- [ ] **Step 1.2: Refactor `attack.ts` to use `applyDeathEffects`**

Replace the inline death block in `handleAttack` (lines 67–84 in `attack.ts`) with:

```ts
import { applyDeathEffects } from './combat-effects';

// inside handleAttack, after await repo.setRngSeed(rng.seed):
if (combat.defenderDied) {
  await applyDeathEffects(action.actorId, target, view.location.id, witnesses, worldId, repo);
}
```

Remove the now-unused inline imports: `nextEventId` is no longer needed directly in `attack.ts`.

The full revised `attack.ts` after the change:

```ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { makeRng } from '../rng';
import { applyDeathEffects } from './combat-effects';
import { resolveCombat } from './combat';
import type { ActionOutcome } from './types';

export async function handleAttack(
  action: Extract<Action, { kind: 'attack' }>,
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const actor = view.actor;
  const target = await repo.getAgent(action.targetAgentId);
  if (target.locationId !== view.location.id) {
    return Err(`${target.label} isn't here.`);
  }

  const seed = await repo.getRngSeed();
  const rng = makeRng(seed);

  const combat = resolveCombat({
    attackerDamage: actor.damage,
    defenderHp: target.hp,
    defenderDefense: target.defense,
    rng,
  });
  const { outcome, damageDealt } = combat;

  if (combat.outcome === 'hit') {
    await repo.setAgentHp(target.id, combat.defenderHpAfter);
  }

  await repo.setRngSeed(rng.seed);

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const worldId = await repo.getWorldId();
  const event: DomainEvent = {
    id: nextEventId(),
    worldId,
    actorId: action.actorId,
    kind: EventKind.Attack,
    witnesses,
    createdAt: new Date(),
    targetAgentId: action.targetAgentId,
    outcome,
    damageDealt,
  };

  if (combat.defenderDied) {
    await applyDeathEffects(action.actorId, target, view.location.id, witnesses, worldId, repo);
  }

  const render: Segment[] = [];
  if (outcome === 'hit') {
    render.push({ kind: SegmentKind.Hit, text: `You hit ${target.label} for ${damageDealt} damage.` });
    if (combat.defenderDied) {
      render.push({ kind: SegmentKind.Death, text: `${target.label} is slain!` });
    }
  } else {
    render.push({ kind: SegmentKind.Miss, text: `You miss ${target.label}.` });
  }

  return Ok({ render, event });
}
```

- [ ] **Step 1.3: Run existing attack tests to confirm no regression**

```bash
npx vitest run src/core/engine/actions/attack.test.ts
```

Expected: all tests pass.

- [ ] **Step 1.4: Commit**

```bash
git add src/core/engine/actions/combat-effects.ts src/core/engine/actions/attack.ts
git commit -m "refactor(combat): extract applyDeathEffects for reuse across attack handlers"
```

---

## Task 2 — Add `CreativeAttack` to kind constants and domain types

**Files:**
- Modify: `src/core/domain/kinds.ts`
- Modify: `src/core/domain/actions.ts`
- Modify: `src/core/domain/events.ts`

- [ ] **Step 2.1: Add `CreativeAttack` to `ActionKind` and `EventKind` in `kinds.ts`**

In `ActionKind` (after `Offer:`):
```ts
CreativeAttack: 'creative_attack',
```

In `EventKind` (after `Death:`):
```ts
CreativeAttack: 'creative_attack',
```

- [ ] **Step 2.2: Add `CreativeAttackAction` to the `Action` union in `actions.ts`**

After the `attack` variant:
```ts
| {
    kind: 'creative_attack';
    actorId: AgentId;
    targetAgentId: AgentId;
    toHit: { readonly sides: number; readonly threshold: number };
    damage: { readonly count: number; readonly sides: number; readonly bonus: number };
    narrative: string;
  }
```

- [ ] **Step 2.3: Add `CreativeAttackEvent` to `DomainEvent` and `NARRATED_EVENT_KINDS` in `events.ts`**

After the `attack` variant in `DomainEvent`:
```ts
| (BaseEvent & {
    kind: 'creative_attack';
    targetAgentId: AgentId;
    outcome: 'hit' | 'miss';
    damageDealt: number;
    narrative: string;
  })
```

In `NARRATED_EVENT_KINDS`:
```ts
export const NARRATED_EVENT_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  EventKind.Speak,
  EventKind.Emote,
  EventKind.Attack,
  EventKind.CreativeAttack,
]);
```

- [ ] **Step 2.4: Run the full test suite to catch any type errors from the new union variant**

```bash
npx vitest run
```

Expected: all tests pass (the new union variant is additive; no existing switches are exhaustive-checked).

- [ ] **Step 2.5: Commit**

```bash
git add src/core/domain/kinds.ts src/core/domain/actions.ts src/core/domain/events.ts
git commit -m "feat(domain): add creative_attack action kind and event kind"
```

---

## Task 3 — Implement the `creative-attack` handler (TDD)

**Files:**
- Create: `src/core/engine/actions/creative-attack.test.ts`
- Create: `src/core/engine/actions/creative-attack.ts`

**Key mechanic:** `rollD(rng, toHit.sides)` returns 1–N. Hit if result >= `toHit.threshold`. Damage = sum of `damage.count` calls to `rollD(rng, damage.sides)` + `damage.bonus`. Using `threshold: 1` (always hits) and `threshold: 21` with `sides: 20` (never hits) keeps tests seed-independent.

- [ ] **Step 3.1: Write the test file**

```ts
// src/core/engine/actions/creative-attack.test.ts
import type { Agent, Item, Location } from '@core/domain/entities';
import { asAgentId, asItemId, asLocationId, asWorldId } from '@core/domain/ids';
import { EventKind, OwnerKind } from '@core/domain/kinds';
import { MemoryRepository } from '@infra/memory-repository';
import { describe, expect, it } from 'vitest';
import { handleCreativeAttack } from './creative-attack';

const W = asWorldId('w');
const A = asLocationId('loc_a');
const B = asLocationId('loc_b');
const locA: Location = { id: A, worldId: W, label: 'A', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };
const locB: Location = { id: B, worldId: W, label: 'B', shortDescription: '', longDescription: '', tags: [], secretDescription: '' };

const paff = (overrides: Partial<Agent> = {}): Agent => ({
  id: asAgentId('char_p'), worldId: W, label: 'Paff', shortDescription: '', longDescription: '',
  locationId: A, hp: 10, damage: 3, defense: 4, capacity: 10, mood: null, shortTermIntent: null,
  goal: null, autonomous: false, awake: false, gold: 0, tags: [], secretDescription: '', ...overrides,
});
const orc = (overrides: Partial<Agent> = {}): Agent => ({
  id: asAgentId('char_orc'), worldId: W, label: 'Orc', shortDescription: '', longDescription: '',
  locationId: A, hp: 10, damage: 5, defense: 3, capacity: 10, mood: null, shortTermIntent: null,
  goal: null, autonomous: false, awake: false, gold: 0, tags: [], secretDescription: '', ...overrides,
});

const makeRepo = (a: Agent, t: Agent) =>
  new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [], agents: [a, t], rngSeed: 1 });

// Guaranteed-miss action: threshold=21 on a d20 is unreachable (max roll is 20)
const missAction = (actorId: ReturnType<typeof asAgentId>, targetAgentId: ReturnType<typeof asAgentId>) => ({
  kind: 'creative_attack' as const,
  actorId,
  targetAgentId,
  toHit: { sides: 20, threshold: 21 },
  damage: { count: 1, sides: 6, bonus: 0 },
  narrative: 'Paff hurls a goblet',
});

// Guaranteed-hit action: threshold=1 on any die is always satisfied
const hitAction = (actorId: ReturnType<typeof asAgentId>, targetAgentId: ReturnType<typeof asAgentId>) => ({
  kind: 'creative_attack' as const,
  actorId,
  targetAgentId,
  toHit: { sides: 20, threshold: 1 },
  damage: { count: 1, sides: 6, bonus: 0 },
  narrative: 'Paff sweeps the candelabra into the orc\'s face',
});

describe('handleCreativeAttack', () => {
  it('miss leaves HP unchanged and emits creative_attack event with outcome=miss', async () => {
    const a = paff();
    const t = orc({ hp: 10 });
    const repo = makeRepo(a, t);
    const r = await handleCreativeAttack(missAction(a.id, t.id), repo);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.event.kind).toBe('creative_attack');
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    expect(r.value.event.outcome).toBe('miss');
    expect(r.value.event.damageDealt).toBe(0);
    expect((await repo.getAgent(t.id)).hp).toBe(10);
  });

  it('hit reduces HP and carries the LLM narrative in the event', async () => {
    const a = paff();
    const t = orc({ hp: 10 });
    const repo = makeRepo(a, t);
    const r = await handleCreativeAttack(hitAction(a.id, t.id), repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    expect(r.value.event.outcome).toBe('hit');
    expect(r.value.event.damageDealt).toBeGreaterThan(0);
    expect(r.value.event.narrative).toBe("Paff sweeps the candelabra into the orc's face");
    const after = await repo.getAgent(t.id);
    expect(after.hp).toBe(10 - r.value.event.damageDealt);
  });

  it('applies bonus to damage roll', async () => {
    const a = paff();
    const t = orc({ hp: 100 });
    const repo = makeRepo(a, t);
    const action = { ...hitAction(a.id, t.id), damage: { count: 1, sides: 1, bonus: 5 } };
    const r = await handleCreativeAttack(action, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    // sides=1, rollD(rng, 1) always returns 1, so damage = 1 + 5 = 6
    expect(r.value.event.damageDealt).toBe(6);
  });

  it('death drops inventory and emits a death event', async () => {
    const a = paff();
    const t = orc({ hp: 1 });
    const sword: Item = {
      id: asItemId('item_sword'), worldId: W, label: 'sword', shortDescription: '', longDescription: '',
      owner: { kind: OwnerKind.Agent, id: t.id }, weight: 1, hidden: false, tags: [],
      equipped: false, container: false, opened: false, locked: false, lockedByItem: null, priceTag: null,
    };
    const repo = new MemoryRepository(W, { locations: [locA, locB], exits: [], items: [sword], agents: [a, t], rngSeed: 1 });
    // count=1, sides=1 → guaranteed 1 damage; bonus=0; hp=1 → hp after = 0 → dies
    const action = { ...hitAction(a.id, t.id), damage: { count: 1, sides: 1, bonus: 0 } };
    const r = await handleCreativeAttack(action, repo);
    if (!r.ok) throw new Error(r.error);
    if (r.value.event.kind !== 'creative_attack') throw new Error();
    expect(r.value.event.outcome).toBe('hit');
    // Sword should be transferred to location
    const droppedSword = await repo.getItem(asItemId('item_sword'));
    expect(droppedSword.owner).toEqual({ kind: 'location', id: A });
    // Death event should be in the log
    const events = await repo.recentEvents(10);
    const deathEvent = events.find((e) => e.kind === EventKind.Death);
    expect(deathEvent).toBeTruthy();
    if (!deathEvent || deathEvent.kind !== 'death') throw new Error();
    expect(deathEvent.targetAgentId).toBe(t.id);
  });

  it('advances the RNG seed', async () => {
    const a = paff();
    const t = orc();
    const repo = makeRepo(a, t);
    const before = await repo.getRngSeed();
    await handleCreativeAttack(hitAction(a.id, t.id), repo);
    expect(await repo.getRngSeed()).not.toBe(before);
  });

  it('returns Err when target is not in the same location', async () => {
    const a = paff();
    const t = orc({ locationId: B });
    const repo = makeRepo(a, t);
    const r = await handleCreativeAttack(hitAction(a.id, t.id), repo);
    if (r.ok) throw new Error('expected error');
    expect(r.error.toLowerCase()).toContain("isn't here");
  });
});
```

- [ ] **Step 3.2: Run the test file to confirm it fails (handler not yet defined)**

```bash
npx vitest run src/core/engine/actions/creative-attack.test.ts
```

Expected: FAIL — `handleCreativeAttack` not found.

- [ ] **Step 3.3: Implement `creative-attack.ts`**

```ts
// src/core/engine/actions/creative-attack.ts
import type { Action } from '@core/domain/actions';
import type { DomainEvent } from '@core/domain/events';
import { AttackOutcome, EventKind } from '@core/domain/kinds';
import { Err, Ok, type Result } from '@core/domain/result';
import { type Segment, SegmentKind } from '@core/domain/segments';
import { nextEventId } from '../ids-gen';
import { perceive, type PerceptionView } from '../perception';
import type { HandlerRepo } from '../repository';
import { makeRng, rollD } from '../rng';
import { applyDeathEffects } from './combat-effects';
import type { ActionOutcome } from './types';

export async function handleCreativeAttack(
  action: Extract<Action, { kind: 'creative_attack' }>,
  repo: HandlerRepo,
  deps?: { readonly view?: PerceptionView },
): Promise<Result<ActionOutcome, string>> {
  const view = deps?.view ?? await perceive(action.actorId, repo);
  const target = await repo.getAgent(action.targetAgentId);
  if (target.locationId !== view.location.id) {
    return Err(`${target.label} isn't here.`);
  }

  const seed = await repo.getRngSeed();
  const rng = makeRng(seed);

  const toHitRoll = rollD(rng, action.toHit.sides);
  const hit = toHitRoll >= action.toHit.threshold;
  const outcome: AttackOutcome = hit ? AttackOutcome.Hit : AttackOutcome.Miss;

  let damageDealt = 0;
  if (hit) {
    for (let i = 0; i < action.damage.count; i++) {
      damageDealt += rollD(rng, action.damage.sides);
    }
    damageDealt += action.damage.bonus;
  }

  const defenderHpAfter = target.hp - damageDealt;
  const defenderDied = hit && defenderHpAfter <= 0;

  if (hit) {
    await repo.setAgentHp(target.id, defenderHpAfter);
  }
  await repo.setRngSeed(rng.seed);

  const witnesses = (await repo.agentsAt(view.location.id)).map((a) => a.id);
  const worldId = await repo.getWorldId();

  if (defenderDied) {
    await applyDeathEffects(action.actorId, target, view.location.id, witnesses, worldId, repo);
  }

  const event: DomainEvent = {
    id: nextEventId(),
    worldId,
    actorId: action.actorId,
    kind: EventKind.CreativeAttack,
    witnesses,
    createdAt: new Date(),
    targetAgentId: action.targetAgentId,
    outcome,
    damageDealt,
    narrative: action.narrative,
  };

  const render: Segment[] = [];
  if (hit) {
    render.push({ kind: SegmentKind.Hit, text: `${action.narrative} (hit, ${damageDealt} dmg)` });
    if (defenderDied) {
      render.push({ kind: SegmentKind.Death, text: `${target.label} is slain!` });
    }
  } else {
    render.push({ kind: SegmentKind.Miss, text: `${action.narrative} — miss.` });
  }

  return Ok({ render, event });
}
```

- [ ] **Step 3.4: Run the tests to confirm they pass**

```bash
npx vitest run src/core/engine/actions/creative-attack.test.ts
```

Expected: all tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/core/engine/actions/creative-attack.ts src/core/engine/actions/creative-attack.test.ts
git commit -m "feat(combat): implement creative-attack handler with LLM-chosen dice"
```

---

## Task 4 — Register `creative_attack` in the dispatcher

**Files:**
- Modify: `src/core/engine/actions/registry.ts`

- [ ] **Step 4.1: Add import and case to `dispatch`**

Add at the top of `registry.ts`:
```ts
import { handleCreativeAttack } from './creative-attack';
```

Add a new case inside `dispatch`'s switch (after `ActionKind.Attack`):
```ts
case ActionKind.CreativeAttack:
  return handleCreativeAttack(action, repo, deps);
```

- [ ] **Step 4.2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (TypeScript will error if the new case is missing from the `ActionKind` exhaustion — confirm the switch compiles cleanly).

- [ ] **Step 4.3: Commit**

```bash
git add src/core/engine/actions/registry.ts
git commit -m "feat(dispatch): route creative_attack to its handler"
```

---

## Task 5 — Update narration and NPC memory for `creative_attack`

**Files:**
- Modify: `src/core/engine/templates.ts`
- Modify: `src/core/engine/narrate.ts`
- Modify: `src/core/engine/npc-mind.ts`

- [ ] **Step 5.1: Add `renderCreativeAttackMechanical` to `templates.ts`**

Append after `renderAttackMechanical` (line 339):

```ts
export function renderCreativeAttackMechanical(
  event: Extract<DomainEvent, { kind: 'creative_attack' }>,
  actor: Agent,
  target: Agent,
  observer: Agent,
): string {
  const actorName = observer.id === actor.id ? 'You' : actor.label;
  const targetName = observer.id === target.id ? 'you' : target.label;
  if (event.outcome === AttackOutcome.Hit) {
    const targetSubject = observer.id === target.id ? 'You take' : `${target.label} takes`;
    return `${actorName}: ${event.narrative}. Hit! ${targetSubject} ${event.damageDealt} damage.`;
  }
  return `${actorName}: ${event.narrative}. Miss.`;
}
```

Add `import { AttackOutcome } from '@core/domain/kinds';` to `templates.ts` if not already present (it is already there at line 4).

- [ ] **Step 5.2: Update `narrate.ts` — four locations**

**Import:** Add `renderCreativeAttackMechanical` to the import from `./templates`:
```ts
import { renderAttackMechanical, renderCreativeAttackMechanical, renderEmoteMechanical, renderSpeakMechanical } from './templates';
```

**`buildUserPrompt`** — add a branch after the `EventKind.Attack` block (lines 85–90):
```ts
} else if (event.kind === EventKind.CreativeAttack && target) {
  lines.push('Event: creative_attack');
  lines.push(`Narrative: "${event.narrative}"`);
  lines.push(`Outcome: ${event.outcome}`);
  lines.push(`Damage dealt: ${event.damageDealt}`);
  lines.push(`Target HP after: ${target.hp}`);
}
```

**`summariseEvent`** — add a case after `EventKind.Attack` (line 139):
```ts
case EventKind.CreativeAttack:
  return `${event.actorId} ${event.narrative} (${event.outcome}${event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : ''})`;
```

**`narrateMechanical`** — add a branch after the attack check (line 170):
```ts
if (event.kind === EventKind.CreativeAttack && target)
  return renderCreativeAttackMechanical(event, actor, target, observer);
```

**`narrate`** — update the early-return guard (lines 182–186) and the target-loading block:
```ts
if (
  event.kind !== EventKind.Speak &&
  event.kind !== EventKind.Attack &&
  event.kind !== EventKind.CreativeAttack &&
  event.kind !== EventKind.Emote
)
  return '';
// ...
if (event.kind === EventKind.Attack || event.kind === EventKind.CreativeAttack) {
  target = await repo.getAgent(event.targetAgentId);
} else if ( ...
```

- [ ] **Step 5.3: Update `npc-mind.ts` — memory formatter and targeted-event check**

In the `formatEvent` switch (line 267, after the `EventKind.Attack` case):
```ts
case EventKind.CreativeAttack: {
  const targetLabel = await labelOf(event.targetAgentId);
  const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
  if (event.targetAgentId === selfId) {
    return `${actorLabel} ${event.narrative} — hit you (${event.outcome}${dmg})`;
  }
  return `${actorLabel} ${event.narrative} (${event.outcome}${dmg})`;
}
```

In the targeted-event predicate (line 389), add `CreativeAttack` alongside `Attack`:
```ts
((m.kind === EventKind.Speak || m.kind === EventKind.Attack || m.kind === EventKind.CreativeAttack) && m.targetAgentId === selfId) ||
```

- [ ] **Step 5.4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/core/engine/templates.ts src/core/engine/narrate.ts src/core/engine/npc-mind.ts
git commit -m "feat(narrate): add creative_attack narration, mechanical fallback, and NPC memory"
```

---

## Task 6 — Extend the consequence engine for `creative_attack`

**Files:**
- Modify: `src/core/engine/consequences.ts`

- [ ] **Step 6.1: Add creative_attack guidance to `SYSTEM_PROMPT_LINES`**

Append to `SYSTEM_PROMPT_LINES` (after the existing last line):
```ts
'',
'When to emit creative_attack:',
'- A player or NPC used the environment creatively in a way that would realistically cause damage: shoving furniture, triggering a hazard, using a prop as a weapon, dropping something heavy.',
'- Do NOT emit if the action is silly or physically implausible (hypnotising a troll with a spoon, invoking fire that does not exist). Implausible actions produce no consequence.',
'- Do NOT emit if the actor already dispatched a standard attack action this turn — creative_attack is for non-attack actions that happen to cause harm.',
'',
'For creative_attack set:',
'- actorRef: natural-language name of the actor (e.g. "Paff Pinkerton")',
'- targetRef: natural-language name of the target (e.g. "the orc")',
'- toHit: { sides: 20, threshold: N } — threshold reflects cleverness: inspired idea 4-6, solid idea 10-14, clumsy idea 16+',
'- damage: { count, sides, bonus } — reflects physical severity: small hazard 1d4, moderate 1d6-1d8, serious 2d6',
'- narrative: one sentence of prose describing what happened (e.g. "Mira sweeps the candelabra into the orc\'s face")',
```

- [ ] **Step 6.2: Add `creative_attack` variant to `CONSEQUENCE_SCHEMA`**

In the `items.anyOf` array of `CONSEQUENCE_SCHEMA`, after the `reveal_item` variant, add:

```ts
{
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'actorRef', 'targetRef', 'toHit', 'damage', 'narrative'],
  properties: {
    kind: { type: 'string', enum: ['creative_attack'] },
    actorRef: { type: 'string' },
    targetRef: { type: 'string' },
    toHit: {
      type: 'object',
      additionalProperties: false,
      required: ['sides', 'threshold'],
      properties: {
        sides: { type: 'integer', minimum: 4, maximum: 20 },
        threshold: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
    damage: {
      type: 'object',
      additionalProperties: false,
      required: ['count', 'sides', 'bonus'],
      properties: {
        count: { type: 'integer', minimum: 1, maximum: 6 },
        sides: { type: 'integer', minimum: 4, maximum: 12 },
        bonus: { type: 'integer', minimum: 0, maximum: 5 },
      },
    },
    narrative: { type: 'string' },
  },
},
```

- [ ] **Step 6.3: Add `creative_attack` variant to `RawConsequence`**

```ts
| {
    readonly kind: 'creative_attack';
    readonly actorRef: string;
    readonly targetRef: string;
    readonly toHit: { readonly sides: number; readonly threshold: number };
    readonly damage: { readonly count: number; readonly sides: number; readonly bonus: number };
    readonly narrative: string;
  }
```

- [ ] **Step 6.4: Add `creative_attack` case to `parseConsequenceResponse`**

After the `reveal_item` parsing block (around line 280), add:

```ts
if (kind === ActionKind.CreativeAttack) {
  const actorRef = entry.actorRef;
  const targetRef = entry.targetRef;
  const toHit = entry.toHit;
  const damage = entry.damage;
  const narrative = entry.narrative;
  if (
    typeof actorRef !== 'string' || actorRef.length === 0 ||
    typeof targetRef !== 'string' || targetRef.length === 0 ||
    typeof narrative !== 'string' || narrative.length === 0 ||
    !isRecord(toHit) || typeof toHit.sides !== 'number' || typeof toHit.threshold !== 'number' ||
    !isRecord(damage) || typeof damage.count !== 'number' || typeof damage.sides !== 'number' || typeof damage.bonus !== 'number'
  ) continue;
  out.push({
    kind: ActionKind.CreativeAttack,
    actorRef,
    targetRef,
    toHit: { sides: toHit.sides, threshold: toHit.threshold },
    damage: { count: damage.count, sides: damage.sides, bonus: damage.bonus },
    narrative,
  });
  continue;
}
```

- [ ] **Step 6.5: Add `creative_attack` to `summarise` and `agentsInvolved`**

In `summarise` (the async helper in `consequences.ts`), after the `EventKind.Attack` case:
```ts
case EventKind.CreativeAttack: {
  const actor = await labelOf(event.actorId);
  const target = await labelOf(event.targetAgentId);
  const dmg = event.outcome === AttackOutcome.Hit ? `, ${event.damageDealt} dmg` : '';
  return `${actor} ${event.narrative} (${event.outcome}${dmg}) against ${target}`;
}
```

In `agentsInvolved`, add `EventKind.CreativeAttack` alongside `EventKind.Attack` in the target-loading check:
```ts
if (e.kind === EventKind.Attack || e.kind === EventKind.CreativeAttack || e.kind === EventKind.Give) {
  await add(e.targetAgentId);
}
```

- [ ] **Step 6.6: Resolve and emit `creative_attack` actions in `consequencesFor`**

In the action-building loop (after the `ActionKind.RevealItem` block, around line 920):
```ts
if (raw.kind === ActionKind.CreativeAttack) {
  const actor = resolveAgent(raw.actorRef, ctx.agents);
  const target = resolveAgent(raw.targetRef, ctx.agents);
  if (!actor.ok || !target.ok) continue;
  actions.push({
    kind: ActionKind.CreativeAttack,
    actorId: actor.agent.id,
    targetAgentId: target.agent.id,
    toHit: raw.toHit,
    damage: raw.damage,
    narrative: raw.narrative,
  });
  continue;
}
```

- [ ] **Step 6.7: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6.8: Commit**

```bash
git add src/core/engine/consequences.ts
git commit -m "feat(consequences): emit creative_attack actions for creative in-combat damage"
```

---

## Task 7 — Add consequence integration test for `creative_attack`

**Files:**
- Modify: `src/core/engine/consequences.test.ts`

- [ ] **Step 7.1: Write the failing test**

Add to `consequences.test.ts`:

```ts
import { handleCreativeAttack } from './actions/creative-attack';

// (add to existing describe block or add a new one)
describe('consequencesFor — creative_attack', () => {
  it('emits a creative_attack action when the LLM returns one', async () => {
    const repo = repoFor();
    const fakeResponse = {
      updatedStorySoFar: null,
      consequences: [
        {
          kind: 'creative_attack',
          actorRef: 'Paff',
          targetRef: 'Paff', // targets themselves for simplicity — just testing parsing
          toHit: { sides: 20, threshold: 1 },
          damage: { count: 1, sides: 6, bonus: 0 },
          narrative: 'Paff smashes the lantern overhead',
        },
      ],
    };
    const llm = makeFakeLanguageModel(fakeResponse);
    const actions = await consequencesFor([takeEvent], repo, llm);
    const ca = actions.find((a) => a.kind === 'creative_attack');
    expect(ca).toBeTruthy();
    if (!ca || ca.kind !== 'creative_attack') throw new Error();
    expect(ca.narrative).toBe('Paff smashes the lantern overhead');
    expect(ca.toHit).toEqual({ sides: 20, threshold: 1 });
    expect(ca.damage).toEqual({ count: 1, sides: 6, bonus: 0 });
  });

  it('drops malformed creative_attack consequences silently', async () => {
    const repo = repoFor();
    const fakeResponse = {
      updatedStorySoFar: null,
      consequences: [
        { kind: 'creative_attack' }, // missing required fields
      ],
    };
    const llm = makeFakeLanguageModel(fakeResponse);
    const actions = await consequencesFor([takeEvent], repo, llm);
    expect(actions.filter((a) => a.kind === 'creative_attack')).toHaveLength(0);
  });
});
```

Note: `repoFor` and `takeEvent` are defined in the existing test file. The test uses `paff` as both actor and target since that agent is in `ctx.agents` (as the actor of `takeEvent`) — no need to add a second agent to this test.

- [ ] **Step 7.2: Run the test to confirm it fails**

```bash
npx vitest run src/core/engine/consequences.test.ts
```

Expected: FAIL — `creative_attack` actions not yet emitted.

*(After completing Task 6, re-run to confirm they pass.)*

- [ ] **Step 7.3: Run the test to confirm it passes (after Task 6 is done)**

```bash
npx vitest run src/core/engine/consequences.test.ts
```

Expected: all tests pass.

- [ ] **Step 7.4: Run the full suite one final time**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/core/engine/consequences.test.ts
git commit -m "test(consequences): verify creative_attack consequence parsing and action emission"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - `creative_attack` action with `toHit`, `damage`, `narrative` ✓ (Task 2, 3)
  - Consequence engine prompt rewards cleverness via threshold, severity via damage dice ✓ (Task 6.1)
  - Plausibility gate (no silly ideas) documented in prompt ✓ (Task 6.1)
  - LLM-chosen dice resolved by seeded RNG ✓ (Task 3.3)
  - Death path reused ✓ (Task 1 + 3.3)
  - Works for both player and NPC actors ✓ (consequence engine handles all events)
  - Narrative flows to event ✓ (Task 3.3)

- **DRY:** `applyDeathEffects` extracted in Task 1; both `attack.ts` and `creative-attack.ts` use it.

- **SOLID:** Handler has one responsibility; parsing, resolving, and dispatch are separate concerns.

- **Type consistency:** `ActionKind.CreativeAttack = 'creative_attack'` used in kinds, actions, events, registry, consequences, narrate, npc-mind — all reference the same constant.
