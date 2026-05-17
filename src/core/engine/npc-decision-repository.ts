// src/core/engine/npc-decision-repository.ts
import type { DecisionSnapshot, NpcDecision, RawPrompt } from '@core/domain/npc-decision';

/**
 * Persistence port for NPC decision snapshots.
 * Implemented by SqliteNpcDecisionRepository (production)
 * and a test double in integration tests.
 */
export interface NpcDecisionRepository {
  save(
    worldId: string,
    agentId: string,
    snapshot: DecisionSnapshot,
    rawPrompt: RawPrompt,
  ): Promise<void>;

  /** Returns up to DECISION_HISTORY_LIMIT decisions, newest first. */
  list(worldId: string, agentId: string): Promise<NpcDecision[]>;
}
