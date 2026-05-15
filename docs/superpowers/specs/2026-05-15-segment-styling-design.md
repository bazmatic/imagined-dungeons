# Segment Styling Design

**Date:** 2026-05-15
**Status:** Approved

## Problem

The `styleForSegment` function in `app/routes/index.tsx` only styles 4 of 10 segment kinds. `Feedback`, `Inventory`, `ItemList`, `CharacterList`, `ExitList`, and `NoExits` all fall through to `{}` — identical to the default text.

## Goal

Give each segment kind a distinct visual treatment based on its semantic role so the player can scan the console output at a glance.

## Design Direction

Structural / typographic — uses weight, size, opacity, and left-border rules rather than colour. Keeps the dark terminal palette intact.

## Style Spec

| Kind | Properties |
|---|---|
| `LocationName` | `color: '#ffffff', fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 12` |
| `LocationDescription` | `fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #333', paddingLeft: 8` |
| `ItemList` | `color: '#aaaaaa', fontSize: 13` |
| `CharacterList` | `color: '#aaaaaa', fontSize: 13` |
| `ExitList` | `color: '#aaaaaa', fontSize: 13` |
| `NoExits` | `color: '#666666', fontSize: 13, fontStyle: 'italic'` |
| `Feedback` | `color: '#cfcfcf', opacity: 0.8` |
| `Narration` | `fontStyle: 'italic', color: '#cfcfcf', borderLeft: '2px solid #444', paddingLeft: 8` |
| `Inventory` | `color: '#aaaaaa', fontSize: 13, fontStyle: 'italic'` |
| `Error` | `color: '#ff9999', fontWeight: 700` |

## Rationale

- **LocationName** is the visual anchor — largest, boldest, all-caps so it reads as a heading even at a glance.
- **LocationDescription and Narration** share the left-border treatment to mark both as prose. Description uses a slightly darker border (`#333`) to feel more grounded; Narration uses `#444` to feel more ambient.
- **ItemList / CharacterList / ExitList / Inventory** are secondary info — dimmed to `#aaaaaa` and reduced to 13px so they don't compete with prose.
- **NoExits** goes further to `#666666` and italic — it is an absence, not presence.
- **Feedback** is near-invisible (`opacity: 0.8`) — mechanical confirmations don't need prominence.
- **Error** is bold red — the only element that demands attention.

## Scope

Single function change: `styleForSegment` in `app/routes/index.tsx`. No new files, no new types, no test changes needed.
