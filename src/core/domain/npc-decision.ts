// src/core/domain/npc-decision.ts

import type { Direction } from './kinds';

export const DECISION_HISTORY_LIMIT = 20;

export interface DecisionSnapshot {
  readonly agentState: {
    readonly mood: string | null;
    readonly goal: string | null;
    readonly sideQuest: string | null;
  };
  readonly perception: {
    readonly locationLabel: string;
    readonly locationDescription: string;
    readonly visibleItems: readonly string[];
    readonly visibleAgents: ReadonlyArray<{ label: string; mood?: string }>;
    readonly exits: ReadonlyArray<{ direction: Direction; label: string; locked: boolean }>;
    readonly inventory: readonly string[];
    readonly unansweredAddresses: readonly string[];
  };
  readonly memory: readonly string[];
  readonly response: {
    readonly rawText: string;
    readonly thought: string | null;
    readonly sideQuestBefore: string | null;
    readonly sideQuestAfter: string | null;
    readonly actions: readonly string[];
  };
  readonly fallback: boolean;
}

export interface RawPrompt {
  readonly system: string;
  readonly user: string;
}

export interface NpcDecision {
  readonly id: number;
  readonly worldId: string;
  readonly agentId: string;
  readonly createdAt: Date;
  readonly snapshot: DecisionSnapshot;
  readonly rawPrompt: RawPrompt;
}
