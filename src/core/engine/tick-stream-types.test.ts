import { describe, expect, it } from 'vitest';
import { TickChunkKind } from './tick-stream-types';

describe('TickChunkKind', () => {
  it('has stable string values for the SSE wire protocol', () => {
    expect(TickChunkKind.PlayerTurn).toBe('player_turn');
    expect(TickChunkKind.NpcTurn).toBe('npc_turn');
    expect(TickChunkKind.Complete).toBe('complete');
    expect(TickChunkKind.Error).toBe('error');
  });
});
