# Segment Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub `styleForSegment` function with the full structural/typographic style for all 10 segment kinds.

**Architecture:** Single function change in `app/routes/index.tsx`. No new files, no new types, no test changes — this is pure CSS-in-JS.

**Tech Stack:** React, TypeScript, inline `React.CSSProperties` objects.

---

## File map

**Modified:**
- `app/routes/index.tsx` — `styleForSegment` function (lines ~104–112)

---

## Task 1: Update `styleForSegment`

**Files:**
- Modify: `app/routes/index.tsx`

There are no automated tests for visual styling. Verify by running the dev server and loading the game — look at a room, take an item, check inventory, trigger a parse error.

- [ ] **Step 1: Replace `styleForSegment` in `app/routes/index.tsx`**

Find this block (around line 104):

```ts
const styleForSegment = (kind: SegmentKind): React.CSSProperties => {
  switch (kind) {
    case SegmentKind.LocationName:        return { fontSize: 22, fontWeight: 600, letterSpacing: 0.5, marginTop: 12 };
    case SegmentKind.LocationDescription: return { fontStyle: 'italic' };
    case SegmentKind.Narration:           return { fontStyle: 'italic' };
    case SegmentKind.Error:               return { color: '#ff9999' };
    default:                              return {};
  }
};
```

Replace it entirely with:

```ts
const styleForSegment = (kind: SegmentKind): React.CSSProperties => {
  switch (kind) {
    case SegmentKind.LocationName:
      return { color: '#ffffff', fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 12 };
    case SegmentKind.LocationDescription:
      return { fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #333', paddingLeft: 8 };
    case SegmentKind.Narration:
      return { fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #444', paddingLeft: 8 };
    case SegmentKind.ItemList:
      return { color: '#aaaaaa', fontSize: 13 };
    case SegmentKind.CharacterList:
      return { color: '#aaaaaa', fontSize: 13 };
    case SegmentKind.ExitList:
      return { color: '#aaaaaa', fontSize: 13 };
    case SegmentKind.NoExits:
      return { color: '#666666', fontSize: 13, fontStyle: 'italic' };
    case SegmentKind.Feedback:
      return { color: '#cfcfcf', opacity: 0.8 };
    case SegmentKind.Inventory:
      return { color: '#aaaaaa', fontSize: 13, fontStyle: 'italic' };
    case SegmentKind.Error:
      return { color: '#ff9999', fontWeight: 700 };
  }
};
```

Note: the exhaustive switch with no `default` lets TypeScript warn if a new `SegmentKind` is added without a style.

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors (the existing unrelated `TemplateForm.tsx` errors are pre-existing and not caused by this change).

- [ ] **Step 3: Start the dev server and visually verify**

```bash
npm run dev
```

Open the game in a browser. Run these commands in sequence and check the visual output:

| Command | What to check |
|---|---|
| `look` | Location name is white, uppercase, bold. Description is italic with a left border. Items/exits are smaller and dimmer. |
| `take <item>` | Feedback ("Taken: …") is near-default text, slightly dimmed. |
| `inventory` | Inventory text is dimmer grey, italic, smaller. |
| `go <invalid direction>` | Error is bold red. |
| `search` | LLM narration is italic with a left border. |

- [ ] **Step 4: Commit**

```bash
git add app/routes/index.tsx
git commit -m "feat: apply structural segment styling to all 10 segment kinds"
```
