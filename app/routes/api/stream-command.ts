import { OwnerKind } from '@core/domain/kinds';
import { LlmGameAI, nullGameAI } from '@core/engine/game-ai';
import { runTick } from '@core/engine/tick';
import {
  TickChunkKind,
  type NpcTurnChunk,
  type PlayerTurnChunk,
} from '@core/engine/tick-stream-types';
import { SqliteNpcDecisionRepository } from '@infra/sqlite-npc-decision-repository';
import { createFileRoute } from '@tanstack/react-router';
import { buildSurroundings, type SurroundingsView } from '~/server/surroundings';
import { getBuilderRepo } from '~/server/admin/repo';
import { PLAYER_ID, getDb, getNarratorLlm, getParse, getRepo } from '~/server/world';

export type CompleteChunk = {
  kind: typeof TickChunkKind.Complete;
  inventory: Array<{ id: string; label: string; equipped: boolean }>;
  surroundings: SurroundingsView;
};

export type ErrorChunk = {
  kind: typeof TickChunkKind.Error;
  message: string;
};

export type TickStreamChunk = PlayerTurnChunk | NpcTurnChunk | CompleteChunk | ErrorChunk;

export const Route = createFileRoute('/api/stream-command')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text } = (await request.json()) as { text: string };
        const repo = await getRepo();
        const builderRepo = await getBuilderRepo();
        const db = await getDb();
        const decisionRepo = new SqliteNpcDecisionRepository(db);
        const parse = getParse();
        const rawLlm = getNarratorLlm();
        const ai = rawLlm ? new LlmGameAI(rawLlm) : nullGameAI;

        const encode = (chunk: TickStreamChunk): Uint8Array =>
          new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);

        const stream = new ReadableStream({
          async start(controller) {
            try {
              await runTick(PLAYER_ID, text, repo, {
                parse,
                ai,
                builderRepo,
                decisionRepo,
                onChunk: (chunk) => controller.enqueue(encode(chunk)),
              });
              const inventoryItems = await repo.itemsOwnedBy({
                kind: OwnerKind.Agent,
                id: PLAYER_ID,
              });
              const surroundings = await buildSurroundings(PLAYER_ID, repo);
              controller.enqueue(
                encode({
                  kind: TickChunkKind.Complete,
                  inventory: inventoryItems.map((i) => ({
                    id: i.id as string,
                    label: i.label,
                    equipped: i.equipped,
                  })),
                  surroundings,
                }),
              );
            } catch (err) {
              controller.enqueue(
                encode({
                  kind: TickChunkKind.Error,
                  message: err instanceof Error ? err.message : 'Tick failed',
                }),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      },
    },
  },
});
