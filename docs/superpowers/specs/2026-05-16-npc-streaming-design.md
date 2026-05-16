# NPC Turn Progressive Streaming

**Date:** 2026-05-16  
**Status:** Approved

## Problem

NPC turns run sequentially — each requires an LLM call followed by action execution. With up to 5 NPCs per tick, the player waits for all turns to complete before seeing any output. At ~1–3s per LLM call, that's 5–15s of silence.

## Goal

Reduce perceived wait time by streaming each NPC turn result to the client as it completes. The player sees the first NPC act immediately; subsequent NPCs trickle in. Total work is unchanged; perceived latency drops to ~1 LLM call.

## Architecture

Three layers change:

1. **`runTick` options** — add optional `onChunk` callback, called after player turn and after each NPC turn
2. **New SSE endpoint** — `/api/stream-command` runs the tick and writes chunks to a `ReadableStream`
3. **Client streaming consumer** — replaces the `submitCommand` call with a `fetch` + stream reader that renders chunks progressively

The existing `submitCommand` server function remains untouched. Tests and any non-streaming callers are unaffected.

## Chunk Types

```typescript
export const TickChunkKind = {
  PlayerTurn: 'player_turn',
  NpcTurn:    'npc_turn',
  Complete:   'complete',
  Error:      'error',
} as const;
export type TickChunkKind = (typeof TickChunkKind)[keyof typeof TickChunkKind];

type PlayerTurnChunk = { kind: typeof TickChunkKind.PlayerTurn; render: string; witnessed: SerializedEvent[] };
type NpcTurnChunk    = { kind: typeof TickChunkKind.NpcTurn;    render: string; witnessed: SerializedEvent[] };
type CompleteChunk   = { kind: typeof TickChunkKind.Complete;   inventory: InventoryItem[]; surroundings: Surroundings };
type ErrorChunk      = { kind: typeof TickChunkKind.Error;      message: string };

export type TickStreamChunk = PlayerTurnChunk | NpcTurnChunk | CompleteChunk | ErrorChunk;
```

`inventory` and `surroundings` are sent only in `complete` because they reflect the final post-tick state. The client holds the current values until `complete` arrives.

## Server Changes

### `runTick` options

Add to the existing options object:

```typescript
onChunk?: (chunk: PlayerTurnChunk | NpcTurnChunk) => void;
```

Call sites:
- After player turn resolves → `onChunk({ kind: TickChunkKind.PlayerTurn, render, witnessed })`
- After each NPC turn resolves → `onChunk({ kind: TickChunkKind.NpcTurn, render, witnessed })`

`complete` and `error` are not emitted from within `runTick` — the endpoint owns those.

### SSE endpoint

New file: `app/server/stream-command.ts`

- Route: `POST /api/stream-command`
- Body: `{ text: string }`
- Response: `Content-Type: text/event-stream`

Flow:
1. Open `ReadableStream` with a controller
2. Call `runTick` with `onChunk` writing `data: <json>\n\n` to the controller
3. After `runTick` resolves, fetch inventory and surroundings, emit `complete` chunk
4. Close the stream
5. On any thrown error: emit `error` chunk, close the stream

## Client Changes

### State

```typescript
type TickState =
  | { status: 'idle' }
  | { status: 'streaming'; chunks: (PlayerTurnChunk | NpcTurnChunk)[] }
  | { status: 'complete'; chunks: (PlayerTurnChunk | NpcTurnChunk)[]; inventory: InventoryItem[]; surroundings: Surroundings }
  | { status: 'error'; message: string };
```

### Streaming consumer

Replace the `submitCommand` call with:

```typescript
const response = await fetch('/api/stream-command', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text }),
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
// read lines, parse `data: ` prefix, dispatch TickStreamChunk to state
```

### Rendering behaviour

- `player_turn` / `npc_turn` chunks: append render text immediately
- `complete`: apply inventory and surroundings, clear any loading indicator
- Error or abrupt close before `complete`: show error message; do not apply partial inventory/surroundings

Input stays disabled while `status === 'streaming'`, same as today.

## Error Handling

| Scenario | Behaviour |
|---|---|
| LLM call throws during NPC turn | `error` chunk emitted, stream closed |
| Client disconnects mid-stream | Server stream aborts (ReadableStream cancel) |
| Stream closes before `complete` | Client detects EOF, shows error, reverts to last clean state |

## Out of Scope

- Parallelising NPC AI calls (separate decision, see brainstorm notes)
- Streaming player narration mid-sentence
- Reconnect / resume after disconnect
