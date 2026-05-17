// src/core/domain/npc-decision.ts

export const DECISION_HISTORY_LIMIT = 20;

export interface DecisionSnapshot {
  readonly agentState: {
    readonly mood: string | null;
    readonly goal: string | null;
    readonly shortTermIntent: string | null;
  };
  readonly perception: {
    readonly locationLabel: string;
    readonly locationDescription: string;
    readonly visibleItems: string[];
    readonly visibleAgents: ReadonlyArray<{ label: string; mood?: string }>;
    readonly exits: ReadonlyArray<{ direction: string; label: string; locked: boolean }>;
    readonly inventory: string[];
    readonly unansweredAddresses: string[];
  };
  readonly memory: string[];
  readonly response: {
    readonly rawText: string;
    readonly thought: string | null;
    readonly intentBefore: string | null;
    readonly intentAfter: string | null;
    readonly actions: string[];
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
