# Semantic Console Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `render: string` throughout the engine with `render: readonly Segment[]` so the client can style each piece of game output based on its semantic kind rather than text-shape heuristics.

**Architecture:** Add a `SegmentKind` const + `Segment` interface in `src/core/domain/segments.ts`. Change every render-path template function to return `readonly Segment[]`, propagate the type up through `ActionOutcome` → `TurnResult` → `TickResult` → server API → client. Delete the heuristic classifier in `index.tsx` and replace with a direct `kind → style` lookup.

**Tech Stack:** TypeScript, Vitest, React, TanStack Start

---

## File map

**New:**
- `src/core/domain/segments.ts` — `SegmentKind` const, `Segment` interface

**Modified (engine):**
- `src/core/engine/actions/types.ts` — `ActionOutcome.render: readonly Segment[]`
- `src/core/engine/templates.ts` — all render-path functions return `readonly Segment[]`
- `src/core/engine/actions/move.ts` — render type update
- `src/core/engine/actions/take.ts` — render type update
- `src/core/engine/actions/drop.ts` — render type update
- `src/core/engine/actions/give.ts` — render type update
- `src/core/engine/actions/inventory.ts` — render type update
- `src/core/engine/actions/equip.ts` — render type update
- `src/core/engine/actions/open.ts` — render type update + inline literal wrapping
- `src/core/engine/actions/close.ts` — render type update + inline literal wrapping
- `src/core/engine/actions/buy.ts` — render type update
- `src/core/engine/actions/sell.ts` — render type update
- `src/core/engine/actions/offer.ts` — render type update
- `src/core/engine/actions/look.ts` — render type update
- `src/core/engine/actions/attack.ts` — placeholder render wrapped as `Narration`
- `src/core/engine/actions/speak.ts` — placeholder render wrapped as `Narration`
- `src/core/engine/actions/emote.ts` — placeholder render wrapped as `Narration`
- `src/core/engine/actions/reveal-item.ts` — inline wrap of `renderRevealObserved`
- `src/core/engine/actions/search.ts` — complex multi-segment assembly rewrite
- `src/core/engine/turn.ts` — `TurnResult.render`, error/narration paths
- `src/core/engine/tick.ts` — `TickResult.render`, wait/move-append paths

**Modified (client):**
- `app/routes/index.tsx` — discriminated `Line` type, `styleForSegment`, remove heuristics

**Modified (tests):**
- `src/core/engine/templates.test.ts`
- `src/core/engine/actions/look.test.ts`
- `src/core/engine/actions/move.test.ts`
- `src/core/engine/actions/take.test.ts`
- `src/core/engine/actions/drop.test.ts`
- `src/core/engine/actions/give.test.ts`
- `src/core/engine/actions/equip.test.ts`
- `src/core/engine/actions/open.test.ts`
- `src/core/engine/actions/close.test.ts`
- `src/core/engine/actions/buy.test.ts`
- `src/core/engine/actions/offer.test.ts`
- `src/core/engine/actions/search.test.ts`
- `src/core/engine/actions/speak.test.ts`
- `src/core/engine/actions/emote.test.ts`
- `src/core/engine/turn.test.ts`
- `src/core/engine/tick.test.ts`

**Not changed** (`render*Observed` + mechanical narration fallbacks stay `string` — they feed `witnessed: string[]` not `render: Segment[]`):
- `src/core/engine/narrate.ts`, `renderSpeakMechanical`, `renderEmoteMechanical`, `renderAttackMechanical`, all `render*Observed` functions

---

## Task 1: Domain types

**Files:**
- Create: `src/core/domain/segments.ts`

- [ ] **Step 1: Create the file**

```ts
// src/core/domain/segments.ts
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
} as const;
export type SegmentKind = (typeof SegmentKind)[keyof typeof SegmentKind];

export interface Segment {
  readonly kind: SegmentKind;
  readonly text: string;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/segments.ts
git commit -m "feat: add Segment domain types"
```

---

## Task 2: Engine + client migration

> **Important:** Complete ALL steps in this task before committing. The project will not typecheck mid-task because changing interfaces propagates errors to callers. Follow the steps top-to-bottom and use `npm run typecheck` to see remaining errors at any point.

**Files:**
- Modify: `src/core/engine/actions/types.ts`
- Modify: `src/core/engine/templates.ts`
- Modify: `src/core/engine/actions/move.ts`, `take.ts`, `drop.ts`, `give.ts`, `inventory.ts`, `equip.ts`, `open.ts`, `close.ts`, `buy.ts`, `sell.ts`, `offer.ts`, `look.ts`, `attack.ts`, `speak.ts`, `emote.ts`, `reveal-item.ts`, `search.ts`
- Modify: `src/core/engine/turn.ts`
- Modify: `src/core/engine/tick.ts`
- Modify: `app/routes/index.tsx`

### 2a — Change `ActionOutcome.render` type

- [ ] **Step 1: Update `src/core/engine/actions/types.ts`**

```ts
import type { Segment } from '@core/domain/segments';
import type { DomainEvent } from '@core/domain/events';

export interface ActionOutcome {
  readonly render: readonly Segment[];
  readonly event: DomainEvent;
}
```

### 2b — Update template functions

- [ ] **Step 2: Replace imports and update all render-path functions in `src/core/engine/templates.ts`**

Add to the top of the file:
```ts
import { type Segment, SegmentKind } from '@core/domain/segments';
```

Replace each render-path function. Functions that are NOT listed here (`renderGiveByActor`, `renderGiveObserved`, all `render*Observed` functions, `renderSpeakMechanical`, `renderEmoteMechanical`, `renderAttackMechanical`, `renderTradeObserved`) **stay as `string`** — they feed the `witnessed` array, not `render`.

```ts
export function renderLook(view: PerceptionView): readonly Segment[] {
  const segs: Segment[] = [
    { kind: SegmentKind.LocationName, text: view.location.label },
    { kind: SegmentKind.LocationDescription, text: view.location.longDescription },
  ];
  if (view.items.length > 0)
    segs.push({ kind: SegmentKind.ItemList, text: `You see: ${list(view.items)}.` });
  if (view.agents.length > 0)
    segs.push({ kind: SegmentKind.CharacterList, text: `Also here: ${list(view.agents)}.` });
  if (view.exits.length > 0) {
    const parts = view.exits.map((e) => {
      const tag = e.locked ? `${e.label}, locked` : e.label;
      return `${e.direction} (${tag})`;
    });
    segs.push({ kind: SegmentKind.ExitList, text: `Exits: ${parts.join(', ')}.` });
  } else {
    segs.push({ kind: SegmentKind.NoExits, text: 'There are no obvious exits.' });
  }
  return segs;
}

export function renderLookTarget(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Narration, text: item.longDescription }];
}

export function renderLookAgent(agent: Agent): readonly Segment[] {
  const parts: string[] = [];
  const desc =
    agent.longDescription && agent.longDescription.length > 0
      ? agent.longDescription
      : agent.shortDescription && agent.shortDescription.length > 0
        ? agent.shortDescription
        : '';
  parts.push(desc.length > 0 ? desc : `You see ${agent.label}.`);
  if (agent.mood) parts.push(`They seem ${agent.mood.toLowerCase()}.`);
  if (agent.hp <= 0) parts.push('They are unconscious.');
  return [{ kind: SegmentKind.Narration, text: parts.join(' ') }];
}

export function renderLookExit(exit: Exit): readonly Segment[] {
  const status = exit.locked ? 'It is locked.' : 'It is unobstructed.';
  return [{ kind: SegmentKind.Narration, text: `The ${exit.label} leads ${exit.direction}. ${status}` }];
}

export function renderMoveSelf(dir: Direction): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You go ${dir}.` }];
}

export function renderTakeSelf(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `Taken: ${item.label}.` }];
}

export function renderDropSelf(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `Dropped: ${item.label}.` }];
}

export function renderGiveSelf(item: Item, recipient: Agent): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You give ${item.label} to ${recipient.label}.` }];
}

export function renderEquipSelf(item: Item, manner: string): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You ${manner} the ${item.label}.` }];
}

export function renderUnequipSelf(item: Item, manner: string): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You ${manner} the ${item.label}.` }];
}

export function renderOpenSelf(item: Item, contents: readonly Item[], unlocked: boolean): readonly Segment[] {
  const lead = unlocked
    ? `You unlock the ${item.label} and open it.`
    : `You open the ${item.label}.`;
  if (contents.length === 0) return [{ kind: SegmentKind.Feedback, text: `${lead} It is empty.` }];
  const names = contents.map((c) => c.label).join(', ');
  return [{ kind: SegmentKind.Feedback, text: `${lead} Inside: ${names}.` }];
}

export function renderCloseSelf(item: Item): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You close the ${item.label}.` }];
}

export function renderTradeSelf(
  _buyer: Agent,
  seller: Agent,
  item: Item,
  price: number,
  accepted: boolean,
  narration: string,
): readonly Segment[] {
  if (narration.length > 0) return [{ kind: SegmentKind.Narration, text: narration }];
  return [{
    kind: SegmentKind.Narration,
    text: accepted
      ? `${seller.label} accepts ${price} gold for the ${item.label}.`
      : `${seller.label} refuses ${price} gold for the ${item.label}.`,
  }];
}

export function renderOfferSelf(item: Item, price: number): readonly Segment[] {
  return [{ kind: SegmentKind.Feedback, text: `You set the price of the ${item.label} at ${price} gold.` }];
}

export function renderInventory(items: readonly Item[]): readonly Segment[] {
  if (items.length === 0) return [{ kind: SegmentKind.Inventory, text: 'You are carrying nothing.' }];
  const equipped = items.filter((i) => i.equipped);
  const carried = items.filter((i) => !i.equipped);
  const parts: string[] = [];
  if (carried.length > 0) parts.push(`You are carrying: ${listInventory(carried)}.`);
  if (equipped.length > 0) parts.push(`Equipped: ${listInventory(equipped)}.`);
  return [{ kind: SegmentKind.Inventory, text: parts.join(' ') }];
}

export function renderParseError(err: ParseError): readonly Segment[] {
  const text = (() => {
    switch (err.kind) {
      case ParseErrorKind.Empty:
        return 'Please type a command.';
      case ParseErrorKind.UnknownVerb:
        return `I don't know the verb "${err.verb}".`;
      case ParseErrorKind.MissingArgument:
        return `The verb "${err.verb}" needs something to act on.`;
      case ParseErrorKind.UnknownDirection:
        return `"${err.raw}" isn't a direction I understand.`;
      case ParseErrorKind.NoSuchTarget:
        return `You don't see any "${err.ref}" here.`;
      case ParseErrorKind.AmbiguousTarget:
        return `Which do you mean — ${err.candidates.join(' or ')}?`;
      case ParseErrorKind.AlreadyCarried:
        return `You are already carrying the ${err.label}.`;
      case ParseErrorKind.ImpossibleAction:
        return err.reason;
    }
  })();
  return [{ kind: SegmentKind.Error, text }];
}

export function renderActionError(reason: string): readonly Segment[] {
  return [{ kind: SegmentKind.Error, text: reason }];
}
```

### 2c — Fix action handlers

Most action handlers just call a template function — since those now return `Segment[]` matching `ActionOutcome.render`, no change is needed to the return statement itself. TypeScript will guide you to the exceptions.

- [ ] **Step 3: Fix `src/core/engine/actions/open.ts`**

Line 35 has an inline string literal. Wrap it and add the import:

```ts
import { SegmentKind } from '@core/domain/segments';
```

Change line 35:
```ts
// Before:
return Ok({ render: `The ${item.label} is already open.`, event });
// After:
return Ok({ render: [{ kind: SegmentKind.Feedback, text: `The ${item.label} is already open.` }], event });
```

- [ ] **Step 4: Fix `src/core/engine/actions/close.ts`**

Same pattern. Add the import and change line 38:
```ts
import { SegmentKind } from '@core/domain/segments';
```

```ts
// Before:
return Ok({ render: `The ${item.label} is already closed.`, event });
// After:
return Ok({ render: [{ kind: SegmentKind.Feedback, text: `The ${item.label} is already closed.` }], event });
```

- [ ] **Step 5: Fix `src/core/engine/actions/attack.ts`, `speak.ts`, `emote.ts`**

Each has a placeholder: `return Ok({ render: '…', event })`. Wrap it. Add the import to each file:
```ts
import { SegmentKind } from '@core/domain/segments';
```

Change the placeholder in each:
```ts
// Before:
return Ok({ render: '…', event });
// After:
return Ok({ render: [{ kind: SegmentKind.Narration, text: '…' }], event });
```

- [ ] **Step 6: Fix `src/core/engine/actions/reveal-item.ts`**

`renderRevealObserved` stays as a `string` function (it's also used in the witnessed path). Wrap its output inline. Add the import:
```ts
import { SegmentKind } from '@core/domain/segments';
```

Change the return:
```ts
// Before:
return Ok({ render: renderRevealObserved(item), event });
// After:
return Ok({ render: [{ kind: SegmentKind.Narration, text: renderRevealObserved(item) }], event });
```

- [ ] **Step 7: Rewrite `src/core/engine/actions/search.ts`**

`renderRevealObserved` stays as string. `renderLookTarget` and `renderLookAgent` now return `Segment[]`. The join-based assembly changes to array concatenation. Add the import:
```ts
import { type Segment, SegmentKind } from '@core/domain/segments';
```

Change the local accumulator variable name from `autoRevealLines: string[]` to `autoRevealSegs: Segment[]`:
```ts
const autoRevealSegs: Segment[] = [];
for (const hidden of undiscoveredItems) {
  if (response.matchedItemId === hidden.id) continue;
  await repo.setItemHidden(hidden.id, false);
  autoRevealSegs.push({ kind: SegmentKind.Narration, text: renderRevealObserved({ ...hidden, hidden: false }) });
}
```

Change each `Ok` return site that was assembling strings with `join('\n')` to concatenate `Segment[]` arrays:

```ts
// MATCH visible item:
const render = [...autoRevealSegs, ...renderLookTarget(matchedVisible)];
return Ok({ render, event });

// MATCH hidden item (revealed):
const matchSegs: readonly Segment[] = [
  { kind: SegmentKind.Narration, text: renderRevealObserved(revealed) },
  ...renderLookTarget(revealed),
];
const render = [...autoRevealSegs, ...matchSegs];
return Ok({ render, event });

// MATCH agent:
const render = [...autoRevealSegs, ...renderLookAgent(matchedAgent)];
return Ok({ render, event });

// NARRATE fallback (response.narration is a string from the LLM):
const narrationSeg: Segment[] = response.narration.length > 0
  ? [{ kind: SegmentKind.Narration, text: response.narration }]
  : [];
const render = [...autoRevealSegs, ...narrationSeg];
return Ok({ render, event });
```

### 2d — Update `turn.ts`

- [ ] **Step 8: Update `src/core/engine/turn.ts`**

Add the import:
```ts
import { type Segment, SegmentKind } from '@core/domain/segments';
```

Change `TurnResult`:
```ts
export interface TurnResult {
  readonly render: readonly Segment[];
  readonly events: readonly DomainEvent[];
}
```

Change the failed-parse error return (appears twice):
```ts
// Before:
return { render: reason, events: [failed] };
// After (both occurrences):
return { render: [{ kind: SegmentKind.Error, text: reason }], events: [failed] };
```

Change the "nothing of note" budget-exhausted fallback:
```ts
// Before:
return { render: 'You find nothing of note.', events: [event] };
// After:
return { render: [{ kind: SegmentKind.Narration, text: 'You find nothing of note.' }], events: [event] };
```

Change the narration enrichment block. Find:
```ts
let event = outcome.event;
let render = outcome.render;
```
Change `render`'s type annotation is now inferred as `readonly Segment[]` from `outcome.render`. Then update the narration assignment:
```ts
// Before:
render = narrations[actorId] ?? render;
// After:
const narration = narrations[actorId];
if (narration && narration.length > 0) {
  render = [{ kind: SegmentKind.Narration, text: narration }];
}
```

### 2e — Update `tick.ts`

- [ ] **Step 9: Update `src/core/engine/tick.ts`**

Add the import:
```ts
import { type Segment, SegmentKind } from '@core/domain/segments';
```

Change `TickResult`:
```ts
export interface TickResult {
  readonly render: readonly Segment[];
  readonly witnessed: readonly string[];
  readonly events: readonly DomainEvent[];
}
```

Find `let playerRender: string;` and change it:
```ts
let playerRender: readonly Segment[];
```

Change the wait case:
```ts
// Before:
playerRender = 'You wait.';
// After:
playerRender = [{ kind: SegmentKind.Feedback, text: 'You wait.' }];
```

Change the post-move look append:
```ts
// Before:
playerRender = `${playerRender}\n\n${renderLook(view)}`;
// After:
playerRender = [...playerResult.render, ...renderLook(view)];
```

### 2f — Update client

- [ ] **Step 10: Update `app/routes/index.tsx`**

Add the import at the top:
```ts
import { type Segment, SegmentKind } from '@core/domain/segments';
```

Replace the `Line` interface with a discriminated union:
```ts
type Line =
  | { id: number; kind: 'system'; segments: readonly Segment[] }
  | { id: number; kind: 'user' | 'witnessed'; text: string };
```

Update the initial line construction (line ~52):
```ts
// Before:
const [lines, setLines] = useState<Line[]>([{ id: 0, kind: 'system', text: initial.render }]);
// After:
const [lines, setLines] = useState<Line[]>([{ id: 0, kind: 'system', segments: initial.render }]);
```

Update the submit handler's `setLines` call to use `segments`:
```ts
// Before:
const next: Line[] = [...ls, { id: idRef.current++, kind: 'system', text: r.render }];
// After:
const next: Line[] = [...ls, { id: idRef.current++, kind: 'system', segments: r.render }];
```

Delete the heuristic classifier block entirely — remove `LIST_PREFIXES`, `isListLine`, `isNarrationLine`, and `styleForSystemSubline`.

Add the segment style lookup function (place it where `styleForSystemSubline` was):
```ts
const styleForSegment = (kind: SegmentKind): React.CSSProperties => {
  switch (kind) {
    case SegmentKind.LocationName:        return { fontSize: 22, fontWeight: 600, letterSpacing: 0.5 };
    case SegmentKind.LocationDescription: return { fontStyle: 'italic' };
    case SegmentKind.Narration:           return { fontStyle: 'italic' };
    case SegmentKind.Error:               return { color: '#ff9999' };
    default:                              return {};
  }
};
```

Replace the `lines.map` render block:
```tsx
{lines.map((l) => {
  if (l.kind === 'system') {
    return (
      <div key={l.id} style={{ color: '#cfcfcf', marginBottom: 8 }}>
        {l.segments.map((seg, i) => (
          <div key={i} style={styleForSegment(seg.kind)}>{seg.text}</div>
        ))}
      </div>
    );
  }
  return (
    <div
      key={l.id}
      style={{
        color: colorFor(l.kind),
        marginBottom: 8,
        fontStyle: l.kind === 'witnessed' ? 'italic' : 'normal',
      }}
    >
      {l.text}
    </div>
  );
})}
```

- [ ] **Step 11: Verify typecheck is clean**

```bash
npm run typecheck
```
Expected: no errors. If there are errors, they are TypeScript guiding you to remaining call sites — fix them before proceeding.

- [ ] **Step 12: Commit (tests will fail — that is expected and fixed in Task 3)**

```bash
git add -p
git commit -m "feat: change render type to readonly Segment[] throughout engine and client"
```

---

## Task 3: Update tests

> Tests fail after Task 2 because `render` assertions use the old string format. Fix them all in this task.

**Files:**
- Modify: `src/core/engine/templates.test.ts`
- Modify: `src/core/engine/actions/look.test.ts`
- Modify: `src/core/engine/actions/move.test.ts`
- Modify: `src/core/engine/actions/take.test.ts`
- Modify: `src/core/engine/actions/drop.test.ts`
- Modify: `src/core/engine/actions/give.test.ts`
- Modify: `src/core/engine/actions/equip.test.ts`
- Modify: `src/core/engine/actions/open.test.ts`
- Modify: `src/core/engine/actions/close.test.ts`
- Modify: `src/core/engine/actions/buy.test.ts`
- Modify: `src/core/engine/actions/offer.test.ts`
- Modify: `src/core/engine/actions/search.test.ts`
- Modify: `src/core/engine/actions/speak.test.ts`
- Modify: `src/core/engine/actions/emote.test.ts`
- Modify: `src/core/engine/turn.test.ts`
- Modify: `src/core/engine/tick.test.ts`

> Add `import { SegmentKind } from '@core/domain/segments';` to every test file that needs it.

### 3a — `templates.test.ts`

- [ ] **Step 1: Update `renderLook` tests**

```ts
it('renderLook produces a multi-line description with items, agents, exits', () => {
  const out = renderLook({ actor: npc, location: loc, items: [itemA], agents: [npc], exits: [exitN, exitS] });
  expect(out[0]).toEqual({ kind: SegmentKind.LocationName, text: 'The Goblet' });
  expect(out[1]).toEqual({ kind: SegmentKind.LocationDescription, text: 'A tavern with one wall aflame.' });
  expect(out[2]).toEqual({ kind: SegmentKind.ItemList, text: 'You see: fire map.' });
  expect(out[3]).toEqual({ kind: SegmentKind.CharacterList, text: 'Also here: Spark.' });
  expect(out[4]?.kind).toBe(SegmentKind.ExitList);
  expect(out[4]?.text).toContain('north (Tavern Back Door, locked)');
  expect(out[4]?.text).toContain('south (Tavern Front Door)');
});

it('renderLook with no items/agents omits those lines', () => {
  const out = renderLook({ actor: npc, location: loc, items: [], agents: [], exits: [exitS] });
  expect(out.every((s) => s.kind !== SegmentKind.ItemList)).toBe(true);
  expect(out.every((s) => s.kind !== SegmentKind.CharacterList)).toBe(true);
});
```

- [ ] **Step 2: Update single-segment tests in `templates.test.ts`**

```ts
it('renderMoveSelf names the direction', () => {
  expect(renderMoveSelf('north')).toEqual([{ kind: SegmentKind.Feedback, text: 'You go north.' }]);
});

it('renderTakeSelf and renderDropSelf name the item', () => {
  expect(renderTakeSelf(itemA)).toEqual([{ kind: SegmentKind.Feedback, text: 'Taken: fire map.' }]);
  expect(renderDropSelf(itemA)).toEqual([{ kind: SegmentKind.Feedback, text: 'Dropped: fire map.' }]);
});

it('renderInventory lists items or says empty', () => {
  expect(renderInventory([])).toEqual([{ kind: SegmentKind.Inventory, text: 'You are carrying nothing.' }]);
  expect(renderInventory([itemA])).toEqual([{ kind: SegmentKind.Inventory, text: 'You are carrying: fire map.' }]);
});

it('renderParseError covers all variants', () => {
  expect(renderParseError({ kind: 'empty' })[0]?.text).toMatch(/type a command/i);
  expect(renderParseError({ kind: 'unknown_verb', verb: 'frobnicate' })[0]?.text).toContain('frobnicate');
  expect(renderParseError({ kind: 'missing_argument', verb: 'take' })[0]?.text).toContain('take');
  expect(renderParseError({ kind: 'unknown_direction', raw: 'sideways' })[0]?.text).toContain('sideways');
  expect(renderParseError({ kind: 'no_such_target', ref: 'unicorn' })[0]?.text).toContain('unicorn');
  expect(
    renderParseError({ kind: 'ambiguous_target', ref: 'key', candidates: ['rusty key', 'silver key'] })[0]?.text,
  ).toContain('rusty key');
  expect(renderParseError({ kind: 'empty' })[0]?.kind).toBe(SegmentKind.Error);
});

it('renderActionError returns the supplied reason', () => {
  expect(renderActionError("You can't go that way.")).toEqual([
    { kind: SegmentKind.Error, text: "You can't go that way." },
  ]);
});
```

- [ ] **Step 3: Run templates tests**

```bash
npx vitest run src/core/engine/templates.test.ts
```
Expected: all pass.

### 3b — Action handler tests

- [ ] **Step 4: Update `src/core/engine/actions/look.test.ts`**

```ts
// Room look
expect(r.value.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'The Goblet' });
expect(r.value.render.some((s) => s.text.includes('A tavern.'))).toBe(true);
expect(r.value.render.some((s) => s.text.includes('fire map'))).toBe(true);

// Item look
expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: 'A real-time map.' }]);
```

- [ ] **Step 5: Update `src/core/engine/actions/move.test.ts`**

```ts
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You go north.' }]);
```

- [ ] **Step 6: Update `src/core/engine/actions/take.test.ts`**

```ts
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'Taken: fire map.' }]);
```

- [ ] **Step 7: Update `src/core/engine/actions/drop.test.ts`**

```ts
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'Dropped: fire map.' }]);
```

- [ ] **Step 8: Update `src/core/engine/actions/give.test.ts`**

```ts
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You give fire map to Spark.' }]);
```

- [ ] **Step 9: Update `src/core/engine/actions/equip.test.ts`**

```ts
// equip
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You put on the fireproof cloak.' }]);
// unequip
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You take off the fireproof cloak.' }]);
```

- [ ] **Step 10: Update `src/core/engine/actions/open.test.ts`**

```ts
// opens with contents
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You open the wooden box. Inside: rusty key.' }]);
// opens empty
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You open the wooden box. It is empty.' }]);
// already open
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'The wooden box is already open.' }]);
// unlock and open
expect(r.value.render[0]?.kind).toBe(SegmentKind.Feedback);
expect(r.value.render[0]?.text).toMatch(/^You unlock the wooden box and open it\./);
```

- [ ] **Step 11: Update `src/core/engine/actions/close.test.ts`**

```ts
// closes
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You close the wooden box.' }]);
// already closed
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'The wooden box is already closed.' }]);
```

- [ ] **Step 12: Update `src/core/engine/actions/buy.test.ts`**

```ts
expect(r.value.render[0]?.kind).toBe(SegmentKind.Narration);
expect(r.value.render[0]?.text).toContain('Deal');  // accepted

expect(r.value.render[0]?.kind).toBe(SegmentKind.Narration);
expect(r.value.render[0]?.text).toContain('Not for that');  // refused
```

- [ ] **Step 13: Update `src/core/engine/actions/offer.test.ts`**

```ts
expect(r.value.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You set the price of the cloak at 5 gold.' }]);
```

- [ ] **Step 14: Update `src/core/engine/actions/speak.test.ts` and `emote.test.ts`**

Both have `expect(r.value.render).toBe('…')`. Change to:
```ts
expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: '…' }]);
```

- [ ] **Step 15: Update `src/core/engine/actions/search.test.ts`**

Search tests assert on render with `toBe` and `toContain`. Change each assertion to check the segment array:

```ts
// flavour-only narration (line ~94)
expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: 'A spider scuttles into a crack.' }]);

// match visible item with auto-reveal — render contains the item description
expect(r.value.render.some((s) => s.text.includes('tarnished coin'))).toBe(true);

// match visible item — description text
expect(r.value.render.some((s) => s.text.includes('A real-time map of fire.'))).toBe(true);

// narration fallback
expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: 'A breeze whispers past — but nothing tangible.' }]);

// reveal hidden item — both reveal message and description appear
expect(r.value.render.some((s) => s.text.includes("hadn't noticed before"))).toBe(true);
expect(r.value.render.some((s) => s.text.includes('A real-time map of fire.'))).toBe(true);

// narration-only fallback (no item/agent match, no spawn — mock LLM returned this text)
expect(r.value.render).toEqual([{ kind: SegmentKind.Narration, text: 'You see nothing of consequence.' }]);
```

- [ ] **Step 16: Run all action tests**

```bash
npx vitest run src/core/engine/actions/
```
Expected: all pass.

### 3c — `turn.test.ts`

- [ ] **Step 17: Update `src/core/engine/turn.test.ts`**

```ts
// 'take fire map'
expect(r.render).toEqual([{ kind: SegmentKind.Feedback, text: 'Taken: fire map.' }]);

// unknown verb parse error
expect(r.render[0]?.kind).toBe(SegmentKind.Error);
expect(r.render[0]?.text).toContain('frobnicate');

// discovery narration (look ghost, with llm)
expect(r.render).toEqual([{ kind: SegmentKind.Narration, text: 'A faint shimmer in the air, but nothing more.' }]);

// failed look without builderRepo
expect(r.render[0]?.kind).toBe(SegmentKind.Error);
expect(r.render[0]?.text).toContain('ghost');

// action error (north with no exit)
expect(r.render[0]?.kind).toBe(SegmentKind.Error);
expect(r.render[0]?.text).toMatch(/can't go that way/i);
```

- [ ] **Step 18: Run turn tests**

```bash
npx vitest run src/core/engine/turn.test.ts
```
Expected: all pass.

### 3d — `tick.test.ts`

- [ ] **Step 19: Update `src/core/engine/tick.test.ts`**

```ts
// look returns Tavern (line ~138, ~186)
expect(r.render[0]).toEqual({ kind: SegmentKind.LocationName, text: 'Tavern' });

// render is truthy (line ~160) — an array is always truthy; change to:
expect(r.render.length).toBeGreaterThan(0);

// look after lantern consequence (line ~271)
expect(look.render.some((s) => s.text.includes('A tavern, now darker without the lantern.'))).toBe(true);
```

- [ ] **Step 20: Run all tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 21: Commit**

```bash
git add -p
git commit -m "test: update render assertions to Segment[] format"
```
