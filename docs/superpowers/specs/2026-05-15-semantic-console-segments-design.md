# Semantic Console Segments

**Date:** 2026-05-15
**Status:** Approved

## Problem

The game console receives a flat `render: string` from the engine. The client splits it on `\n` and uses heuristics to detect heading vs description vs list lines (`isListLine`, `isNarrationLine`, `styleForSystemSubline`). These heuristics are brittle — they guess the location name by finding the first non-list, non-period-ending line. Styling is coupled to text shape rather than meaning.

## Goal

Console output should carry its semantic type so the client can style each piece based on what it *is*, not what it looks like. No parsing, no heuristics.

## Approach

Replace `render: string` with `render: readonly Segment[]` throughout the engine stack. Each segment carries a `kind` (set at the point of production) and a `text`. The client maps kind to style directly.

`witnessed` lines remain `readonly string[]` — they are already semantically distinguished at the `Line` level and are all narration-style text.

---

## Domain Types — `src/core/domain/segments.ts` (new file)

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
} as const;
export type SegmentKind = (typeof SegmentKind)[keyof typeof SegmentKind];

export interface Segment {
  readonly kind: SegmentKind;
  readonly text: string;
}
```

- `LocationName` / `LocationDescription` / `ItemList` / `CharacterList` / `ExitList` / `NoExits` — fine-grained room-overview kinds from `renderLook`
- `Feedback` — short mechanical confirmations ("Taken: torch.", "You go north.")
- `Narration` — LLM prose, examination text, observed NPC actions surfaced in render
- `Error` — parse errors and action errors
- `Inventory` — inventory listing

---

## Template Functions — `src/core/engine/templates.ts`

Only functions that feed the `render` path change return type to `readonly Segment[]`. Functions used exclusively in the `witnessed` path (`renderWitnessForPlayer` in `tick.ts`) or in `narrate.ts` mechanical fallbacks keep returning `string` — changing them would conflict with `witnessed` staying as `readonly string[]`.

**Functions that change to `Segment[]`:**

| Function(s) | Kind |
|---|---|
| `renderLook` | `LocationName`, `LocationDescription`, `ItemList`?, `CharacterList`?, `ExitList` or `NoExits` |
| `renderLookTarget`, `renderLookAgent`, `renderLookExit` | `Narration` |
| `renderMoveSelf`, `renderTakeSelf`, `renderDropSelf`, `renderGiveSelf`, `renderEquipSelf`, `renderUnequipSelf`, `renderOpenSelf`, `renderCloseSelf`, `renderOfferSelf` | `Feedback` |
| `renderTradeSelf` | `Narration` |
| `renderInventory` | `Inventory` |
| `renderParseError`, `renderActionError` | `Error` |

`renderLook` is the only multi-segment function (2–5 segments). All others return a single-element array.

**Functions that stay as `string` (witnessed path / narrate.ts):**

All `render*Observed` functions (`renderMoveObserved`, `renderTakeObserved`, `renderDropObserved`, `renderGiveObserved`, `renderGiveByActor`, `renderLookObserved`, `renderEquipObserved`, `renderUnequipObserved`, `renderOpenObserved`, `renderCloseObserved`, `renderTradeObserved`, `renderAgentSpawnedObserved`, `renderAgentStateUpdatedObserved`, `renderDescriptionUpdatedObserved`), plus the mechanical narration fallbacks `renderSpeakMechanical`, `renderEmoteMechanical`, `renderAttackMechanical`.

`renderRevealObserved` is used in both the witnessed path and `search.ts` (render path). It stays as `string`; `search.ts` wraps its result inline: `{ kind: SegmentKind.Narration, text: renderRevealObserved(item) }`.

Example — `renderLook` after:
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
```

---

## Engine Type Changes

### `src/core/engine/actions/types.ts`
```ts
export interface ActionOutcome {
  readonly render: readonly Segment[];
  readonly event: DomainEvent;
}
```

### `src/core/engine/turn.ts`
```ts
export interface TurnResult {
  readonly render: readonly Segment[];
  readonly events: readonly DomainEvent[];
}
```

Error cases:
```ts
return { render: [{ kind: SegmentKind.Error, text: reason }], events: [failed] };
```

Narration enrichment path (`narrations[actorId]` is a string from the LLM):
```ts
const narration = narrations[actorId];
if (narration && narration.length > 0) {
  render = [{ kind: SegmentKind.Narration, text: narration }];
}
```

Wait fallback in `tick.ts`:
```ts
playerRender = [{ kind: SegmentKind.Feedback, text: 'You wait.' }];
```

"Nothing of note" budget-exhausted fallback in `turn.ts`:
```ts
return { render: [{ kind: SegmentKind.Narration, text: 'You find nothing of note.' }], events: [event] };
```

### `src/core/engine/tick.ts`
```ts
export interface TickResult {
  readonly render: readonly Segment[];
  readonly witnessed: readonly string[];
  readonly events: readonly DomainEvent[];
}
```

Post-move look append:
```ts
playerRender = [...playerResult.render, ...renderLook(view)];
```

### `src/core/engine/actions/search.ts`

`renderRevealObserved` stays as `string` (witnessed path). In the search render path, its result is wrapped inline as a `Narration` segment. Multi-segment assembly changes from `join('\n')` to array concatenation:
```ts
// Before:
autoRevealLines.push(renderRevealObserved({ ...hidden, hidden: false }));
const render = [...autoRevealLines, renderLookTarget(matchedVisible)].join('\n');
// After:
autoRevealSegs.push({ kind: SegmentKind.Narration, text: renderRevealObserved({ ...hidden, hidden: false }) });
const render = [...autoRevealSegs, ...renderLookTarget(matchedVisible)];
```

---

## Server Functions

`app/server/submit.ts` and `app/server/initial-view.ts` pass `result.render` through unchanged. TypeScript infers the new `Segment[]` type automatically from the engine types — no explicit changes needed in either file.

---

## Client — `app/routes/index.tsx`

### `Line` type becomes a discriminated union
```ts
type Line =
  | { id: number; kind: 'system'; segments: readonly Segment[] }
  | { id: number; kind: 'user' | 'witnessed'; text: string };
```

### Heuristic code deleted entirely
The following are removed: `styleForSystemSubline`, `isListLine`, `isNarrationLine`, `LIST_PREFIXES`.

### Replaced by a direct style lookup
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

### Render loop
```tsx
{l.kind === 'system'
  ? l.segments.map((seg, i) => (
      <div key={i} style={styleForSegment(seg.kind)}>{seg.text}</div>
    ))
  : <div style={{ fontStyle: l.kind === 'witnessed' ? 'italic' : 'normal' }}>{l.text}</div>
}
```

Initial line: `{ id: 0, kind: 'system', segments: initial.render }`.
On submit response: `{ id: ..., kind: 'system', segments: r.render }`.

---

## Test Migration

~15 test files assert on `result.render`. Changes are mechanical — TypeScript flags every missed callsite.

Single-segment example:
```ts
// Before:
expect(result.render).toBe('You go north.');
// After:
expect(result.render).toEqual([{ kind: SegmentKind.Feedback, text: 'You go north.' }]);
```

Multi-segment example (look):
```ts
// Before:
expect(result.render).toBe('The Square\nA busy market.\nExits: north (gate).');
// After:
expect(result.render).toEqual([
  { kind: SegmentKind.LocationName,        text: 'The Square' },
  { kind: SegmentKind.LocationDescription, text: 'A busy market.' },
  { kind: SegmentKind.ExitList,            text: 'Exits: north (gate).' },
]);
```

`templates.test.ts` changes the same way — template function return types change.

No new test infrastructure needed. All changes guided by TypeScript errors.
