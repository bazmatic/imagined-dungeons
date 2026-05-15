# Spawn Segment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface creature spawn messages ("Brooding Ash-Zombie appears here.") as a distinct amber-coloured `Spawn` segment in the player's `render` output rather than as a plain witnessed string.

**Architecture:** Add `Spawn` to `SegmentKind`. In `tick.ts`'s spawn pass loop, intercept `AgentSpawned` events and push the spawn announcement directly onto `playerRender` as a `Spawn` segment instead of into `witnessed`. The LLM-generated spawn narration (the descriptive prose) stays in `witnessed` unchanged.

**Tech Stack:** TypeScript, Vitest, React inline styles.

---

## File map

**Modified:**
- `src/core/domain/segments.ts` — add `Spawn` kind
- `src/core/engine/tick.ts` — spawn pass loop routes AgentSpawned → playerRender
- `app/routes/index.tsx` — add Spawn style to `styleForSegment`
- `src/core/engine/tick.test.ts` — update any spawn-related assertions

---

## Task 1: Add `Spawn` to `SegmentKind` and style it

**Files:**
- Modify: `src/core/domain/segments.ts`
- Modify: `app/routes/index.tsx`

- [ ] **Step 1: Add `Spawn` to `SegmentKind` in `src/core/domain/segments.ts`**

```ts
export const SegmentKind = {
  LocationName:        'location-name',
  LocationDescription: 'location-description',
  ItemList:            'item-list',
  CharacterList:       'character-list',
  ExitList:            'exit-list',
  NoExits:             'no-exits',
  Feedback:            'feedback',
  Narration:           'narration',
  Error:               'error',
  Inventory:           'inventory',
  Spawn:               'spawn',
} as const;
export type SegmentKind = (typeof SegmentKind)[keyof typeof SegmentKind];

export interface Segment {
  readonly kind: SegmentKind;
  readonly text: string;
}
```

- [ ] **Step 2: Add `Spawn` case to `styleForSegment` in `app/routes/index.tsx`**

Find the `styleForSegment` switch in `app/routes/index.tsx`. The switch currently has no `default` — adding `Spawn` here satisfies the exhaustive check. Add the case before `Error`:

```ts
    case SegmentKind.Spawn:
      return { color: '#ffaa44', fontWeight: 700 };
    case SegmentKind.Error:
      return { color: '#ff9999', fontWeight: 700 };
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no new errors. (Pre-existing `TemplateForm.tsx` errors are unrelated — ignore them.)

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/segments.ts app/routes/index.tsx
git commit -m "feat: add Spawn segment kind with amber styling"
```

---

## Task 2: Route spawn announcements into `playerRender`

**Files:**
- Modify: `src/core/engine/tick.ts` (lines 549–553)
- Modify: `src/core/engine/tick.test.ts` (if any spawn assertions exist)

### Background

Currently the spawn pass loop (lines 549–553 of `tick.ts`) routes every spawn event through `renderWitnessForPlayer` and pushes the result into `witnessed`:

```ts
for (const ev of spawnResult.events) {
  events.push(ev);
  const line = await renderWitnessForPlayer(ev, playerId, repo);
  if (line !== null && line.length > 0) witnessed.push(line);
}
```

`renderWitnessForPlayer` for an `AgentSpawned` event calls `renderAgentSpawnedObserved(spawned.label)` and returns `"Brooding Ash-Zombie appears here."` — a plain string with no colour.

The goal: intercept `AgentSpawned` events and push the announcement into `playerRender` as `{ kind: SegmentKind.Spawn, text }` instead. Non-AgentSpawned events in the spawn pass (rare but possible) stay routed to `witnessed` as before. The LLM narration block (lines 555–563) is unchanged.

- [ ] **Step 1: Update the spawn pass loop in `src/core/engine/tick.ts`**

`SegmentKind` and `renderAgentSpawnedObserved` are already imported at the top of `tick.ts`. Only the loop body changes.

Replace lines 549–553:

```ts
// Before:
for (const ev of spawnResult.events) {
  events.push(ev);
  const line = await renderWitnessForPlayer(ev, playerId, repo);
  if (line !== null && line.length > 0) witnessed.push(line);
}
```

With:

```ts
// After:
for (const ev of spawnResult.events) {
  events.push(ev);
  if (ev.kind === EventKind.AgentSpawned && ev.witnesses.some((w) => w === playerId)) {
    const spawned = await repo.getAgent(ev.spawnedAgentId);
    const text = renderAgentSpawnedObserved(spawned.label);
    playerRender = [...playerRender, { kind: SegmentKind.Spawn, text }];
  } else {
    const line = await renderWitnessForPlayer(ev, playerId, repo);
    if (line !== null && line.length > 0) witnessed.push(line);
  }
}
```

- [ ] **Step 2: Run tests to see what fails**

```bash
npm test 2>&1 | grep -E "FAIL|×|✗" | head -20
```

If any tick tests assert that a spawn message appears in `r.witnessed`, they now need to check `r.render` for a `Spawn` segment instead. (A grep of `tick.test.ts` for "appears here" or "AgentSpawned" will reveal which tests need updating.)

- [ ] **Step 3: Update any failing tick tests**

If a test previously checked `r.witnessed` for a spawn message like:
```ts
expect(r.witnessed.some((w) => w.includes('appears here'))).toBe(true);
```

Change it to:
```ts
import { SegmentKind } from '@core/domain/segments';
// ...
expect(r.render.some((s) => s.kind === SegmentKind.Spawn && s.text.includes('appears here'))).toBe(true);
```

If a test checked that `r.witnessed` does NOT contain a spawn message, verify the assertion still holds (the narration prose remains in witnessed; the announcement moves to render).

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: 497+ tests passing, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine/tick.ts src/core/engine/tick.test.ts
git commit -m "feat: route spawn announcements to render as Spawn segments"
```
