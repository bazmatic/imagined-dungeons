import { type Segment } from '@core/domain/segments';

export const TickChunkKind = {
  PlayerTurn: 'player_turn',
  NpcTurn:    'npc_turn',
  Complete:   'complete',
  Error:      'error',
} as const;
export type TickChunkKind = (typeof TickChunkKind)[keyof typeof TickChunkKind];

export type PlayerTurnChunk = {
  kind: typeof TickChunkKind.PlayerTurn;
  render: readonly Segment[];
  witnessed: readonly string[];
};

export type NpcTurnChunk = {
  kind: typeof TickChunkKind.NpcTurn;
  witnessed: readonly string[];
};
