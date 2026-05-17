import type { NpcDecision } from '@core/domain/npc-decision';
import { SqliteNpcDecisionRepository } from '@infra/sqlite-npc-decision-repository';
import { createServerFn } from '@tanstack/react-start';
import { getAdminDb } from './repo';

const idPair = (d: unknown): { worldId: string; agentId: string } => {
  if (
    typeof d !== 'object' ||
    d === null ||
    typeof (d as { worldId?: unknown }).worldId !== 'string' ||
    typeof (d as { agentId?: unknown }).agentId !== 'string'
  ) {
    throw new Error('Expected { worldId: string, agentId: string }');
  }
  return d as { worldId: string; agentId: string };
};

export const getNpcDecisions = createServerFn({ method: 'GET' })
  .inputValidator(idPair)
  .handler(async ({ data }): Promise<NpcDecision[]> => {
    const db = await getAdminDb();
    const repo = new SqliteNpcDecisionRepository(db);
    return repo.list(data.worldId, data.agentId);
  });
