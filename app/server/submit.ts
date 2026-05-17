import { OwnerKind } from '@core/domain/kinds';
import { LlmGameAI, nullGameAI } from '@core/engine/game-ai';
import { runTick } from '@core/engine/tick';
import { SqliteNpcDecisionRepository } from '@infra/sqlite-npc-decision-repository';
import { createServerFn } from '@tanstack/react-start';
import { getBuilderRepo } from './admin/repo';
import { buildSurroundings } from './surroundings';
import { PLAYER_ID, getDb, getNarratorLlm, getParse, getRepo } from './world';

export const submitCommand = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (typeof d !== 'object' || d === null || typeof (d as { text?: unknown }).text !== 'string') {
      throw new Error('Expected { text: string }');
    }
    return d as { text: string };
  })
  .handler(async ({ data }) => {
    const repo = await getRepo();
    const builderRepo = await getBuilderRepo();
    const db = await getDb();
    const decisionRepo = new SqliteNpcDecisionRepository(db);
    const parse = getParse();
    const rawLlm = getNarratorLlm();
    const ai = rawLlm ? new LlmGameAI(rawLlm) : nullGameAI;
    const result = await runTick(PLAYER_ID, data.text, repo, { parse, ai, builderRepo, decisionRepo });
    const inventoryItems = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: PLAYER_ID });
    const surroundings = await buildSurroundings(PLAYER_ID, repo);
    return {
      render: result.render,
      witnessed: [...result.witnessed],
      inventory: inventoryItems.map((i) => ({
        id: i.id as string,
        label: i.label,
        equipped: i.equipped,
      })),
      surroundings,
    };
  });
