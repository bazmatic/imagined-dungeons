import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { DecisionSnapshot, NpcDecision, RawPrompt } from '@core/domain/npc-decision';
import { DECISION_HISTORY_LIMIT } from '@core/domain/npc-decision';
import type { NpcDecisionRepository } from '@core/engine/npc-decision-repository';
import type { DB } from './db';
import * as schema from './schema';

export class SqliteNpcDecisionRepository implements NpcDecisionRepository {
  constructor(private readonly db: DB) {}

  async save(
    worldId: string,
    agentId: string,
    snapshot: DecisionSnapshot,
    rawPrompt: RawPrompt,
  ): Promise<void> {
    // better-sqlite3's Drizzle wrapper requires synchronous transaction callbacks,
    // so db.transaction(async tx => ...) silently drops the async work.
    // The workaround (manual BEGIN/COMMIT) exists in builder-sqlite-repository.ts
    // but adds complexity not warranted here — the insert+prune gap is a single
    // event-loop tick with no concurrent writers on this table.
    await this.db.insert(schema.npcDecisions).values({
      worldId,
      agentId,
      createdAt: new Date(),
      snapshot,
      rawPrompt,
    });

    // Prune rows beyond the limit for this agent
    const keep = await this.db
      .select({ id: schema.npcDecisions.id })
      .from(schema.npcDecisions)
      .where(
        and(
          eq(schema.npcDecisions.worldId, worldId),
          eq(schema.npcDecisions.agentId, agentId),
        ),
      )
      .orderBy(desc(schema.npcDecisions.createdAt))
      .limit(DECISION_HISTORY_LIMIT);

    const keepIds = keep.map((r) => r.id);

    if (keepIds.length === DECISION_HISTORY_LIMIT) {
      await this.db
        .delete(schema.npcDecisions)
        .where(
          and(
            eq(schema.npcDecisions.worldId, worldId),
            eq(schema.npcDecisions.agentId, agentId),
            notInArray(schema.npcDecisions.id, keepIds),
          ),
        );
    }
  }

  async list(worldId: string, agentId: string): Promise<NpcDecision[]> {
    const rows = await this.db
      .select()
      .from(schema.npcDecisions)
      .where(
        and(
          eq(schema.npcDecisions.worldId, worldId),
          eq(schema.npcDecisions.agentId, agentId),
        ),
      )
      .orderBy(desc(schema.npcDecisions.createdAt))
      .limit(DECISION_HISTORY_LIMIT);

    return rows.map((r) => ({
      id: r.id,
      worldId: r.worldId,
      agentId: r.agentId,
      createdAt: r.createdAt,
      snapshot: r.snapshot,
      rawPrompt: r.rawPrompt,
    }));
  }
}
